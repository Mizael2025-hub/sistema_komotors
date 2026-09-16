import { exigirSessao } from '@/lib/auth/sessao';
import { respostaJson, ERROS, erro } from '@/lib/api/erros';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const url = new URL(request.url);
  const dias = Number(url.searchParams.get('dias') ?? 30);
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    return erro(400, 'período invalido (dias: 1 a 365).', undefined, 'E_VALIDACAO');
  }
  const liga = url.searchParams.get('liga_id');
  const ligaId = liga ? Number(liga) : null;

  try {
    const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const filtroMvt = ligaId ? { lote: { liga_id: ligaId } } : {};

    const [ligas, montes, movimentosPeriodo, movimentosSetor, contagensRecentes, lotes] = await Promise.all([
      prisma.liga_chumbo.findMany({ where: { ativo: true }, orderBy: { id: 'asc' }, select: { id: true, nome: true, cor: true } }),
      prisma.monte_chumbo.findMany({
        where: ligaId ? { lote: { liga_id: ligaId } } : {},
        select: { qtd_barras: true, status: true, lote: { select: { liga_id: true } } },
      }),
      prisma.movimentacao_chumbo.groupBy({
        by: ['tipo'],
        where: { data: { gte: inicio }, ...filtroMvt },
        _sum: { qtd_barras: true, peso: true },
      }),
      prisma.movimentacao_chumbo.groupBy({
        by: ['setor_id'],
        where: { tipo: 'MOVIMENTO_SETOR', data: { gte: inicio }, setor_id: { not: null }, ...filtroMvt },
        _sum: { qtd_barras: true, peso: true },
      }),
      prisma.contagem_chumbo.findMany({
        where: { revisada_em: { not: null }, ...(ligaId ? { liga_id: ligaId } : {}) },
        orderBy: { revisada_em: 'desc' },
        take: 200,
        include: { liga: { select: { id: true, nome: true, cor: true } } },
      }),
      prisma.lote_chumbo.findMany({
        where: ligaId ? { liga_id: ligaId } : {},
        include: {
          montes: { select: { qtd_barras: true, status: true, peso_real: true } },
          liga: { select: { nome: true } },
        },
        orderBy: { data_chegada: 'asc' },
      }),
    ]);

    /* saldo por liga (RF-D01): estoque / reservado / no setor */
    const FISICOS = new Set(['EM_ESTOQUE', 'RESERVADO', 'PARCIAL', 'NO_SETOR']);
    const saldoPorLiga = new Map<number, { liga: string; cor: string; estoque: number; reservado: number; no_setor: number; total_fisico: number }>();
    for (const l of ligas) saldoPorLiga.set(l.id, { liga: l.nome, cor: l.cor, estoque: 0, reservado: 0, no_setor: 0, total_fisico: 0 });
    for (const m of montes) {
      if (!FISICOS.has(m.status)) continue;
      const s = saldoPorLiga.get(m.lote.liga_id);
      if (!s) continue;
      if (m.status === 'RESERVADO') s.reservado += m.qtd_barras;
      else if (m.status === 'NO_SETOR') s.no_setor += m.qtd_barras;
      else s.estoque += m.qtd_barras; // EM_ESTOQUE e PARCIAL
      s.total_fisico += m.qtd_barras;
    }

    /* entradas × saídas no período */
    const entradasSaidas = movimentosPeriodo.map((g) => ({
      tipo: g.tipo,
      barras: g._sum.qtd_barras ?? 0,
      peso: g._sum.peso != null ? Number(g._sum.peso) : 0,
    }));

    /* barras/peso movidos por setor no período */
    const setoresAgg = new Map<number, { barras: number; peso: number }>();
    for (const g of movimentosSetor) {
      if (g.setor_id == null) continue;
      setoresAgg.set(g.setor_id, {
        barras: g._sum.qtd_barras ?? 0,
        peso: g._sum.peso != null ? Number(g._sum.peso) : 0,
      });
    }
    const nomesSetores = await prisma.setor.findMany({ select: { id: true, nome: true } });
    const porSetor = nomesSetores
      .filter((s) => setoresAgg.has(s.id))
      .map((s) => {
        const agg = setoresAgg.get(s.id);
        return { setor: s.nome, barras: agg?.barras ?? 0, peso: agg?.peso ?? 0 };
      });

    /* divergências de contagem: última revisão por liga (RF-CT05) */
    const ultimaDiaLiga = new Map<number, { liga: string; cor: string; data: string; divergencia: number | null }>();
    for (const c of contagensRecentes) {
      if (ultimaDiaLiga.has(c.liga.id)) continue; // já tem a mais recente (ordenado desc)
      ultimaDiaLiga.set(c.liga.id, {
        liga: c.liga.nome,
        cor: c.liga.cor,
        data: c.data.toISOString().slice(0, 10),
        divergencia: c.divergencia_sistema,
      });
    }

    /* aging de lotes: barras restantes × dias desde chegada (top 10) */
    const DISPONIVEIS = new Set(['EM_ESTOQUE', 'RESERVADO', 'PARCIAL']);
    const pesadosSet = new Set(['EM_ESTOQUE', 'RESERVADO', 'PARCIAL', 'NO_SETOR']);
    const aging = lotes
      .map((l) => {
        const barrasRestantes = l.montes.filter((m) => DISPONIVEIS.has(m.status)).reduce((s, m) => s + m.qtd_barras, 0);
        const diasDesde = Math.floor((Date.now() - l.data_chegada.getTime()) / 86400000);
        const montesLote = l.montes.length;
        const pesados = l.montes.filter((m) => m.peso_real != null).length;
        return {
          lote: l.codigo,
          liga: l.liga.nome,
          dias_desde_chegada: diasDesde,
          barras_restantes: barrasRestantes,
          peso_barras_dias: barrasRestantes * diasDesde,
          percentual_pesado: montesLote ? Math.round((pesados / montesLote) * 100) : 0,
        };
      })
      .filter((l) => l.barras_restantes > 0)
      .sort((a, b) => b.peso_barras_dias - a.peso_barras_dias)
      .slice(0, 10);

    /* percentual pesado vs estimado por lote (top 10) */
    const pesadoPorLote = lotes
      .map((l) => {
        const totalMontes = l.montes.length;
        const pesados = l.montes.filter((m) => m.peso_real != null).length;
        return {
          lote: l.codigo,
          liga: l.liga.nome,
          percentual_pesado: totalMontes ? Math.round((pesados / totalMontes) * 100) : 0,
        };
      })
      .filter((l) => l.percentual_pesado > 0)
      .sort((a, b) => b.percentual_pesado - a.percentual_pesado)
      .slice(0, 10);
    void pesadosSet;

    return respostaJson({
      periodo_dias: dias,
      saldo_por_liga: ligas.map((l) => saldoPorLiga.get(l.id)),
      entradas_saidas: entradasSaidas,
      por_setor: porSetor,
      divergencias: [...ultimaDiaLiga.values()],
      aging,
      pesado_por_lote: pesadoPorLote,
    });
  } catch (ex) {
    return ERROS.erroInterno(ex);
  }
}

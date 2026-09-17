import { prisma } from '@/lib/prisma';
import type { StatusMonte } from '@prisma/client';

export const TIPOS_RELATORIO = ['movimentacoes', 'saldo', 'contagens', 'vendas'] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

export type FiltrosRelatorio = {
  de: string; // YYYY-MM-DD (obrigatório em relatórios por período)
  ate: string; // YYYY-MM-DD (obrigatório em relatórios por período)
  liga_id?: number;
  lote_id?: number;
  tipo?: string;
  setor_id?: number;
};

export const ROTULO_TIPO_MVT: Record<string, string> = {
  ENTRADA: 'Entrada',
  RESERVA: 'Reserva',
  CANCELAMENTO_RESERVA: 'Reserva cancelada',
  MOVIMENTO_SETOR: 'Movimento ao setor',
  BAIXA_VENDA: 'Baixa/Venda',
  EDICAO: 'Edição',
  RECONCILIACAO: 'Reconciliação (sistema)',
  AJUSTE: 'Ajuste (sistema)',
};

const STATUS_DISPONIVEIS: StatusMonte[] = ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'];

export type DefRelatorio = {
  id: TipoRelatorio;
  nome: string;
  colunas: string[];
  formatos: ('xlsx' | 'pdf')[];
};

export const RELATORIOS: DefRelatorio[] = [
  { id: 'movimentacoes', nome: 'Movimentações de chumbo', colunas: ['Data', 'Tipo', 'Liga', 'Lote', 'Setor', 'Barras', 'Peso (kg)', 'Usuário'], formatos: ['xlsx', 'pdf'] },
  { id: 'saldo', nome: 'Saldo de estoque de chumbo', colunas: ['Liga', 'Lote', 'Chegada', 'Barras totais', 'Barras disponíveis', 'Peso disponível (kg)', 'No setor (barras)', 'Vendido (barras)'], formatos: ['xlsx'] },
  { id: 'contagens', nome: 'Contagens diárias e divergências', colunas: ['Data', 'Liga', 'Local', 'Apontado', 'Sistema', 'Divergência', 'Revisada em', 'Usuário'], formatos: ['xlsx', 'pdf'] },
  { id: 'vendas', nome: 'Baixas / Vendas de chumbo', colunas: ['Data', 'Liga', 'Lote', 'Destino', 'Para quem', 'Barras', 'Peso (kg)', 'Observação', 'Usuário'], formatos: ['xlsx', 'pdf'] },
];

const fmtData = (d: Date) => d.toISOString().slice(0, 10);
const fmtPeso = (n: unknown) => (n == null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(n)));
const fmtDataBr = (iso: string) => (!iso ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);

export type DadosRelatorio = { titulo: string; linhas: string[][] };

export async function gerarDados(rel: TipoRelatorio, filtros: FiltrosRelatorio): Promise<DadosRelatorio> {
  const de = new Date(`${filtros.de}T12:00:00Z`);
  const ate = new Date(`${filtros.ate}T12:00:00Z`);

  if (rel === 'movimentacoes' || rel === 'vendas') {
    const movimentos = await prisma.movimentacao_chumbo.findMany({
      where: {
        data: { gte: de, lte: ate },
        ...(rel === 'vendas' ? { tipo: 'BAIXA_VENDA' as const } : {}),
        ...(filtros.liga_id ? { lote: { liga_id: filtros.liga_id } } : {}),
        ...(filtros.lote_id ? { lote_id: filtros.lote_id } : {}),
        ...(filtros.tipo && rel === 'movimentacoes' ? { tipo: filtros.tipo as 'ENTRADA' } : {}),
        ...(filtros.setor_id ? { setor_id: filtros.setor_id } : {}),
      },
      orderBy: [{ data: 'asc' }, { created_at: 'asc' }],
      include: {
        lote: { select: { codigo: true, liga: { select: { nome: true } } } },
        setor: { select: { nome: true } },
        usuario: { select: { nome_completo: true } },
      },
    });

    const linhas = movimentos.map((m) =>
      rel === 'vendas'
        ? [fmtDataBr(fmtData(m.data)), m.lote.liga.nome, m.lote.codigo, m.destino ?? '—', m.para_quem ?? '—', String(m.qtd_barras ?? '—'), fmtPeso(m.peso), m.observacao ?? '', m.usuario?.nome_completo ?? 'Sistema']
        : [fmtDataBr(fmtData(m.data)), ROTULO_TIPO_MVT[m.tipo] ?? m.tipo, m.lote.liga.nome, m.lote.codigo, m.setor?.nome ?? '—', String(m.qtd_barras ?? '—'), fmtPeso(m.peso), m.usuario?.nome_completo ?? 'Sistema'],
    );
    return { titulo: rel === 'vendas' ? 'Baixas / Vendas de chumbo' : 'Movimentações de chumbo', linhas };
  }

  if (rel === 'saldo') {
    const ligas = await prisma.liga_chumbo.findMany({
      where: filtros.liga_id ? { id: filtros.liga_id } : { ativo: true },
      orderBy: { id: 'asc' },
      include: {
        lotes: {
          include: { montes: { select: { qtd_barras: true, peso_estimado: true, peso_real: true, status: true } } },
        },
      },
    });

    const linhas: string[][] = [];
    for (const liga of ligas) {
      for (const lote of liga.lotes) {
        let totais = 0;
        let disponivel = 0;
        let pesoDisponivel = 0;
        for (const m of lote.montes) {
          totais += m.qtd_barras;
          if (STATUS_DISPONIVEIS.includes(m.status)) {
            disponivel += m.qtd_barras;
            pesoDisponivel += Number(m.peso_real ?? m.peso_estimado ?? 0);
          }
        }
        const noSetor = await prisma.movimentacao_chumbo.aggregate({
          _sum: { qtd_barras: true },
          where: { tipo: 'MOVIMENTO_SETOR', lote_id: lote.id },
        });
        const vendido = await prisma.movimentacao_chumbo.aggregate({
          _sum: { qtd_barras: true },
          where: { tipo: 'BAIXA_VENDA', lote_id: lote.id },
        });
        linhas.push([liga.nome, lote.codigo, fmtDataBr(fmtData(lote.data_chegada)), String(totais), String(disponivel), fmtPeso(pesoDisponivel), String(noSetor._sum.qtd_barras ?? 0), String(vendido._sum.qtd_barras ?? 0)]);
      }
    }
    return { titulo: 'Saldo de estoque de chumbo', linhas };
  }

  // contagens: agrupado por data + liga (apontado vs sistema persistido na revisão)
  const apontamentos = await prisma.contagem_chumbo.findMany({
    where: {
      data: { gte: de, lte: ate },
      ...(filtros.liga_id ? { liga_id: filtros.liga_id } : {}),
    },
    orderBy: [{ data: 'asc' }, { liga_id: 'asc' }],
    include: { liga: { select: { nome: true } }, local: { select: { nome: true } }, usuario: { select: { nome_completo: true } } },
  });

  const mapa = new Map<string, { data: string; liga: string; locais: Map<string, number>; apontado: number; revisada_em: Date | null; sistema: number | null; divergencia: number | null; usuario: string }>();
  for (const a of apontamentos) {
    const dia = fmtData(a.data);
    const chave = `${dia}|${a.liga.nome}`;
    // breakdown por local dentro do grupo (data + liga) — espelha a tela de contagem
    const nomeLocal = a.local?.nome ?? 'Sem local';
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, {
        data: fmtDataBr(fmtData(a.data)),
        liga: a.liga.nome,
        locais: new Map([[nomeLocal, a.qtd_barras]]),
        apontado: a.qtd_barras,
        revisada_em: a.revisada_em,
        sistema: a.divergencia_sistema != null ? a.qtd_barras - a.divergencia_sistema : null,
        divergencia: a.divergencia_sistema,
        usuario: a.usuario.nome_completo,
      });
    } else {
      atual.apontado += a.qtd_barras;
      atual.locais.set(nomeLocal, (atual.locais.get(nomeLocal) ?? 0) + a.qtd_barras);
      if (a.revisada_em && (!atual.revisada_em || a.revisada_em > atual.revisada_em)) {
        atual.revisada_em = a.revisada_em;
        atual.sistema = a.divergencia_sistema != null ? atual.apontado - a.divergencia_sistema : null;
        atual.divergencia = a.divergencia_sistema;
      }
    }
  }

  const linhas = [...mapa.values()].map((r) => [
    r.data,
    r.liga,
    [...r.locais.entries()].map(([nome, qtd]) => `${nome}: ${qtd}`).join(' · '),
    String(r.apontado),
    r.sistema != null ? String(r.sistema) : 'sem revisão',
    r.divergencia != null ? String(r.divergencia) : '—',
    r.revisada_em ? new Date(r.revisada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—',
    r.usuario,
  ]);
  return { titulo: 'Contagens diárias e divergências', linhas };
}

export function nomeArquivo(rel: TipoRelatorio, formato: 'xlsx' | 'pdf', de: string, ate: string) {
  const sufixo = rel === 'saldo' ? `_${de}` : `_${de}_${ate}`;
  return `${rel}-chumbo${sufixo}.${formato}`;
}


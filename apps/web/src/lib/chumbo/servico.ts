import { Prisma, type StatusMonte } from '@prisma/client';
import { dataHojeLocal } from '@komotors/shared';
import { prisma } from '@/lib/prisma';
import { registrarAuditoria } from '@/lib/auditoria';
import type { Sessao } from '@/lib/auth/sessao';
import type {
  ApontamentoContagemInput,
  BaixaVendaInput,
  EdicaoApontamentoInput,
  EdicaoMonteInput,
  EntradaLoteInput,
  ExcluirApontamentoInput,
  MoverSetorInput,
  RecorteMonteInput,
  RedimensionarGradeInput,
  RevisarContagemInput,
  ReservaInput,
} from '@komotors/shared';

const D = Prisma.Decimal;
type Tx = Prisma.TransactionClient;

const DISPONIVEIS: StatusMonte[] = ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'];

export class RegraError extends Error {
  status: number;
  constructor(mensagem: string, status = 409) {
    super(mensagem);
    this.status = status;
  }
}

function pesoExibidoDe(monte: { peso_real: Prisma.Decimal | null; peso_estimado: Prisma.Decimal | null }) {
  return monte.peso_real ?? monte.peso_estimado ?? null;
}

function ehEstimado(monte: { peso_real: Prisma.Decimal | null; peso_estimado: Prisma.Decimal | null }) {
  return monte.peso_real == null && monte.peso_estimado != null;
}

function num(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(new D(d).toFixed(2));
}

function ordenarPorLiberacao<T extends { ordem_liberacao: number; linha: number; coluna: number; id: number }>(montes: T[]) {
  return [...montes].sort(
    (a, b) => a.ordem_liberacao - b.ordem_liberacao || a.linha - b.linha || a.coluna - b.coluna || a.id - b.id,
  );
}

/* Datas de negócio ("hoje") usam o fuso da fábrica — entre 21h e 00h em
   America/Sao_Paulo o UTC já virou o dia seguinte (RNF-07). */
function hojeFabrica() {
  return dataHojeLocal();
}

function dataISOparaDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

// ---------- ENTRADA (RF-E01..E07, RF-P01) ----------

export async function criarEntrada(dados: EntradaLoteInput, sessao: Sessao) {
  const dataChegada = dataISOparaDate(dados.data_chegada);

  try {
    /* Passo C — inserção agrupada: createManyAndReturn + 2 createMany (antes
       eram 3 queries SEQUENCIAIS por monte; com 8 montes a transação
       estourava o timeout default de 5s — erro P2028). Timeout com folga. */
    const lote = await prisma.$transaction(
      async (tx) => {
        const duplicado = await tx.lote_chumbo.findUnique({ where: { codigo: dados.codigo }, select: { id: true } });
        if (duplicado) throw new RegraError(`Ja existe lote "${dados.codigo}" cadastrado.`);

        const liga = await tx.liga_chumbo.findFirst({ where: { id: dados.liga_id, ativo: true } });
        if (!liga) throw new RegraError('Liga de chumbo invalida ou inativa.', 400);

        const barrasTotais = dados.montes.reduce((s, m) => s + m.qtd_barras, 0);

        /* RF-P01 (opção A, inteiros): distribuição proporcional por barra com
           COMPENSAÇÃO — N-1 montes por Math.round da proporção, o último
           estimado recebe (peso_total − soma acumulada) e a matemática fecha
           exata, sem casas decimais e sem divergência na soma final. */
        const pesoTotalNum = dados.peso_total_informado != null ? Number(dados.peso_total_informado) : null;
        const estimadosInteiros = new Map<number, number>();
        if (pesoTotalNum != null && barrasTotais > 0) {
          const semPeso = dados.montes
            .map((m, i) => ({ i, barras: m.qtd_barras }))
            .filter((x) => dados.montes[x.i].peso == null);
          let soma = 0;
          semPeso.forEach((x, k) => {
            if (k < semPeso.length - 1) {
              const p = Math.round(pesoTotalNum * (x.barras / barrasTotais));
              estimadosInteiros.set(x.i, p);
              soma += p;
            } else {
              estimadosInteiros.set(x.i, Math.max(0, pesoTotalNum - soma));
            }
          });
        }

        const novoLote = await tx.lote_chumbo.create({
          data: {
            codigo: dados.codigo,
            data_chegada: dataChegada,
            liga_id: dados.liga_id,
            fornecedor: dados.fornecedor,
            peso_total_informado: dados.peso_total_informado != null ? new D(dados.peso_total_informado) : null,
            total_barras: barrasTotais,
            total_montes: dados.montes.length,
            linhas: dados.linhas,
            colunas: dados.colunas,
          },
        });

        const montesCriados = await tx.monte_chumbo.createManyAndReturn({
          data: dados.montes.map((m, i) => {
            const pesoReal = m.peso != null ? new D(m.peso) : null;
            return {
              lote_id: novoLote.id,
              linha: m.linha,
              coluna: m.coluna,
              ordem_liberacao: m.ordem_liberacao ?? (m.linha - 1) * dados.colunas + m.coluna,
              qtd_barras: m.qtd_barras,
              peso_real: pesoReal,
              peso_estimado: pesoReal == null && estimadosInteiros.has(i) ? new D(estimadosInteiros.get(i)!) : null,
              status: 'EM_ESTOQUE' as const,
            };
          }),
        });

        await tx.movimentacao_chumbo.createMany({
          data: montesCriados.map((m) => ({
            monte_id: m.id,
            lote_id: novoLote.id,
            tipo: 'ENTRADA' as const,
            status_novo: 'EM_ESTOQUE' as const,
            qtd_barras: m.qtd_barras,
            peso: m.peso_real ?? m.peso_estimado ?? null,
            data: dataChegada,
            usuario_id: sessao.usuario_id,
          })),
        });

        await tx.log_auditoria.createMany({
          data: montesCriados.map((m) => ({
            entidade: 'monte_chumbo',
            entidade_id: m.id,
            acao: 'CRIACAO' as const,
            dados_novos: {
              lote_id: m.lote_id,
              linha: m.linha,
              coluna: m.coluna,
              ordem_liberacao: m.ordem_liberacao,
              qtd_barras: m.qtd_barras,
              peso_real: m.peso_real?.toString() ?? null,
              peso_estimado: m.peso_estimado?.toString() ?? null,
              status: m.status,
            },
            usuario_id: sessao.usuario_id,
          })),
        });

        return novoLote;
      },
      { timeout: 15_000, maxWait: 10_000 },
    );

    return lote;
  } catch (ex) {
    if (ex instanceof RegraError) throw ex;
    if (ex instanceof Prisma.PrismaClientKnownRequestError && ex.code === 'P2002') {
      throw new RegraError(`Ja existe lote "${dados.codigo}" cadastrado.`);
    }
    throw ex;
  }
}

// ---------- SALDOS (RF-S07) ----------

type LoteEstoque = Prisma.lote_chumboGetPayload<{
  include: {
    montes: {
      select: {
        id: true;
        linha: true;
        coluna: true;
        ordem_liberacao: true;
        qtd_barras: true;
        peso_real: true;
        peso_estimado: true;
        status: true;
        setor_reserva_id: true;
      };
    };
  };
}>;

type MovPorLiga = {
  no_setor: { peso: number; barras: number };
  vendido: { peso: number; barras: number };
};

/* Passo A — base única: 4 queries viajam JUNTAS num $transaction batchado
   (antes: 5 queries × N ligas disparadas pela tela de estoque). */
async function baseEstoque() {
  const [ligas, lotes, movimentos, setores] = await prisma.$transaction([
    prisma.liga_chumbo.findMany({ select: { id: true, nome: true, cor: true, ativo: true }, orderBy: { id: 'asc' } }),
    prisma.lote_chumbo.findMany({
      orderBy: { data_chegada: 'desc' },
      include: {
        montes: {
          select: {
            id: true,
            linha: true,
            coluna: true,
            ordem_liberacao: true,
            qtd_barras: true,
            peso_real: true,
            peso_estimado: true,
            status: true,
            setor_reserva_id: true,
          },
        },
      },
    }),
    prisma.movimentacao_chumbo.groupBy({
      by: ['lote_id', 'tipo'],
      _sum: { qtd_barras: true, peso: true },
      where: { tipo: { in: ['MOVIMENTO_SETOR', 'BAIXA_VENDA'] } },
      orderBy: [{ lote_id: 'asc' }],
    }),
    prisma.setor.findMany({ where: { ativo: true }, select: { id: true, nome: true } }),
  ]);

  const ligaDoLote = new Map(lotes.map((l) => [l.id, l.liga_id]));
  const movPorLiga = new Map<number, MovPorLiga>();
  for (const g of movimentos) {
    const ligaId = ligaDoLote.get(g.lote_id);
    if (ligaId == null) continue;
    const atual = movPorLiga.get(ligaId) ?? { no_setor: { peso: 0, barras: 0 }, vendido: { peso: 0, barras: 0 } };
    const balde = g.tipo === 'MOVIMENTO_SETOR' ? atual.no_setor : atual.vendido;
    balde.peso += num(g._sum?.peso) ?? 0;
    balde.barras += g._sum?.qtd_barras ?? 0;
    movPorLiga.set(ligaId, atual);
  }

  const lotesPorLiga = new Map<number, LoteEstoque[]>();
  for (const l of lotes) {
    const lista = lotesPorLiga.get(l.liga_id) ?? [];
    lista.push(l);
    lotesPorLiga.set(l.liga_id, lista);
  }

  return { ligas, lotesPorLiga, movPorLiga, setores };
}

function estoqueDeLiga(liga: { id: number; nome: string; cor: string }, lotes: LoteEstoque[], mov: MovPorLiga | undefined) {
  const montes = lotes.flatMap((l) => l.montes);

  let disponivelBarras = 0;
  let pesoDisponivel = new D(0);
  for (const m of montes) {
    if (DISPONIVEIS.includes(m.status)) {
      disponivelBarras += m.qtd_barras;
      const p = pesoExibidoDe(m);
      if (p != null) pesoDisponivel = pesoDisponivel.plus(p);
    }
  }

  const reservados = montes.filter((m) => m.status === 'RESERVADO');
  let reservadoBarras = 0;
  let pesoReservado = new D(0);
  for (const m of reservados) {
    reservadoBarras += m.qtd_barras;
    const p = pesoExibidoDe(m);
    if (p != null) pesoReservado = pesoReservado.plus(p);
  }

  return {
    liga: { id: liga.id, nome: liga.nome, cor: liga.cor },
    resumo: {
      disponivel: { peso: num(pesoDisponivel), barras: disponivelBarras },
      no_setor: { peso: mov?.no_setor.peso ?? null, barras: mov?.no_setor.barras ?? 0 },
      reservado: { peso: reservados.length ? num(pesoReservado) : null, barras: reservadoBarras },
      vendido: { peso: mov?.vendido.peso ?? null, barras: mov?.vendido.barras ?? 0 },
    },
    lotes: lotes.map((l) => {
      let barras = 0;
      let pesoLote = new D(0);
      for (const m of l.montes) {
        if (DISPONIVEIS.includes(m.status)) {
          barras += m.qtd_barras;
          const p = pesoExibidoDe(m);
          if (p != null) pesoLote = pesoLote.plus(p);
        }
      }
      return {
        id: l.id,
        codigo: l.codigo,
        data_chegada: l.data_chegada.toISOString().slice(0, 10),
        fornecedor: l.fornecedor,
        peso_total_informado: num(l.peso_total_informado),
        total_barras: l.total_barras,
        total_montes: l.total_montes,
        linhas: l.linhas,
        colunas: l.colunas,
        encerrado: !l.montes.some((m) => DISPONIVEIS.includes(m.status)),
        resumo: { peso: num(pesoLote), barras },
        montes: l.montes.map((m) => ({
          id: m.id,
          linha: m.linha,
          coluna: m.coluna,
          qtd_barras: m.qtd_barras,
          peso_exibido: num(pesoExibidoDe(m)),
          estimado: ehEstimado(m),
          status: m.status,
          setor_reserva_id: m.setor_reserva_id,
        })),
      };
    }),
  };
}

/* Estoque de todas as ligas numa única chamada — mata o N+1 do frontend. */
export async function estoqueCompleto() {
  const base = await baseEstoque();
  return {
    ligas: base.ligas.map((l) => ({ id: l.id, nome: l.nome, cor: l.cor, ativo: l.ativo })),
    setores: base.setores,
    estoques: base.ligas
      .filter((l) => l.ativo)
      .map((l) => estoqueDeLiga(l, base.lotesPorLiga.get(l.id) ?? [], base.movPorLiga.get(l.id))),
  };
}

/* Retrocompatibilidade: ?liga_id= continua funcionando com o mesmo DTO. */
export async function estoqueLiga(ligaId: number) {
  const base = await baseEstoque();
  const liga = base.ligas.find((l) => l.id === ligaId);
  if (!liga) throw new RegraError('Liga nao encontrada.', 404);
  return estoqueDeLiga(liga, base.lotesPorLiga.get(ligaId) ?? [], base.movPorLiga.get(ligaId));
}

export type EstoqueLiga = Awaited<ReturnType<typeof estoqueLiga>>;

// ---------- MONTES / AÇÕES (RF-M01..M08, RF-P02..P06) ----------

async function montesPorIds(tx: Tx, ids: number[]) {
  const montes = await tx.monte_chumbo.findMany({ where: { id: { in: ids } } });
  const achados = new Set(montes.map((m) => m.id));
  for (const id of ids) {
    if (!achados.has(id)) throw new RegraError(`Monte ${id} nao encontrado.`);
  }
  return montes;
}

async function validarMontes(tx: Tx, ids: number[], permitidos: StatusMonte[], acao: string) {
  const montes = ordenarPorLiberacao(await montesPorIds(tx, ids));
  for (const m of montes) {
    if (!permitidos.includes(m.status)) {
      throw new RegraError(
        `Monte do lote ${m.lote_id} (linha ${m.linha}, coluna ${m.coluna}) esta "${m.status.toLowerCase().replaceAll('_', ' ')}" — operacao "${acao}" exige estado: ${permitidos.join(' ou ')}. Atualize a tela e revise a selecao.`,
      );
    }
  }
  return montes;
}

type TipoMonteEditado = {
  id: number;
  lote_id: number;
  linha: number;
  coluna: number;
  ordem_liberacao: number;
  qtd_barras: number;
  peso_real: Prisma.Decimal | null;
  peso_estimado: Prisma.Decimal | null;
  status: StatusMonte;
};

export async function reservarMontes(dados: ReservaInput, sessao: Sessao) {
  const setor = await prisma.setor.findFirst({ where: { id: dados.setor_id, ativo: true } });
  if (!setor) throw new RegraError('Setor invalido ou inativo.', 400);

  const hoje = hojeFabrica();
  return prisma.$transaction(
    async (tx) => {
      const montes = await validarMontes(tx, dados.monte_ids, ['EM_ESTOQUE', 'PARCIAL'], 'Reservar');

      /* batch: todos os montes ganham o mesmo estado — 1 updateMany +
         2 createMany (antes: 3 queries sequenciais por monte). */
      await tx.monte_chumbo.updateMany({
        where: { id: { in: montes.map((m) => m.id) } },
        data: { status: 'RESERVADO', setor_reserva_id: dados.setor_id },
      });

      await tx.movimentacao_chumbo.createMany({
        data: montes.map((m) => ({
          monte_id: m.id,
          lote_id: m.lote_id,
          tipo: 'RESERVA' as const,
          status_anterior: m.status,
          status_novo: 'RESERVADO' as const,
          qtd_barras: m.qtd_barras,
          setor_id: dados.setor_id,
          observacao: dados.observacao ?? null,
          data: dataISOparaDate(hoje),
          usuario_id: sessao.usuario_id,
        })),
      });

      await tx.log_auditoria.createMany({
        data: montes.map((m) => ({
          entidade: 'monte_chumbo',
          entidade_id: m.id,
          acao: 'ATUALIZACAO' as const,
          dados_anteriores: { status: m.status, setor_reserva_id: m.setor_reserva_id },
          dados_novos: { status: 'RESERVADO', setor_reserva_id: dados.setor_id },
          usuario_id: sessao.usuario_id,
        })),
      });

      return { acao: 'RESERVA', montes: montes.map((m) => ({ id: m.id, status: 'RESERVADO' as StatusMonte })) };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

export async function cancelarReserva(dados: { monte_ids: number[]; observacao?: string }, sessao: Sessao) {
  const hoje = hojeFabrica();
  return prisma.$transaction(
    async (tx) => {
      const montes = await validarMontes(tx, dados.monte_ids, ['RESERVADO'], 'Cancelar reserva');

      await tx.monte_chumbo.updateMany({
        where: { id: { in: montes.map((m) => m.id) } },
        data: { status: 'EM_ESTOQUE', setor_reserva_id: null },
      });

      await tx.movimentacao_chumbo.createMany({
        data: montes.map((m) => ({
          monte_id: m.id,
          lote_id: m.lote_id,
          tipo: 'CANCELAMENTO_RESERVA' as const,
          status_anterior: m.status,
          status_novo: 'EM_ESTOQUE' as const,
          qtd_barras: m.qtd_barras,
          observacao: dados.observacao ?? 'Reserva cancelada',
          data: dataISOparaDate(hoje),
          usuario_id: sessao.usuario_id,
        })),
      });

      await tx.log_auditoria.createMany({
        data: montes.map((m) => ({
          entidade: 'monte_chumbo',
          entidade_id: m.id,
          acao: 'ATUALIZACAO' as const,
          dados_anteriores: { status: m.status, setor_reserva_id: m.setor_reserva_id },
          dados_novos: { status: 'EM_ESTOQUE', setor_reserva_id: null },
          usuario_id: sessao.usuario_id,
        })),
      });

      return { acao: 'CANCELAMENTO_RESERVA' };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

/* Dados de atualização do monte no exercício de fração (payload do updateMany) */
type DadosUpdateFracao = {
  qtd_barras?: number;
  status: StatusMonte;
  setor_reserva_id?: number | null;
  peso_real?: Prisma.Decimal;
  peso_estimado?: Prisma.Decimal | null;
};

type FracaoCalculada = {
  monteId: number;
  loteId: number;
  dadosUpdate: DadosUpdateFracao;
  movimentacao: {
    monte_id: number;
    lote_id: number;
    tipo: 'MOVIMENTO_SETOR' | 'BAIXA_VENDA';
    status_anterior: StatusMonte;
    status_novo: StatusMonte;
    qtd_barras: number;
    peso: Prisma.Decimal | null;
    setor_id: number | null;
    destino: string | null;
    para_quem: string | null;
    observacao: string | null;
    data: Date;
    usuario_id: number;
  };
  auditoria: {
    entidade: string;
    entidade_id: number;
    acao: 'ATUALIZACAO';
    dados_anteriores: { status: StatusMonte; qtd_barras: number };
    dados_novos: { status: StatusMonte; qtd_barras: number };
    usuario_id: number;
  };
  barrasMovidas: number;
  pesoMovido: Prisma.Decimal | null;
  novoStatus: StatusMonte;
};

/* Exercício de fração PURO — mesma matemática do exercerFracaoMonte original,
   mas sem tocar no banco: alimenta os batches (updateMany + createMany). */
function calcularFracaoMonte(
  monte: TipoMonteEditado,
  barrasMovidas: number,
  pesoInformado: Prisma.Decimal | null,
  setorId: number | null,
  sessao: Sessao,
  tipo: 'MOVIMENTO_SETOR' | 'BAIXA_VENDA',
  extras: { destino?: string; para_quem?: string; observacao?: string; dataISO: string },
): FracaoCalculada {
  const total = monte.qtd_barras;
  const parcial = barrasMovidas < total;
  const pesoBase = pesoExibidoDe(monte);

  let pesoMovido: Prisma.Decimal | null;
  if (pesoInformado != null) {
    pesoMovido = pesoInformado.toDecimalPlaces(2);
  } else if (pesoBase != null && total > 0) {
    pesoMovido = pesoBase.div(total).mul(barrasMovidas).toDecimalPlaces(2);
  } else {
    pesoMovido = null;
  }

  const novoStatus: StatusMonte = parcial ? 'PARCIAL' : (tipo === 'BAIXA_VENDA' ? 'VENDIDO' : 'NO_SETOR');

  const dadosUpdate: DadosUpdateFracao = parcial
    ? { qtd_barras: total - barrasMovidas, status: novoStatus }
    : { status: novoStatus };

  if (parcial) {
    if (pesoBase != null && pesoMovido != null) {
      const resto = pesoBase.minus(pesoMovido);
      if (resto.gte(0)) {
        if (monte.peso_real != null) dadosUpdate.peso_real = resto;
        else dadosUpdate.peso_estimado = resto;
      }
    }
  } else {
    if (tipo === 'MOVIMENTO_SETOR') dadosUpdate.setor_reserva_id = setorId;
    if (pesoInformado != null) {
      dadosUpdate.peso_real = pesoInformado;
      dadosUpdate.peso_estimado = null;
    }
    if (tipo === 'BAIXA_VENDA') dadosUpdate.setor_reserva_id = null;
  }

  return {
    monteId: monte.id,
    loteId: monte.lote_id,
    dadosUpdate,
    movimentacao: {
      monte_id: monte.id,
      lote_id: monte.lote_id,
      tipo,
      status_anterior: monte.status,
      status_novo: novoStatus,
      qtd_barras: barrasMovidas,
      peso: pesoMovido,
      setor_id: tipo === 'MOVIMENTO_SETOR' ? setorId : null,
      destino: extras.destino ?? null,
      para_quem: extras.para_quem ?? null,
      observacao: extras.observacao ?? null,
      data: dataISOparaDate(extras.dataISO),
      usuario_id: sessao.usuario_id,
    },
    auditoria: {
      entidade: 'monte_chumbo',
      entidade_id: monte.id,
      acao: 'ATUALIZACAO',
      dados_anteriores: { status: monte.status, qtd_barras: total },
      dados_novos: { status: novoStatus, qtd_barras: parcial ? total - barrasMovidas : total },
      usuario_id: sessao.usuario_id,
    },
    barrasMovidas,
    pesoMovido,
    novoStatus,
  };
}

/* Escreve os cálculos de fração em batch: updates agrupados por payload
   idêntico (1 updateMany por grupo) + createMany de movimentações e auditoria. */
async function escreverFracoes(tx: Tx, calculos: FracaoCalculada[]) {
  const grupos = new Map<string, { ids: number[]; data: DadosUpdateFracao }>();
  for (const c of calculos) {
    const chave = JSON.stringify(c.dadosUpdate);
    const g = grupos.get(chave);
    if (g) g.ids.push(c.monteId);
    else grupos.set(chave, { ids: [c.monteId], data: c.dadosUpdate });
  }
  for (const g of grupos.values()) {
    await tx.monte_chumbo.updateMany({ where: { id: { in: g.ids } }, data: g.data });
  }
  await tx.movimentacao_chumbo.createMany({ data: calculos.map((c) => c.movimentacao) });
  await tx.log_auditoria.createMany({ data: calculos.map((c) => c.auditoria) });
}

export async function moverSetorMontes(dados: MoverSetorInput, sessao: Sessao) {
  const setor = await prisma.setor.findFirst({ where: { id: dados.setor_id, ativo: true } });
  if (!setor) throw new RegraError('Setor invalido ou inativo.', 400);

  return prisma.$transaction(
    async (tx) => {
      const montes = await validarMontes(tx, dados.monte_ids, ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'], 'Mover ao setor');

      /* RF-M03/M05: peso/barras só fazem sentido para um monte por vez — com vários
         montes selecionados a ação é sempre integral (peso pela média de cada monte). */
      if (montes.length > 1 && (dados.qtd_barras != null || dados.peso_informado != null)) {
        throw new RegraError('Peso e quantidade de barras só podem ser informados para um monte por vez. Selecione apenas um monte ou mova os montes inteiros.', 400);
      }

      const pesoInformado = dados.peso_informado != null ? new D(dados.peso_informado) : null;
      const hoje = hojeFabrica();

      /* cálculo puro em memória + escrita em batch (updateMany por payload
         idêntico + createMany de movimentações/auditoria) */
      const calculos = montes.map((m) =>
        calcularFracaoMonte(
          m,
          Math.min(m.qtd_barras, dados.qtd_barras ?? m.qtd_barras),
          pesoInformado,
          dados.setor_id,
          sessao,
          'MOVIMENTO_SETOR',
          { observacao: dados.observacao, dataISO: hoje },
        ),
      );

      await escreverFracoes(tx, calculos);

      /* RF-P02/P03: pesagem real em movimento INTEGRAL dispara a reconciliação
         (mesma semântica do código anterior: parcial com peso não reconcilia) */
      if (pesoInformado != null && calculos.some((c, i) => c.barrasMovidas === montes[i].qtd_barras)) {
        const lotesAfetados = new Set(calculos.filter((c, i) => c.barrasMovidas === montes[i].qtd_barras).map((c) => c.loteId));
        for (const loteId of lotesAfetados) await reconciliarLote(tx, loteId);
      }

      return {
        acao: 'MOVIMENTO_SETOR',
        movimentacoes: calculos.map((c) => ({ monte_id: c.monteId, barras_movidas: c.barrasMovidas, peso: num(c.pesoMovido), status: c.novoStatus })),
      };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

export async function aplicarBaixaVenda(dados: BaixaVendaInput, sessao: Sessao) {
  return prisma.$transaction(
    async (tx) => {
      const montes = await validarMontes(tx, dados.monte_ids, ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'], 'Baixa/Venda');

      /* RF-M05: mesma regra do movimento — peso/barras apenas com um monte selecionado. */
      if (montes.length > 1 && (dados.qtd_barras != null || dados.peso_informado != null)) {
        throw new RegraError('Peso e quantidade de barras só podem ser informados para um monte por vez. Selecione apenas um monte ou dê baixa nos montes inteiros.', 400);
      }

      const pesoInformado = dados.peso_informado != null ? new D(dados.peso_informado) : null;

      const calculos = montes.map((m) =>
        calcularFracaoMonte(
          m,
          Math.min(m.qtd_barras, dados.qtd_barras ?? m.qtd_barras),
          pesoInformado,
          null,
          sessao,
          'BAIXA_VENDA',
          { destino: dados.destino, para_quem: dados.para_quem, observacao: dados.observacao, dataISO: dados.data },
        ),
      );

      await escreverFracoes(tx, calculos);

      /* RF-P02/P03/P05: pesagem real dispara reconciliação + ajuste residual */
      if (pesoInformado != null) {
        const lotesAfetados = new Set(calculos.map((c) => c.loteId));
        for (const loteId of lotesAfetados) await reconciliarLote(tx, loteId);
      }

      return {
        acao: 'BAIXA_VENDA',
        movimentacoes: calculos.map((c) => ({ monte_id: c.monteId, barras_movidas: c.barrasMovidas, peso: num(c.pesoMovido), status: c.novoStatus })),
      };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

// ---------- Reconciliação (RF-P02..P07) ----------

export async function reconciliarLote(tx: Tx, loteId: number) {
  const lote = await tx.lote_chumbo.findUnique({ where: { id: loteId }, include: { montes: true } });
  if (!lote || lote.peso_total_informado == null) return;

  const montes = lote.montes;
  const somaPesados = montes.reduce((acc, m) => (m.peso_real != null ? acc.plus(m.peso_real) : acc), new D(0));
  const restantes = montes.filter((m) => m.peso_real == null && m.qtd_barras > 0 && m.status !== 'VENDIDO');
  if (restantes.length > 0) {
    const barrasRestantes = restantes.reduce((s, m) => s + m.qtd_barras, 0);
    if (barrasRestantes <= 0) return;

    /* RF-P03 (opção A, inteiros): mesma distribuição com COMPENSAÇÃO —
       N-1 montes por Math.round da proporção por barra; o último fecha
       exato com (peso_restante − soma acumulada). Zero se não sobra peso. */
    const pesoRestanteNum = Math.max(0, Number(new D(lote.peso_total_informado).minus(somaPesados)));
    const estimados: number[] = [];
    let soma = 0;
    restantes.forEach((m, k) => {
      if (k < restantes.length - 1) {
        const p = Math.round(pesoRestanteNum * (m.qtd_barras / barrasRestantes));
        estimados.push(p);
        soma += p;
      } else {
        estimados.push(Math.max(0, pesoRestanteNum - soma));
      }
    });
    const detalhes: { monte_id: number; peso_estimado: number }[] = [];
    for (let k = 0; k < restantes.length; k++) {
      await tx.monte_chumbo.update({
        where: { id: restantes[k].id },
        data: { peso_estimado: new D(estimados[k]) },
      });
      detalhes.push({ monte_id: restantes[k].id, peso_estimado: estimados[k] });
    }
    await tx.movimentacao_chumbo.create({
      data: {
        lote_id: loteId,
        tipo: 'RECONCILIACAO',
        qtd_barras: barrasRestantes,
        observacao: JSON.stringify({ motivo: 'Recalculo dos pesos estimados do lote', montes: detalhes }),
        data: dataISOparaDate(hojeFabrica()),
        usuario_id: null,
      },
    });
    return;
  }

  if (montes.every((m) => m.peso_real != null)) {
    /* RF-P05: o residual é registrado uma única vez por lote — pesagens posteriores
       já são auditadas pelas movimentações EDICAO/RECONCILIACAO (append-only). */
    const jaRegistrado = await tx.movimentacao_chumbo.findFirst({ where: { lote_id: loteId, tipo: 'AJUSTE' }, select: { id: true } });
    if (jaRegistrado) return;

    const residual = new D(lote.peso_total_informado).minus(somaPesados).toDecimalPlaces(2);
    await tx.movimentacao_chumbo.create({
      data: {
        lote_id: loteId,
        tipo: 'AJUSTE',
        peso: residual,
        observacao:
          residual.isZero()
            ? 'Ajuste de arredondamento: sem diferenca residual.'
            : 'Ajuste de arredondamento: diferenca residual entre peso informado e soma dos pesos reais.',
        data: dataISOparaDate(hojeFabrica()),
        usuario_id: null,
      },
    });
  }
}

// ---------- Edição e reorganização (RF-M06, RF-P04) ----------

export async function editarMonte(dados: EdicaoMonteInput, sessao: Sessao) {
  return prisma.$transaction(async (tx) => {
    const monte = await tx.monte_chumbo.findUnique({ where: { id: dados.monte_id } });
    if (!monte) throw new RegraError('Monte nao encontrado.', 404);
    if (monte.status === 'VENDIDO') throw new RegraError('Montes vendidos nao podem ser editados.');

    const dadosUpdate: {
      qtd_barras?: number;
      peso_real?: Prisma.Decimal;
      peso_estimado?: Prisma.Decimal | null;
    } = {};
    if (dados.qtd_barras !== undefined) dadosUpdate.qtd_barras = dados.qtd_barras;
    if (dados.peso !== undefined) {
      /* edição de peso = pesagem real (RF-P02): valor autoritativo, zera o estimado */
      dadosUpdate.peso_real = new D(dados.peso);
      dadosUpdate.peso_estimado = null;
    }

    const atualizado = await tx.monte_chumbo.update({ where: { id: monte.id }, data: dadosUpdate });

    /* gatilho faltante (diagnóstico Tarefa 2b): pesagem real via edição
       reajusta os estimados do lote — mesmo recálculo de mover/venda.
       reconciliarLote é no-op para lotes sem peso_total_informado. */
    if (dados.peso !== undefined) await reconciliarLote(tx, monte.lote_id);

    const pesoAnterior = pesoExibidoDe(monte);
    const pesoNovo = pesoExibidoDe(atualizado);
    await tx.movimentacao_chumbo.create({
      data: {
        monte_id: monte.id,
        lote_id: monte.lote_id,
        tipo: 'EDICAO',
        status_anterior: monte.status,
        status_novo: atualizado.status,
        qtd_barras: dados.qtd_barras ?? monte.qtd_barras,
        peso: pesoNovo ?? pesoAnterior,
        observacao: `Edicao manual — barras: ${monte.qtd_barras} -> ${atualizado.qtd_barras}; peso: ${pesoAnterior ?? '—'} -> ${pesoNovo ?? '—'}`,
        data: dataISOparaDate(hojeFabrica()),
        usuario_id: sessao.usuario_id,
      },
    });
    await registrarAuditoria({
      entidade: 'monte_chumbo',
      entidade_id: monte.id,
      acao: 'ATUALIZACAO',
      dados_anteriores: {
        qtd_barras: monte.qtd_barras,
        peso_real: monte.peso_real?.toString() ?? null,
        peso_estimado: monte.peso_estimado?.toString() ?? null,
      },
      dados_novos: dadosUpdate,
      usuario_id: sessao.usuario_id,
      cliente: tx,
    });

    return atualizado;
  });
}

export async function reposicionarMonte(dados: RecorteMonteInput, sessao: Sessao) {
  return prisma.$transaction(async (tx) => {
    const monte = await tx.monte_chumbo.findUnique({ where: { id: dados.monte_id } });
    if (!monte) throw new RegraError('Monte nao encontrado.', 404);

    const lote = await tx.lote_chumbo.findUnique({ where: { id: monte.lote_id } });
    if (!lote) throw new RegraError('Lote nao encontrado.', 404);
    if (dados.linha > lote.linhas || dados.coluna > lote.colunas) {
      throw new RegraError('Posicao fora dos limites da grade do lote.', 400);
    }

    const ocupada = await tx.monte_chumbo.findFirst({
      where: { lote_id: monte.lote_id, linha: dados.linha, coluna: dados.coluna, NOT: { id: monte.id } },
    });
    if (ocupada) throw new RegraError('Ja existe um monte nesta posicao da grade.');

    const ordemDerivada = (monte.linha - 1) * lote.colunas + monte.coluna;
    const ordemLiberacao =
      monte.ordem_liberacao === ordemDerivada ? (dados.linha - 1) * lote.colunas + dados.coluna : monte.ordem_liberacao;

    const atualizado = await tx.monte_chumbo.update({
      where: { id: monte.id },
      data: { linha: dados.linha, coluna: dados.coluna, ordem_liberacao: ordemLiberacao },
    });

    await registrarAuditoria({
      entidade: 'monte_chumbo',
      entidade_id: monte.id,
      acao: 'ATUALIZACAO',
      dados_anteriores: { linha: monte.linha, coluna: monte.coluna, ordem_liberacao: monte.ordem_liberacao },
      dados_novos: { linha: atualizado.linha, coluna: atualizado.coluna, ordem_liberacao: atualizado.ordem_liberacao },
      usuario_id: sessao.usuario_id,
      cliente: tx,
    });
    return atualizado;
  });
}

export async function redimensionarLote(loteId: number, dados: RedimensionarGradeInput, sessao: Sessao) {
  return prisma.$transaction(async (tx) => {
    const fora = await tx.monte_chumbo.findFirst({
      where: { lote_id: loteId, OR: [{ linha: { gt: dados.linhas } }, { coluna: { gt: dados.colunas } }] },
    });
    if (fora) throw new RegraError('Existem montes em posicoes fora dos novos limites da grade.', 400);

    const anterior = await tx.lote_chumbo.findUnique({ where: { id: loteId } });
    if (!anterior) throw new RegraError('Lote nao encontrado.', 404);

    const atualizado = await tx.lote_chumbo.update({
      where: { id: loteId },
      data: { linhas: dados.linhas, colunas: dados.colunas },
    });

    await registrarAuditoria({
      entidade: 'lote_chumbo',
      entidade_id: loteId,
      acao: 'ATUALIZACAO',
      dados_anteriores: { linhas: anterior.linhas, colunas: anterior.colunas },
      dados_novos: dados,
      usuario_id: sessao.usuario_id,
      cliente: tx,
    });
    return atualizado;
  });
}

// ---------- Histórico (RF-S06, RF-AU03) ----------

export async function historicoMonte(monteId: number) {
  const monte = await prisma.monte_chumbo.findUnique({
    where: { id: monteId },
    include: { lote: { include: { liga: true } }, setor_reserva: true },
  });
  if (!monte) throw new RegraError('Monte nao encontrado.', 404);

  const movimentacoes = await prisma.movimentacao_chumbo.findMany({
    where: { monte_id: monteId },
    orderBy: { created_at: 'desc' },
    include: { setor: { select: { nome: true } }, usuario: { select: { nome_completo: true } } },
  });

  return {
    monte: {
      id: monte.id,
      status: monte.status,
      linha: monte.linha,
      coluna: monte.coluna,
      qtd_barras: monte.qtd_barras,
      peso_exibido: num(pesoExibidoDe(monte)),
      estimado: ehEstimado(monte),
      lote: { id: monte.lote.id, codigo: monte.lote.codigo, liga: { nome: monte.lote.liga.nome, cor: monte.lote.liga.cor } },
      setor_reserva: monte.setor_reserva?.nome ?? null,
    },
    movimentacoes: movimentacoes.map((mv) => ({
      id: mv.id,
      tipo: mv.tipo,
      status_anterior: mv.status_anterior,
      status_novo: mv.status_novo,
      qtd_barras: mv.qtd_barras,
      peso: num(mv.peso),
      setor: mv.setor?.nome ?? null,
      destino: mv.destino,
      para_quem: mv.para_quem,
      observacao: mv.observacao,
      data: mv.data.toISOString().slice(0, 10),
      criado_em: mv.created_at,
      usuario: mv.usuario?.nome_completo ?? 'Sistema',
    })),
  };
}

// ---------- Contagem diária (RF-CT01..CT05, seção 20.7) ----------

const STATUS_FISICOS: StatusMonte[] = ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL', 'NO_SETOR'];

function dataDe(iso: string) {
  return dataISOparaDate(iso);
}

function dataISODe(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function apontamentosDoDia(dataISO: string) {
  return prisma.contagem_chumbo.findMany({
    where: { data: dataDe(dataISO) },
    orderBy: [{ liga_id: 'asc' }, { created_at: 'desc' }],
    include: {
      liga: { select: { id: true, nome: true, cor: true } },
      lote: { select: { id: true, codigo: true } },
      local: { select: { id: true, nome: true } },
      usuario: { select: { nome_completo: true } },
    },
  });
}

export type ContagemDia = Awaited<ReturnType<typeof contagemDoDia>>;

export async function contagemDoDia(dataISO: string) {
  const apontamentos = await apontamentosDoDia(dataISO);

  const ligas = await prisma.liga_chumbo.findMany({
    where: { ativo: true },
    orderBy: { id: 'asc' },
    select: { id: true, nome: true, cor: true },
  });

  const montes = await prisma.monte_chumbo.groupBy({
    by: ['lote_id'],
    where: { status: { in: STATUS_FISICOS } },
    _sum: { qtd_barras: true },
  });
  const lotes = montes.length
    ? await prisma.lote_chumbo.findMany({ where: { id: { in: montes.map((m) => m.lote_id) } }, select: { id: true, liga_id: true } })
    : [];
  const sistemaPorLiga = new Map<number, number>();
  for (const m of montes) {
    const lote = lotes.find((l) => l.id === m.lote_id);
    if (!lote) continue;
    sistemaPorLiga.set(lote.liga_id, (sistemaPorLiga.get(lote.liga_id) ?? 0) + (m._sum.qtd_barras ?? 0));
  }

  const totaisPorLiga = ligas
    .filter((l) => apontamentos.some((a) => a.liga_id === l.id) || sistemaPorLiga.get(l.id))
    .map((l) => {
      const apontado = apontamentos.filter((a) => a.liga_id === l.id).reduce((s, a) => s + a.qtd_barras, 0);
      const sistema = sistemaPorLiga.get(l.id) ?? 0;
      return {
        liga: { id: l.id, nome: l.nome, cor: l.cor },
        apontado,
        sistema,
        divergencia: apontado - sistema,
        revisada_em: apontamentos.find((a) => a.liga_id === l.id)?.revisada_em ?? null,
      };
    });

  return {
    data: dataISO,
    apontamentos: apontamentos.map((a) => ({
      id: a.id,
      data: dataISODe(a.data),
      liga: { id: a.liga.id, nome: a.liga.nome, cor: a.liga.cor },
      qtd_barras: a.qtd_barras,
      lote: a.lote ? { id: a.lote.id, codigo: a.lote.codigo } : null,
      local: a.local ? { id: a.local.id, nome: a.local.nome } : null,
      observacao: a.observacao,
      divergencia_sistema: a.divergencia_sistema,
      revisada_em: a.revisada_em,
      criado_em: a.created_at,
      usuario: a.usuario.nome_completo,
    })),
    totais: totaisPorLiga,
  };
}

export async function registrarApontamento(dados: ApontamentoContagemInput, sessao: Sessao) {
  const apontamento = await prisma.$transaction(async (tx) => {
    const liga = await tx.liga_chumbo.findFirst({ where: { id: dados.liga_id, ativo: true } });
    if (!liga) throw new RegraError('Liga de chumbo invalida ou inativa.', 400);

    if (dados.lote_id != null) {
      const lote = await tx.lote_chumbo.findFirst({ where: { id: dados.lote_id, liga_id: dados.liga_id }, select: { id: true } });
      if (!lote) throw new RegraError('O lote informado nao pertence a liga escolhida.', 400);
    }

    if (dados.setor_id != null) {
      const setor = await tx.setor.findFirst({ where: { id: dados.setor_id, ativo: true }, select: { id: true } });
      if (!setor) throw new RegraError('Local (setor) invalido ou inativo.', 400);
    }

    const criado = await tx.contagem_chumbo.create({
      data: {
        data: dataDe(dados.data),
        liga_id: dados.liga_id,
        qtd_barras: dados.qtd_barras,
        lote_id: dados.lote_id ?? null,
        setor_id: dados.setor_id ?? null,
        observacao: dados.observacao ?? null,
        usuario_id: sessao.usuario_id,
      },
    });

    await registrarAuditoria({
      entidade: 'contagem_chumbo',
      entidade_id: criado.id,
      acao: 'CRIACAO',
      dados_novos: { data: dados.data, liga_id: dados.liga_id, qtd_barras: dados.qtd_barras, lote_id: dados.lote_id ?? null, setor_id: dados.setor_id ?? null, observacao: dados.observacao ?? null },
      usuario_id: sessao.usuario_id,
      cliente: tx,
    });
    return criado;
  });
  return { id: apontamento.id };
}

export async function editarApontamento(dados: EdicaoApontamentoInput, sessao: Sessao) {
  const atualizado = await prisma.$transaction(async (tx) => {
    const registro = await tx.contagem_chumbo.findUnique({
      where: { id: dados.apontamento_id },
      include: { lote: { select: { id: true, liga_id: true } } },
    });
    if (!registro) throw new RegraError('Apontamento nao encontrado.', 404);
    if (dataISODe(registro.data) !== hojeFabrica()) throw new RegraError('Só é possível alterar apontamentos do dia atual.', 409);

    if (dados.lote_id != null && dados.lote_id !== registro.lote_id) {
      const ligaIdLote = (await tx.lote_chumbo.findUnique({ where: { id: dados.lote_id }, select: { liga_id: true } }))?.liga_id;
      if (ligaIdLote !== registro.liga_id) throw new RegraError('O lote informado nao pertence a liga do apontamento.', 400);
    }

    if (dados.setor_id != null) {
      const setor = await tx.setor.findFirst({ where: { id: dados.setor_id, ativo: true }, select: { id: true } });
      if (!setor) throw new RegraError('Local (setor) invalido ou inativo.', 400);
    }

    const anteriores = {
      qtd_barras: registro.qtd_barras,
      lote_id: registro.lote_id,
      setor_id: registro.setor_id,
      observacao: registro.observacao,
    };
    const novos = {
      qtd_barras: dados.qtd_barras ?? registro.qtd_barras,
      lote_id: dados.lote_id === undefined ? registro.lote_id : dados.lote_id,
      setor_id: dados.setor_id === undefined ? registro.setor_id : dados.setor_id,
      observacao: dados.observacao === undefined ? registro.observacao : dados.observacao,
    };
    // edição gera nova revisão — divergências anteriores ficam desatualizadas
    const editado = await tx.contagem_chumbo.update({
      where: { id: registro.id },
      data: { ...novos, divergencia_sistema: null, revisada_em: null },
    });

    const mudou = novos.qtd_barras !== anteriores.qtd_barras || novos.lote_id !== anteriores.lote_id || novos.setor_id !== anteriores.setor_id || novos.observacao !== anteriores.observacao;
    if (mudou) {
      await registrarAuditoria({
        entidade: 'contagem_chumbo',
        entidade_id: registro.id,
        acao: 'ATUALIZACAO',
        dados_anteriores: anteriores,
        dados_novos: novos,
        usuario_id: sessao.usuario_id,
        cliente: tx,
      });
    }
    return editado;
  });
  return { id: atualizado.id };
}

export async function excluirApontamento(dados: ExcluirApontamentoInput, sessao: Sessao) {
  await prisma.$transaction(async (tx) => {
    const registro = await tx.contagem_chumbo.findUnique({
      where: { id: dados.apontamento_id },
      include: { liga: { select: { nome: true } } },
    });
    if (!registro) throw new RegraError('Apontamento nao encontrado.', 404);
    if (dataISODe(registro.data) !== hojeFabrica()) throw new RegraError('Só é possível excluir apontamentos do dia atual.', 409);

    await tx.contagem_chumbo.delete({ where: { id: registro.id } });

    await registrarAuditoria({
      entidade: 'contagem_chumbo',
      entidade_id: registro.id,
      acao: 'EXCLUSAO',
      dados_anteriores: {
        data: dataISODe(registro.data),
        liga: registro.liga.nome,
        qtd_barras: registro.qtd_barras,
        observacao: registro.observacao,
      },
      usuario_id: sessao.usuario_id,
      cliente: tx,
    });
  });
  return {} as const;
}

export async function revisarContagem(dados: RevisarContagemInput, sessao: Sessao) {
  return prisma.$transaction(async (tx) => {
    const apontamentos = await tx.contagem_chumbo.findMany({
      where: { data: dataDe(dados.data) },
      include: { liga: { select: { id: true, nome: true, cor: true } } },
    });
    if (apontamentos.length === 0) throw new RegraError('Nenhum apontamento nessa data para revisar.', 404);

    const montes = await tx.monte_chumbo.groupBy({
      by: ['lote_id'],
      where: { status: { in: STATUS_FISICOS } },
      _sum: { qtd_barras: true },
    });
    const lotes = montes.length
      ? await tx.lote_chumbo.findMany({ where: { id: { in: montes.map((m) => m.lote_id) } }, select: { id: true, liga_id: true } })
      : [];
    const sistemaPorLiga = new Map<number, number>();
    for (const m of montes) {
      const lote = lotes.find((l) => l.id === m.lote_id);
      if (!lote) continue;
      sistemaPorLiga.set(lote.liga_id, (sistemaPorLiga.get(lote.liga_id) ?? 0) + (m._sum.qtd_barras ?? 0));
    }

    const ligasDoDia = [...new Set(apontamentos.map((a) => a.liga))];
    const divergencias = [];
    for (const liga of ligasDoDia) {
      const apontado = apontamentos.filter((a) => a.liga_id === liga.id).reduce((s, a) => s + a.qtd_barras, 0);
      const sistema = sistemaPorLiga.get(liga.id) ?? 0;
      const divergencia = apontado - sistema;
      const idsLiga = apontamentos.filter((a) => a.liga_id === liga.id).map((a) => a.id);
      await tx.contagem_chumbo.updateMany({
        where: { id: { in: idsLiga }, data: dataDe(dados.data) },
        data: { divergencia_sistema: divergencia, revisada_em: new Date() },
      });
      divergencias.push({ liga: { id: liga.id, nome: liga.nome, cor: liga.cor }, apontado, sistema: sistemaPorLiga.get(liga.id) ?? 0, divergencia });

      await registrarAuditoria({
        entidade: 'contagem_chumbo',
        entidade_id: idsLiga[0],
        acao: 'ATUALIZACAO',
        dados_novos: {
          revisao: `divergencia liga ${liga.nome} em ${dados.data}`,
          apontado,
          sistema: sistemaPorLiga.get(liga.id) ?? 0,
          divergencia,
        },
        usuario_id: sessao.usuario_id,
        cliente: tx,
      });
    }
    return { data: dados.data, divergencias };
  });
}

/* últimos N dias com contagem — usado pelo "Comparar com outro dia" */
export async function resumoContagens(dias: number) {
  // baseia a janela no "hoje" da fábrica (mesma âncora das datas persistidas)
  const inicio = dataISOparaDate(hojeFabrica());
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));

  const grupos = await prisma.contagem_chumbo.groupBy({
    by: ['data'],
    where: { data: { gte: inicio } },
    _sum: { qtd_barras: true },
    _count: { _all: true },
    orderBy: { data: 'desc' },
  });

  return {
    dias: grupos.map((g) => ({
      data: dataISODe(g.data),
      total_barras: g._sum.qtd_barras ?? 0,
      apontamentos: g._count._all,
    })),
  };
}

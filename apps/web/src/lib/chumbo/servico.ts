import { Prisma, type StatusMonte } from '@prisma/client';
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

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function dataISOparaDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

// ---------- ENTRADA (RF-E01..E07, RF-P01) ----------

export async function criarEntrada(dados: EntradaLoteInput, sessao: Sessao) {
  const dataChegada = dataISOparaDate(dados.data_chegada);

  try {
    const lote = await prisma.$transaction(async (tx) => {
      const duplicado = await tx.lote_chumbo.findUnique({ where: { codigo: dados.codigo }, select: { id: true } });
      if (duplicado) throw new RegraError(`Ja existe lote "${dados.codigo}" cadastrado.`);

      const liga = await tx.liga_chumbo.findFirst({ where: { id: dados.liga_id, ativo: true } });
      if (!liga) throw new RegraError('Liga de chumbo invalida ou inativa.', 400);

      const barrasTotais = dados.montes.reduce((s, m) => s + m.qtd_barras, 0);
      const pesoPorBarra = dados.peso_total_informado != null ? new D(dados.peso_total_informado).div(barrasTotais) : null;

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

      for (const m of dados.montes) {
        const pesoReal = m.peso != null ? new D(m.peso) : null;
        const pesoEstimado =
          pesoReal == null && pesoPorBarra != null ? pesoPorBarra.mul(m.qtd_barras).toDecimalPlaces(2) : null;
        const ordem = m.ordem_liberacao ?? (m.linha - 1) * dados.colunas + m.coluna;

        const monte = await tx.monte_chumbo.create({
          data: {
            lote_id: novoLote.id,
            linha: m.linha,
            coluna: m.coluna,
            ordem_liberacao: ordem,
            qtd_barras: m.qtd_barras,
            peso_real: pesoReal,
            peso_estimado: pesoEstimado,
            status: 'EM_ESTOQUE',
          },
        });

        await tx.movimentacao_chumbo.create({
          data: {
            monte_id: monte.id,
            lote_id: novoLote.id,
            tipo: 'ENTRADA',
            status_novo: 'EM_ESTOQUE',
            qtd_barras: m.qtd_barras,
            peso: pesoReal ?? pesoEstimado ?? null,
            data: dataChegada,
            usuario_id: sessao.usuario_id,
          },
        });

        await registrarAuditoria({
          entidade: 'monte_chumbo',
          entidade_id: monte.id,
          acao: 'CRIACAO',
          dados_novos: monte,
          usuario_id: sessao.usuario_id,
          cliente: tx,
        });
      }

      return novoLote;
    });

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

export async function estoqueLiga(ligaId: number) {
  const liga = await prisma.liga_chumbo.findUnique({ where: { id: ligaId } });
  if (!liga) throw new RegraError('Liga nao encontrada.', 404);

  const lotes = await prisma.lote_chumbo.findMany({
    where: { liga_id: ligaId },
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
  });

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

  const noSetor = await prisma.movimentacao_chumbo.aggregate({
    _sum: { qtd_barras: true, peso: true },
    where: { tipo: 'MOVIMENTO_SETOR', lote: { liga_id: ligaId } },
  });
  const vendido = await prisma.movimentacao_chumbo.aggregate({
    _sum: { qtd_barras: true, peso: true },
    where: { tipo: 'BAIXA_VENDA', lote: { liga_id: ligaId } },
  });

  const setores = await prisma.setor.findMany({ where: { ativo: true }, select: { id: true, nome: true } });

  return {
    liga: { id: liga.id, nome: liga.nome, cor: liga.cor },
    resumo: {
      disponivel: { peso: num(pesoDisponivel), barras: disponivelBarras },
      no_setor: { peso: num(noSetor._sum.peso ?? null), barras: noSetor._sum.qtd_barras ?? 0 },
      reservado: { peso: reservados.length ? num(pesoReservado) : null, barras: reservadoBarras },
      vendido: { peso: num(vendido._sum.peso ?? null), barras: vendido._sum.qtd_barras ?? 0 },
    },
    setores,
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

export type EstoqueLiga = Prisma.PromiseReturnType<typeof estoqueLiga>;

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

async function registrarMovimento(
  tx: Tx,
  monte: TipoMonteEditado,
  dados: {
    tipo: 'MOVIMENTO_SETOR' | 'BAIXA_VENDA' | 'RESERVA' | 'CANCELAMENTO_RESERVA' | 'EDICAO';
    status_anterior: StatusMonte;
    status_novo: StatusMonte;
    qtd_barras?: number | null;
    peso?: Prisma.Decimal | null;
    setor_id?: number | null;
    destino?: string | null;
    para_quem?: string | null;
    observacao?: string | null;
    dataISO: string;
    usuario_id: number;
  },
) {
  await tx.movimentacao_chumbo.create({
    data: {
      monte_id: monte.id,
      lote_id: monte.lote_id,
      tipo: dados.tipo,
      status_anterior: dados.status_anterior,
      status_novo: dados.status_novo,
      qtd_barras: dados.qtd_barras ?? monte.qtd_barras,
      peso: dados.peso ?? null,
      setor_id: dados.setor_id ?? null,
      destino: dados.destino ?? null,
      para_quem: dados.para_quem ?? null,
      observacao: dados.observacao ?? null,
      data: dataISOparaDate(dados.dataISO),
      usuario_id: dados.usuario_id,
    },
  });
}

export async function reservarMontes(dados: ReservaInput, sessao: Sessao) {
  const setor = await prisma.setor.findFirst({ where: { id: dados.setor_id, ativo: true } });
  if (!setor) throw new RegraError('Setor invalido ou inativo.', 400);

  return prisma.$transaction(async (tx) => {
    const montes = await validarMontes(tx, dados.monte_ids, ['EM_ESTOQUE', 'PARCIAL'], 'Reservar');
    const resultado: { id: number; status: StatusMonte }[] = [];
    for (const m of montes) {
      const atualizado = await tx.monte_chumbo.update({
        where: { id: m.id },
        data: { status: 'RESERVADO', setor_reserva_id: dados.setor_id },
      });
      await registrarMovimento(tx, m, {
        tipo: 'RESERVA',
        status_anterior: m.status,
        status_novo: 'RESERVADO',
        setor_id: dados.setor_id,
        observacao: dados.observacao ?? null,
        dataISO: hojeISO(),
        usuario_id: sessao.usuario_id,
      });
      await registrarAuditoria({
        entidade: 'monte_chumbo',
        entidade_id: m.id,
        acao: 'ATUALIZACAO',
        dados_anteriores: { status: m.status, setor_reserva_id: m.setor_reserva_id },
        dados_novos: { status: 'RESERVADO', setor_reserva_id: dados.setor_id },
        usuario_id: sessao.usuario_id,
        cliente: tx,
      });
      resultado.push({ id: m.id, status: atualizado.status });
    }
    return { acao: 'RESERVA', montes: resultado };
  });
}

export async function cancelarReserva(dados: { monte_ids: number[]; observacao?: string }, sessao: Sessao) {
  return prisma.$transaction(async (tx) => {
    const montes = await validarMontes(tx, dados.monte_ids, ['RESERVADO'], 'Cancelar reserva');
    for (const m of montes) {
      await tx.monte_chumbo.update({
        where: { id: m.id },
        data: { status: 'EM_ESTOQUE', setor_reserva_id: null },
      });
      await registrarMovimento(tx, m, {
        tipo: 'CANCELAMENTO_RESERVA',
        status_anterior: m.status,
        status_novo: 'EM_ESTOQUE',
        observacao: dados.observacao ?? 'Reserva cancelada',
        dataISO: hojeISO(),
        usuario_id: sessao.usuario_id,
      });
      await registrarAuditoria({
        entidade: 'monte_chumbo',
        entidade_id: m.id,
        acao: 'ATUALIZACAO',
        dados_anteriores: { status: m.status, setor_reserva_id: m.setor_reserva_id },
        dados_novos: { status: 'EM_ESTOQUE', setor_reserva_id: null },
        usuario_id: sessao.usuario_id,
        cliente: tx,
      });
    }
    return { acao: 'CANCELAMENTO_RESERVA' };
  });
}

async function exercerFracaoMonte(
  tx: Tx,
  monte: TipoMonteEditado,
  barrasMovidas: number,
  pesoInformado: Prisma.Decimal | null,
  setorId: number | null,
  sessao: Sessao,
  tipo: 'MOVIMENTO_SETOR' | 'BAIXA_VENDA',
  extras: { destino?: string; para_quem?: string; observacao?: string; dataISO: string },
) {
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

  if (parcial) {
    const dadosUpdate: {
      qtd_barras: number;
      status: StatusMonte;
      peso_real?: Prisma.Decimal;
      peso_estimado?: Prisma.Decimal;
    } = { qtd_barras: total - barrasMovidas, status: novoStatus };
    if (pesoBase != null && pesoMovido != null) {
      const resto = pesoBase.minus(pesoMovido);
      if (resto.gte(0)) {
        if (monte.peso_real != null) dadosUpdate.peso_real = resto;
        else dadosUpdate.peso_estimado = resto;
      }
    }
    await tx.monte_chumbo.update({ where: { id: monte.id }, data: dadosUpdate });
  } else {
    const dadosUpdate: { status: StatusMonte; setor_reserva_id?: number | null; peso_real?: Prisma.Decimal; peso_estimado?: Prisma.Decimal | null } = {
      status: novoStatus,
    };
    if (tipo === 'MOVIMENTO_SETOR') dadosUpdate.setor_reserva_id = setorId;
    if (pesoInformado != null) {
      dadosUpdate.peso_real = pesoInformado;
      dadosUpdate.peso_estimado = null;
    }
    if (tipo === 'BAIXA_VENDA') dadosUpdate.setor_reserva_id = null;
    await tx.monte_chumbo.update({ where: { id: monte.id }, data: dadosUpdate });
  }

  await tx.movimentacao_chumbo.create({
    data: {
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
  });

  await registrarAuditoria({
    entidade: 'monte_chumbo',
    entidade_id: monte.id,
    acao: 'ATUALIZACAO',
    dados_anteriores: { status: monte.status, qtd_barras: total },
    dados_novos: { status: novoStatus, qtd_barras: parcial ? total - barrasMovidas : total },
    usuario_id: sessao.usuario_id,
    cliente: tx,
  });

  return { barrasMovidas, pesoMovido, novoStatus };
}

export async function moverSetorMontes(dados: MoverSetorInput, sessao: Sessao) {
  const setor = await prisma.setor.findFirst({ where: { id: dados.setor_id, ativo: true } });
  if (!setor) throw new RegraError('Setor invalido ou inativo.', 400);

  return prisma.$transaction(async (tx) => {
    const montes = await validarMontes(tx, dados.monte_ids, ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'], 'Mover ao setor');
    const resultado: { monte_id: number; barras_movidas: number; peso: number | null; status: StatusMonte }[] = [];
    const lotesAfetados = new Set<number>();
    let houvePesagemReal = false;

    for (const m of montes) {
      const movidas = Math.min(m.qtd_barras, dados.qtd_barras ?? m.qtd_barras);
      const pesoInformado = dados.peso_informado != null ? new D(dados.peso_informado) : null;
      const r = await exercerFracaoMonte(tx, m, movidas, pesoInformado, dados.setor_id, sessao, 'MOVIMENTO_SETOR', {
        observacao: dados.observacao,
        dataISO: hojeISO(),
      });
      if (pesoInformado != null && movidas === m.qtd_barras) houvePesagemReal = true;
      lotesAfetados.add(m.lote_id);
      resultado.push({ monte_id: m.id, barras_movidas: movidas, peso: num(r.pesoMovido), status: r.novoStatus });
    }

    if (houvePesagemReal) {
      for (const loteId of lotesAfetados) await reconciliarLote(tx, loteId);
    }

    return { acao: 'MOVIMENTO_SETOR', movimentacoes: resultado };
  });
}

export async function aplicarBaixaVenda(dados: BaixaVendaInput, sessao: Sessao) {
  return prisma.$transaction(async (tx) => {
    const montes = await validarMontes(tx, dados.monte_ids, ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'], 'Baixa/Venda');
    const resultado: { monte_id: number; barras_movidas: number; peso: number | null; status: StatusMonte }[] = [];
    const lotesAfetados = new Set<number>();
    let houvePesagemReal = false;

    for (const m of montes) {
      const movidas = Math.min(m.qtd_barras, dados.qtd_barras ?? m.qtd_barras);
      const pesoInformado = dados.peso_informado != null ? new D(dados.peso_informado) : null;
      const r = await exercerFracaoMonte(tx, m, movidas, pesoInformado, null, sessao, 'BAIXA_VENDA', {
        destino: dados.destino,
        para_quem: dados.para_quem,
        observacao: dados.observacao,
        dataISO: dados.data,
      });
      if (pesoInformado != null) houvePesagemReal = true;
      lotesAfetados.add(m.lote_id);
      resultado.push({ monte_id: m.id, barras_movidas: movidas, peso: num(r.pesoMovido), status: r.novoStatus });
    }

    if (houvePesagemReal) {
      for (const loteId of lotesAfetados) await reconciliarLote(tx, loteId);
    }

    return { acao: 'BAIXA_VENDA', movimentacoes: resultado };
  });
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

    const pesoRestante = new D(lote.peso_total_informado).minus(somaPesados);
    const mediaBarra = pesoRestante.lte(0) ? new D(0) : pesoRestante.div(barrasRestantes);
    const detalhes: { monte_id: number; peso_estimado: number }[] = [];
    for (const m of restantes) {
      const novoEstimado = mediaBarra.mul(m.qtd_barras).toDecimalPlaces(2);
      await tx.monte_chumbo.update({
        where: { id: m.id },
        data: { peso_estimado: novoEstimado.lte(0) ? new D(0) : novoEstimado },
      });
      detalhes.push({ monte_id: m.id, peso_estimado: num(novoEstimado) ?? 0 });
    }
    await tx.movimentacao_chumbo.create({
      data: {
        lote_id: loteId,
        tipo: 'RECONCILIACAO',
        qtd_barras: barrasRestantes,
        observacao: JSON.stringify({ motivo: 'Recalculo dos pesos estimados do lote', montes: detalhes }),
        data: dataISOparaDate(hojeISO()),
        usuario_id: null,
      },
    });
    return;
  }

  if (montes.every((m) => m.peso_real != null)) {
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
        data: dataISOparaDate(hojeISO()),
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
      peso_estimado?: Prisma.Decimal;
    } = {};
    if (dados.qtd_barras !== undefined) dadosUpdate.qtd_barras = dados.qtd_barras;
    if (dados.peso !== undefined) {
      if (monte.peso_real != null) dadosUpdate.peso_real = new D(dados.peso);
      else dadosUpdate.peso_estimado = new D(dados.peso);
    }

    const atualizado = await tx.monte_chumbo.update({ where: { id: monte.id }, data: dadosUpdate });

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
        data: dataISOparaDate(hojeISO()),
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
  try {
    const apontamento = await prisma.$transaction(async (tx) => {
      const liga = await tx.liga_chumbo.findFirst({ where: { id: dados.liga_id, ativo: true } });
      if (!liga) throw new RegraError('Liga de chumbo invalida ou inativa.', 400);

      if (dados.lote_id != null) {
        const lote = await tx.lote_chumbo.findFirst({ where: { id: dados.lote_id, liga_id: dados.liga_id }, select: { id: true } });
        if (!lote) throw new RegraError('O lote informado nao pertence a liga escolhida.', 400);
      }

      const criado = await tx.contagem_chumbo.create({
        data: {
          data: dataDe(dados.data),
          liga_id: dados.liga_id,
          qtd_barras: dados.qtd_barras,
          lote_id: dados.lote_id ?? null,
          observacao: dados.observacao ?? null,
          usuario_id: sessao.usuario_id,
        },
      });

      await registrarAuditoria({
        entidade: 'contagem_chumbo',
        entidade_id: criado.id,
        acao: 'CRIACAO',
        dados_novos: { data: dados.data, liga_id: dados.liga_id, qtd_barras: dados.qtd_barras, lote_id: dados.lote_id ?? null, observacao: dados.observacao ?? null },
        usuario_id: sessao.usuario_id,
        cliente: tx,
      });
      return criado;
    });
    return { id: apontamento.id };
  } catch (ex) {
    if (ex instanceof RegraError) throw ex;
    throw ex;
  }
}

export async function editarApontamento(dados: EdicaoApontamentoInput, sessao: Sessao) {
  try {
    const atualizado = await prisma.$transaction(async (tx) => {
      const registro = await tx.contagem_chumbo.findUnique({
        where: { id: dados.apontamento_id },
        include: { lote: { select: { id: true, liga_id: true } } },
      });
      if (!registro) throw new RegraError('Apontamento nao encontrado.', 404);
      if (dataISODe(registro.data) !== hojeISO()) throw new RegraError('Só é possível alterar apontamentos do dia atual.', 409);

      if (dados.lote_id != null && dados.lote_id !== registro.lote_id) {
        const ligaIdLote = (await tx.lote_chumbo.findUnique({ where: { id: dados.lote_id }, select: { liga_id: true } }))?.liga_id;
        if (ligaIdLote !== registro.liga_id) throw new RegraError('O lote informado nao pertence a liga do apontamento.', 400);
      }

      const anteriores = {
        qtd_barras: registro.qtd_barras,
        lote_id: registro.lote_id,
        observacao: registro.observacao,
      };
      const novos = {
        qtd_barras: dados.qtd_barras ?? registro.qtd_barras,
        lote_id: dados.lote_id === undefined ? registro.lote_id : dados.lote_id,
        observacao: dados.observacao === undefined ? registro.observacao : dados.observacao,
      };
      // edição gera nova revisão — divergências anteriores ficam desatualizadas
      const editado = await tx.contagem_chumbo.update({
        where: { id: registro.id },
        data: { ...novos, divergencia_sistema: null, revisada_em: null },
      });

      const mudou = novos.qtd_barras !== anteriores.qtd_barras || novos.lote_id !== anteriores.lote_id || novos.observacao !== anteriores.observacao;
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
  } catch (ex) {
    if (ex instanceof RegraError) throw ex;
    throw ex;
  }
}

export async function excluirApontamento(dados: ExcluirApontamentoInput, sessao: Sessao) {
  try {
    await prisma.$transaction(async (tx) => {
      const registro = await tx.contagem_chumbo.findUnique({
        where: { id: dados.apontamento_id },
        include: { liga: { select: { nome: true } } },
      });
      if (!registro) throw new RegraError('Apontamento nao encontrado.', 404);
      if (dataISODe(registro.data) !== hojeISO()) throw new RegraError('Só é possível excluir apontamentos do dia atual.', 409);

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
  } catch (ex) {
    if (ex instanceof RegraError) throw ex;
    throw ex;
  }
}

export async function revisarContagem(dados: RevisarContagemInput, sessao: Sessao) {
  try {
    const resultado = await prisma.$transaction(async (tx) => {
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
    return resultado;
  } catch (ex) {
    if (ex instanceof RegraError) throw ex;
    throw ex;
  }
}

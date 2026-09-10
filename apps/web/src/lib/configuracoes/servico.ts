import { prisma } from '@/lib/prisma';
import { registrarAuditoria } from '@/lib/auditoria';
import type { Sessao } from '@/lib/auth/sessao';
import { ERROS } from '@/lib/api/erros';
import type { CorLiga, Polaridade } from '@komotors/shared';

export type CRUD = 'ligas' | 'setores' | 'colaboradores' | 'modelos-grade' | 'polaridades';

const ROTULOS: Record<CRUD, string> = {
  ligas: 'Liga de chumbo',
  setores: 'Setor',
  colaboradores: 'Colaborador',
  'modelos-grade': 'Modelo de grade',
  polaridades: 'Polaridade',
};

const TABELAS_AUD: Record<CRUD, string> = {
  ligas: 'liga_chumbo',
  setores: 'setor',
  colaboradores: 'colaborador',
  'modelos-grade': 'modelo_grade',
  polaridades: 'polaridade',
};

const ORDEM = [{ ativo: 'asc' as const }, { nome: 'asc' as const }];

export function rotulo(crud: CRUD) {
  return ROTULOS[crud];
}

export function entidadeAuditoria(crud: CRUD) {
  return TABELAS_AUD[crud];
}

const NAO_ENCONTRADO = (crud: CRUD) => ERROS.naoEncontrado(rotulo(crud));

export async function listar(crud: CRUD, incluirInativos: boolean) {
  const where = incluirInativos ? {} : { ativo: true };
  switch (crud) {
    case 'ligas':
      return prisma.liga_chumbo.findMany({ where, orderBy: ORDEM, include: { _count: { select: { lotes: true } } } });
    case 'setores':
      return prisma.setor.findMany({ where, orderBy: ORDEM, include: { _count: { select: { colaboradores: true } } } });
    case 'colaboradores':
      return prisma.colaborador.findMany({ where, orderBy: ORDEM, include: { setor: true } });
    case 'modelos-grade':
      return prisma.modelo_grade.findMany({ where, orderBy: ORDEM });
    case 'polaridades':
      return prisma.polaridade.findMany({ where, orderBy: ORDEM });
  }
}

export async function criar(crud: CRUD, dados: DadosEntrada, sessao: Sessao) {
  let criado: { id: number };
  if (crud === 'ligas') {
    criado = await prisma.liga_chumbo.create({ data: { nome: dados.nome as string, cor: dados.cor as CorLiga } });
  }
  else if (crud === 'setores') criado = await prisma.setor.create({ data: { nome: dados.nome as string, descricao: dados.descricao as string | undefined } });
  else if (crud === 'colaboradores') criado = await prisma.colaborador.create({ data: { nome: dados.nome as string, setor_id: dados.setor_id as number } });
  else if (crud === 'modelos-grade') criado = await prisma.modelo_grade.create({ data: { nome: dados.nome as string } });
  else criado = await prisma.polaridade.create({ data: { nome: (dados.cor ?? 'POSITIVO') as Polaridade } });

  await registrarAuditoria({
    entidade: entidadeAuditoria(crud),
    entidade_id: criado.id,
    acao: 'CRIACAO',
    dados_novos: criado,
    usuario_id: sessao.usuario_id,
  });
  return criado;
}

export async function atualizar(crud: CRUD, id: number, dados: DadosEntrada, sessao: Sessao) {
  let anterior: unknown;
  let novo: unknown;
  if (crud === 'ligas') {
    anterior = await prisma.liga_chumbo.findUnique({ where: { id } });
    if (!anterior) return NAO_ENCONTRADO(crud);
    novo = await prisma.liga_chumbo.update({ where: { id }, data: { nome: dados.nome as string, cor: dados.cor as CorLiga } });
  } else if (crud === 'setores') {
    anterior = await prisma.setor.findUnique({ where: { id } });
    if (!anterior) return NAO_ENCONTRADO(crud);
    novo = await prisma.setor.update({ where: { id }, data: { nome: dados.nome as string, descricao: dados.descricao as string | undefined } });
  } else if (crud === 'colaboradores') {
    anterior = await prisma.colaborador.findUnique({ where: { id } });
    if (!anterior) return NAO_ENCONTRADO(crud);
    novo = await prisma.colaborador.update({ where: { id }, data: { nome: dados.nome as string, setor_id: dados.setor_id as number } });
  } else if (crud === 'modelos-grade') {
    anterior = await prisma.modelo_grade.findUnique({ where: { id } });
    if (!anterior) return NAO_ENCONTRADO(crud);
    novo = await prisma.modelo_grade.update({ where: { id }, data: { nome: dados.nome as string } });
  } else {
    anterior = await prisma.polaridade.findUnique({ where: { id } });
    if (!anterior) return NAO_ENCONTRADO(crud);
    novo = await prisma.polaridade.update({ where: { id }, data: { nome: (dados.cor ?? 'POSITIVO') as Polaridade } });
  }

  await registrarAuditoria({
    entidade: entidadeAuditoria(crud),
    entidade_id: id,
    acao: 'ATUALIZACAO',
    dados_anteriores: anterior,
    dados_novos: novo,
    usuario_id: sessao.usuario_id,
  });
  return novo;
}

export type DadosEntrada = {
  nome?: string;
  cor?: CorLiga;
  descricao?: string;
  setor_id?: number;
};

async function buscarPorId(crud: CRUD, id: number) {
  switch (crud) {
    case 'ligas': return prisma.liga_chumbo.findUnique({ where: { id } });
    case 'setores': return prisma.setor.findUnique({ where: { id } });
    case 'colaboradores': return prisma.colaborador.findUnique({ where: { id } });
    case 'modelos-grade': return prisma.modelo_grade.findUnique({ where: { id } });
    case 'polaridades': return prisma.polaridade.findUnique({ where: { id } });
  }
}

async function salvarAtivo(crud: CRUD, id: number, ativo: boolean) {
  switch (crud) {
    case 'ligas': return prisma.liga_chumbo.update({ where: { id }, data: { ativo } });
    case 'setores': return prisma.setor.update({ where: { id }, data: { ativo } });
    case 'colaboradores': return prisma.colaborador.update({ where: { id }, data: { ativo } });
    case 'modelos-grade': return prisma.modelo_grade.update({ where: { id }, data: { ativo } });
    case 'polaridades': return prisma.polaridade.update({ where: { id }, data: { ativo } });
  }
}

async function usoImpedeDesativacao(crud: CRUD, id: number): Promise<string | null> {
  if (crud === 'ligas') {
    const lotes = await prisma.lote_chumbo.count({ where: { liga_id: id } });
    if (lotes > 0) return 'Nao e possivel desativar: a liga ja possui lotes cadastrados.';
  }
  if (crud === 'setores') {
    const colaboradores = await prisma.colaborador.count({ where: { setor_id: id, ativo: true } });
    const reservas = await prisma.monte_chumbo.count({ where: { setor_reserva_id: id } });
    const movimentos = await prisma.movimentacao_chumbo.count({ where: { setor_id: id } });
    if (colaboradores > 0 || reservas > 0 || movimentos > 0)
      return 'Nao e possivel desativar: o setor possui vinculos com colaboradores ou movimentacoes.';
  }
  return null;
}

export async function alterarAtivo(crud: CRUD, id: number, ativo: boolean, sessao: Sessao) {
  const anterior = await buscarPorId(crud, id);
  if (!anterior) return NAO_ENCONTRADO(crud);

  if (!ativo) {
    const bloqueio = await usoImpedeDesativacao(crud, id);
    if (bloqueio) return ERROS.conflito(bloqueio);
  }

  const novo = await salvarAtivo(crud, id, ativo);
  await registrarAuditoria({
    entidade: entidadeAuditoria(crud),
    entidade_id: id,
    acao: 'ATUALIZACAO',
    dados_anteriores: anterior,
    dados_novos: novo,
    usuario_id: sessao.usuario_id,
  });
  return novo;
}

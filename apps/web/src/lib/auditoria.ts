import type { AcaoAuditoria } from '@komotors/shared';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type RegistrarAuditoriaArgs = {
  entidade: string;
  entidade_id: number;
  acao: AcaoAuditoria;
  dados_anteriores?: unknown;
  dados_novos?: unknown;
  usuario_id?: number | null;
  cliente?: PrismaClient | { log_auditoria: PrismaClient['log_auditoria'] };
};

export async function registrarAuditoria(args: RegistrarAuditoriaArgs) {
  const { entidade, entidade_id, acao, dados_anteriores, dados_novos, usuario_id } = args;
  const db = ('log_auditoria' in (args.cliente ?? {})) ? args.cliente! : prisma;
  await db.log_auditoria.create({
    data: {
      entidade,
      entidade_id,
      acao,
      dados_anteriores: (dados_anteriores ?? undefined) as never,
      dados_novos: (dados_novos ?? undefined) as never,
      usuario_id: usuario_id ?? null,
    },
  });
}

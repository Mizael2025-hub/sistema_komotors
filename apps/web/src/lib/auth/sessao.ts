import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  ACCESS_TTL_SEGUNDOS,
  REFRESH_TTL_SEGUNDOS,
  criarAccessToken,
  criarRefreshToken,
  hashToken,
  verificarAccessToken,
  verificarRefreshToken,
  type ClaimsAcesso,
} from './jwt';

export const COOKIE_ACCESS = 'komotors_access';
export const COOKIE_REFRESH = 'komotors_refresh';

export type Sessao = ClaimsAcesso & {
  usuario_id: number;
};

const baseCookie = (maxAge: number) =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  }) as const;

export async function definirCookiesSessao(dados: { id: number; email: string; nome_completo: string; perfil: string }) {
  const payload = {
    sub: String(dados.id),
    email: dados.email,
    nome: dados.nome_completo,
    perfil: dados.perfil as 'ADMIN' | 'OPERADOR',
  };
  const access = await criarAccessToken(payload);
  const refresh = await criarRefreshToken(payload);
  const loja = await cookies();
  loja.set(COOKIE_ACCESS, access, baseCookie(ACCESS_TTL_SEGUNDOS));
  loja.set(COOKIE_REFRESH, refresh, baseCookie(REFRESH_TTL_SEGUNDOS));
  await prisma.token_refresh.create({
    data: {
      usuario_id: dados.id,
      token_hash: await hashToken(refresh),
      expira_em: new Date(Date.now() + REFRESH_TTL_SEGUNDOS * 1000),
    },
  });
  return { access, refresh };
}

export async function limparCookiesSessao() {
  const loja = await cookies();
  loja.set(COOKIE_ACCESS, '', { ...baseCookie(0), maxAge: 0 });
  loja.set(COOKIE_REFRESH, '', { ...baseCookie(0), maxAge: 0 });
}

export async function obterSessao(): Promise<Sessao | null> {
  const loja = await cookies();
  const token = loja.get(COOKIE_ACCESS)?.value;
  if (!token) return null;
  const claims = await verificarAccessToken(token).catch(() => null);
  if (!claims) return null;
  return { ...claims, usuario_id: Number(claims.sub) };
}

export async function exigirSessao() {
  const sessao = await obterSessao();
  if (!sessao) return null;
  return sessao;
}

export async function exigirAdmin() {
  const sessao = await exigirSessao();
  if (!sessao) return null;
  if (sessao.perfil !== 'ADMIN') return null;
  return sessao;
}

export async function renovarSessao() {
  const loja = await cookies();
  const token = loja.get(COOKIE_REFRESH)?.value;
  if (!token) return null;
  const claims = await verificarRefreshToken(token).catch(() => null);
  if (!claims) return null;

  const token_hash = await hashToken(token);
  const sessao = await prisma.token_refresh.findUnique({ where: { token_hash }, include: { usuario: true } });
  if (!sessao || sessao.revogado_em || sessao.expira_em < new Date() || !sessao.usuario.ativo) return null;

  await prisma.token_refresh.update({ where: { id: sessao.id }, data: { revogado_em: new Date() } });

  const payload = {
    sub: String(sessao.usuario.id),
    email: sessao.usuario.email,
    nome: sessao.usuario.nome_completo,
    perfil: sessao.usuario.perfil,
  };
  const novoAccess = await criarAccessToken(payload);
  const novoRefresh = await criarRefreshToken(payload);

  await prisma.token_refresh.create({
    data: { usuario_id: sessao.usuario.id, token_hash: await hashToken(novoRefresh), expira_em: new Date(Date.now() + REFRESH_TTL_SEGUNDOS * 1000) },
  });

  console.log(`[auth] refresh renovado para usuario ${sessao.usuario.id}`);

  return { access: novoAccess, refresh: novoRefresh };
}

export async function revogarRefreshToken() {
  const loja = await cookies();
  const token = loja.get(COOKIE_REFRESH)?.value;
  if (!token) return false;
  const token_hash = await hashToken(token);
  const result = await prisma.token_refresh.updateMany({
    where: { token_hash, revogado_em: null },
    data: { revogado_em: new Date() },
  });
  return result.count > 0;
}

import { SignJWT, jwtVerify } from 'jose';
import type { PerfilUsuario } from '@komotors/shared';

const segredo = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'segredo-dev-fallback-trocar',
);

export const ACCESS_TTL_SEGUNDOS = 60 * 15;
export const REFRESH_TTL_SEGUNDOS = 60 * 60 * 24 * 30;

export type TokenPayload = {
  sub: string;
  email: string;
  perfil: PerfilUsuario;
  nome: string;
};

export type ClaimsAcesso = TokenPayload & { tipo: 'acesso'; jti: string };
export type ClaimsRefresh = TokenPayload & { tipo: 'refresh'; jti: string };

async function assinar(payload: TokenPayload, tipo: 'acesso' | 'refresh', expiresIn: string) {
  return new SignJWT({ ...payload, tipo })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(expiresIn)
    .sign(segredo);
}

export function criarAccessToken(dados: TokenPayload) {
  return assinar(dados, 'acesso', `${ACCESS_TTL_SEGUNDOS}s`);
}

export function criarRefreshToken(dados: TokenPayload) {
  return assinar(dados, 'refresh', `${REFRESH_TTL_SEGUNDOS}s`);
}

async function verificar<T extends 'acesso' | 'refresh'>(token: string, tipo: T) {
  const { payload } = await jwtVerify(token, segredo);
  if (payload.tipo !== tipo) return null;
  return payload as unknown as (T extends 'acesso' ? ClaimsAcesso : ClaimsRefresh);
}

export function verificarAccessToken(token: string) {
  return verificar<ClaimsAcesso['tipo']>(token, 'acesso') as Promise<ClaimsAcesso | null>;
}

export function verificarRefreshToken(token: string) {
  return verificar<ClaimsRefresh['tipo']>(token, 'refresh') as Promise<ClaimsRefresh | null>;
}

export async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(digest).toString('hex');
}

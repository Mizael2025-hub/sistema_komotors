import { prisma } from '@/lib/prisma';
import { loginSchema } from '@komotors/shared';
import { conferirSenha } from '@/lib/auth/senha';
import { definirCookiesSessao } from '@/lib/auth/sessao';
import { erro } from '@/lib/api/erros';
import { registrarAuditoria } from '@/lib/auditoria';

const tentativas = new Map<string, { n: number; janela: number }>();
const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 60_000;

function limiteExcedido(chave: string) {
  const agora = Date.now();
  const registro = tentativas.get(chave);
  if (!registro || agora - registro.janela > JANELA_MS) {
    tentativas.set(chave, { n: 1, janela: agora });
    return false;
  }
  registro.n += 1;
  return registro.n > LIMITE_TENTATIVAS;
}

export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return erro(400, 'Corpo da requisicao invalido.');
  }

  const parsed = loginSchema.safeParse(corpo);
  if (!parsed.success) {
    return erro(400, 'Dados invalidos.', parsed.error.flatten().fieldErrors);
  }

  const { email, senha } = parsed.data;
  if (limiteExcedido(email.toLowerCase())) {
    return erro(429, 'Muitas tentativas. Aguarde um minuto e tente novamente.');
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) {
    return erro(401, 'Email ou senha incorretos.');
  }

  const senhaOk = await conferirSenha(usuario.senha_hash, senha).catch(() => false);
  if (!senhaOk) {
    return erro(401, 'Email ou senha incorretos.');
  }

  await definirCookiesSessao(usuario);
  await registrarAuditoria({
    entidade: 'usuario',
    entidade_id: usuario.id,
    acao: 'ATUALIZACAO',
    dados_novos: { login_em: new Date().toISOString() },
    usuario_id: usuario.id,
  });

  return Response.json({
    usuario: { id: usuario.id, email: usuario.email, nome_completo: usuario.nome_completo, perfil: usuario.perfil },
  });
}

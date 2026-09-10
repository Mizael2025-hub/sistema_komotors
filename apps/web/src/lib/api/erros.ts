export type RespostaErro = {
  erro: string;
  codigo?: string;
  detalhes?: Record<string, string[]>;
};

export function erro(status: number, mensagem: string, detalhes?: Record<string, string[]>, codigo?: string) {
  const corpo: RespostaErro = { erro: mensagem, codigo: codigo ?? `E_HTTP${status}` };
  if (detalhes && Object.keys(detalhes).length > 0) corpo.detalhes = detalhes;
  return Response.json(corpo, { status });
}

const CODIGOS_PRISMA: Record<string, string> = {
  P2024: 'O banco de dados nao respondeu a tempo (conexoes esgotadas). Tente novamente; se persistir, avise o suporte.',
  P2002: 'Registro duplicado.',
  P2025: 'Registro nao encontrado — provavelmente alterado por outro acesso.',
  P2003: 'Referencia invalida: relacionamento inexistente.',
};

export const ERROS = {
  naoAutenticado: () => erro(401, 'Nao autenticado. Faca login para continuar.', undefined, 'E_SESSAO'),
  sessaoExpirada: () => erro(401, 'Sessao expirada. Renove o acesso.', undefined, 'E_SESSAO_EXPIRADA'),
  semPermissao: () => erro(403, 'Voce nao tem permissao para esta operacao.', undefined, 'E_PERMISSAO'),
  naoEncontrado: (recurso = 'Registro') => erro(404, `${recurso} nao encontrado.`, undefined, 'E_NAOENCONTRADO'),
  conflito: (mensagem: string) => erro(409, mensagem, undefined, 'E_DUPLICADO'),

  erroValidacao: (issues: readonly { message: string; path: readonly (string | number | symbol)[] }[]) => {
    const detalhes: Record<string, string[]> = {};
    const gerais: string[] = [];
    for (const issue of issues) {
      if (issue.path.length > 0) {
        const campo = String(issue.path[0]);
        (detalhes[campo] ??= []).push(issue.message);
      } else {
        gerais.push(issue.message);
      }
    }
    if (gerais.length > 0) detalhes.geral = gerais;
    return erro(400, 'Dados invalidos.', detalhes, 'E_VALIDACAO');
  },

  erroInterno: (ex: unknown) => {
    const e = ex instanceof Error ? ex : undefined;
    const codigoPrisma = typeof ex === 'object' && ex !== null && 'code' in ex ? String((ex as { code: unknown }).code) : undefined;
    console.error('[erro-interno]', `codigo=${codigoPrisma ?? 'desconhecido'}`, `${e?.name}: ${e?.message}`, e?.stack?.split('\n').slice(0, 5).join(' | '));
    const pista = codigoPrisma ? CODIGOS_PRISMA[codigoPrisma] : undefined;
    return erro(
      500,
      pista ?? 'Erro interno. Tente novamente. Se persistir, informe o codigo exibido.',
      undefined,
      `E_INTERNO${codigoPrisma ? `_${codigoPrisma}` : ''}`,
    );
  },
};

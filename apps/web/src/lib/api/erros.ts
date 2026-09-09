export type RespostaErro = {
  erro: string;
  detalhes?: Record<string, string[]>;
};

export function erro(status: number, mensagem: string, detalhes?: Record<string, string[]>) {
  return Response.json({ erro: mensagem, ...(detalhes ? { detalhes } : {}) } satisfies RespostaErro, { status });
}

export const ERROS = {
  naoAutenticado: () => erro(401, 'Nao autenticado. Faca login para continuar.'),
  sessaoExpirada: () => erro(401, 'Sessao expirada. Renove o acesso.'),
  semPermissao: () => erro(403, 'Voce nao tem permissao para esta operacao.'),
  naoEncontrado: (recurso = 'Registro') => erro(404, `${recurso} nao encontrado.`),
  conflito: (mensagem: string) => erro(409, mensagem),
  erroInterno: () => erro(500, 'Erro interno. Tente novamente.'),
};

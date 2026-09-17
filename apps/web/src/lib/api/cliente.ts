/* espelha RespostaErro do servidor (lib/api/erros) — campo "codigo" vem em toda resposta de erro */
export type ErroApi = { erro: string; codigo?: string; detalhes?: Record<string, string[]> };

type OpcoesAnexo = {
  metodo?: string;
  corpo?: unknown;
};

type ErroDetalhado = Error & { detalhes?: Record<string, string[]>; status: number; codigo: string };

let renovacaoEmCurso: Promise<boolean> | null = null;

async function renovarSessao(): Promise<boolean> {
  if (!renovacaoEmCurso) {
    renovacaoEmCurso = fetch('/api/auth/refresh', { method: 'POST' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        renovacaoEmCurso = null;
      });
  }
  return renovacaoEmCurso;
}

async function resposta<T>(url: string, opcoes: OpcoesAnexo): Promise<T> {
  const r = await fetch(url, {
    method: opcoes.metodo ?? 'GET',
    headers: opcoes.corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  });
  if (r.ok) {
    if (r.status === 204) return undefined as T;
    return r.json();
  }

  let corpo: ErroApi | null = null;
  try {
    corpo = (await r.json()) as ErroApi;
  } catch {
    corpo = { erro: 'Erro inesperado. Tente novamente.' };
  }
  const codigo = corpo?.codigo;
  const geral = (corpo?.detalhes?.geral ?? []).join(' ');
  const mensagem = [corpo?.erro ?? 'Erro na operacao.', geral].filter(Boolean).join(' ');

  if (r.status === 401 && !url.startsWith('/api/auth/')) {
    if (await renovarSessao()) {
      return resposta<T>(url, opcoes);
    }
    if (typeof window !== 'undefined') window.location.assign('/login');
    throw new Error(`Sessão expirada [${codigo ?? 'E_HTTP401'}]`);
  }

  const e = new Error(codigo ? `${mensagem} [${codigo}]` : mensagem) as ErroDetalhado;
  e.detalhes = corpo?.detalhes;
  e.status = r.status;
  e.codigo = codigo ?? 'desconhecido';
  if (r.status === 401) e.codigo = 'E_HTTP401';
  throw e;
}

export async function enviar<T = unknown>(url: string, opcoes: OpcoesAnexo = {}): Promise<T> {
  return resposta<T>(url, opcoes);
}

export async function consumir<T = unknown>(url: string): Promise<T> {
  return resposta<T>(url, {});
}

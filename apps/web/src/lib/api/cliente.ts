export type ErroApi = { erro: string; detalhes?: Record<string, string[]> };

async function resposta(request: Promise<Response>) {
  const r = await request;
  if (r.ok) {
    if (r.status === 204) return null;
    return r.json();
  }
  let corpo: ErroApi | null = null;
  try {
    corpo = (await r.json()) as ErroApi;
  } catch {
    corpo = { erro: 'Erro inesperado. Tente novamente.' };
  }
  const codigo = (corpo as { codigo?: string } | null)?.codigo;
  const geral = (corpo?.detalhes?.geral ?? []).join(' ');
  const mensagem = [corpo?.erro ?? 'Erro na operacao.', geral].filter(Boolean).join(' ');
  if (r.status === 401) {
    if (typeof window !== 'undefined') window.location.assign('/login');
    throw new Error(`${mensagem} [${codigo ?? 'E_HTTP401'}]`);
  }
  const e = new Error(codigo ? `${mensagem} [${codigo}]` : mensagem) as Error & { detalhes?: Record<string, string[]>; status: number; codigo: string };
  e.detalhes = corpo?.detalhes;
  e.status = r.status;
  e.codigo = codigo ?? 'desconhecido';
  throw e;
}

export async function enviar<T = unknown>(url: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const r = fetch(url, {
    method: opcoes.metodo ?? 'GET',
    headers: opcoes.corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  });
  return resposta(r) as Promise<T>;
}

export async function consumir<T = unknown>(url: string): Promise<T> {
  return resposta(fetch(url)) as Promise<T>;
}

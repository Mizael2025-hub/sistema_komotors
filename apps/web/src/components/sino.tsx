'use client';

import { useCallback, useEffect, useState } from 'react';
import { consumir, enviar } from '@/lib/api/cliente';
import { Popover } from '@/components/ui';

export type Notificacao = {
  id: number;
  titulo: string;
  mensagem: string;
  url: string | null;
  lida: boolean;
  created_at: string;
};

export function SinoNotificacoes() {
  const [naoLidas, setNaoLidas] = useState(0);
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await consumir<{ nao_lidas: number; itens: Notificacao[] }>('/api/lead/notifications');
      setNaoLidas(r.nao_lidas);
      setItens(r.itens);
    } catch {
      /* silencioso — sino é indicador não crítico */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling de não lidas (setState pós-await)
    carregar();
    const t = setInterval(carregar, 90_000);
    return () => clearInterval(t);
  }, [carregar, aberto]);

  async function abrir(id: number, url: string | null) {
    try {
      await enviar('/api/lead/notifications', { metodo: 'POST', corpo: { acao: 'marcar-lida', id } });
    } catch {
      /* marcação de lida não bloqueia navegação */
    }
    setAberto(false);
    if (url && typeof window !== 'undefined') window.location.assign(url);
  }

  const titulo = `Notificações${naoLidas ? ` · ${naoLidas} nova(s)` : ''}`;

  return (
    <>
      <button onClick={() => setAberto(true)} aria-label="Notificações"
        className="ios-icon-btn relative">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="var(--tint)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--destructive)] px-0.5 text-[9px] font-bold text-white">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {/* popover ancorado ao sino (canto superior direito) — o Primitivo
          Popover cuida do portal (fora do header com backdrop-filter) */}
      {aberto && (
        <Popover titulo={titulo} onClose={() => setAberto(false)} posicaoClassName="fixed top-16 right-4 w-72 origin-top-right">
          <div className="grid max-h-[60dvh] gap-1.5 overflow-y-auto p-1">
            {itens.length === 0 && <p className="px-2 py-3 text-center text-[13px] text-[var(--muted-foreground)]">Sem notificações.</p>}
            {itens.map((n) => (
              <button key={n.id} onClick={() => abrir(n.id, n.url)}
                className={`ios-card-flat flex items-start gap-3 p-3 text-left active:scale-[0.98] transition-transform ${n.lida ? 'opacity-60' : ''}`}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.lida ? 'bg-[var(--border)]' : 'bg-[var(--tint)]'}`} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{n.titulo}</span>
                  <span className="block truncate text-[11.5px] text-[var(--muted-foreground)]">{n.mensagem}</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">
                    {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                {n.url && <span className="ml-auto self-center text-[var(--muted-foreground)]">›</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

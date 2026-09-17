'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { enviar } from '@/lib/api/cliente';

/* Sair da conta em dois formatos: "pill" (cabeçalhos) e "linha" (tela Mais). */
export function BotaoSair({ variante = 'pill' }: { variante?: 'pill' | 'linha' }) {
  const roteador = useRouter();
  const [saindo, setSaindoState] = useState(false);

  async function sair() {
    setSaindoState(true);
    try {
      await enviar('/api/auth/logout', { metodo: 'POST' });
    } finally {
      roteador.replace('/login');
      roteador.refresh();
    }
  }

  if (variante === 'linha') {
    return (
      <button
        onClick={sair}
        disabled={saindo}
        className="ios-card mx-4 mt-3.5 flex w-[calc(100%-32px)] items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--muted)] disabled:opacity-50"
      >
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]" style={{ background: 'var(--destructive-soft)' }}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="var(--destructive)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </span>
        <span className="flex-1 text-[15px] font-semibold text-[var(--destructive)]">{saindo ? 'Saindo…' : 'Sair da conta'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={sair}
      disabled={saindo}
      className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--foreground)] transition-transform active:scale-95 disabled:opacity-50"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  );
}

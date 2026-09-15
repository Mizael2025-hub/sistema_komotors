'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { enviar } from '@/lib/api/cliente';

export function BotaoSair() {
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

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
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  );
}

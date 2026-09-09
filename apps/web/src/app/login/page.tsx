'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { enviar } from '@/lib/api/cliente';

export default function PaginaLogin() {
  const roteador = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await enviar('/api/auth/login', { metodo: 'POST', corpo: { email, senha } });
      roteador.replace('/');
      roteador.refresh();
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Komotors</h1>
        <p className="mt-2 text-sm text-muted-foreground">Gestão da fábrica — entre com sua conta</p>
      </div>

      <form
        onSubmit={aoEnviar}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Sua senha"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {erro && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || !email || !senha}
            className="h-10 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </main>
  );
}

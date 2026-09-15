'use client';

import { ReactNode, useEffect, useState } from 'react';

/* ---------- Bottom sheet estilo iOS ---------- */
export function BottomSheet({
  titulo,
  onClose,
  children,
}: {
  titulo: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="ios-sheet-backdrop" onClick={onClose} />
      <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ios-grabber" />
        <div className="flex items-center justify-between px-5 pb-1 pt-2">
          <p className="text-[17px] font-bold tracking-tight">{titulo}</p>
          <button onClick={onClose} className="px-2 pb-1 text-[15px] font-semibold text-[var(--tint)]">
            Fechar
          </button>
        </div>
        <div className="px-4 pb-6 pt-2">{children}</div>
      </div>
    </>
  );
}

/* ---------- Tabs inferiores estilo iOS ---------- */
const TABS = [
  { href: '/chumbo/estoque', label: 'Estoque', d: 'M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4' },
  { href: '/chumbo/entrada', label: 'Entrada', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
  { href: '/', label: 'Menu', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
] as const;

export function TabBar() {
  const ok = typeof window !== 'undefined';
  const [rota, setRota] = useState('');

  useEffect(() => {
    setRota(window.location.pathname.replace(/\/$/, ''));
  }, []);

  if (!ok) return null;

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-3xl -translate-x-1/2 justify-around border-t border-[var(--border)] bg-background/85 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur"
    >
      {TABS.map((t) => {
        const ativa = rota === t.href;
        return (
          <a key={t.href} href={t.href} className={`flex flex-1 flex-col items-center gap-0.5 pb-1 text-[10.5px] transition-colors ${ativa ? 'text-[var(--tint)] font-semibold' : 'text-[var(--muted-foreground)]'}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.d} />
            </svg>
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}

/* ---------- Alternador de tema (toggle manual) ---------- */
export function ToggleTema() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  function alternar() {
    const novo = !dark;
    setDark(novo);
    document.documentElement.dataset.theme = novo ? 'dark' : 'light';
    try {
      localStorage.setItem('tema', novo ? 'dark' : 'light');
    } catch {}
  }

  return (
    <button
      onClick={alternar}
      aria-label="Alternar tema"
      className="grid h-9 w-9 place-items-center rounded-full bg-[var(--muted)] transition-transform active:scale-90"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke={dark ? 'var(--laranja)' : 'var(--tint)'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}

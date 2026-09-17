'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COR_LIGA_HEX, type CorLiga } from '@komotors/shared';

/* Cor hexadecimal da liga com fallback cinza — ponto único para os casts de cor
   do app (a cor vem como string da API; valor desconhecido cai no cinza). */
export function corLigaHex(cor: string): string {
  return COR_LIGA_HEX[cor as CorLiga] ?? COR_LIGA_HEX.CINZA;
}

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
  /* fecha com Esc — comportamento esperado de diálogo modal */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  return (
    <>
      <div className="ios-sheet-backdrop" onClick={onClose} aria-hidden />
      <div className="ios-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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

/* ---------- Toast estilo iOS (cápsula no topo) ---------- */
export type ToastAviso = { tipo: 'ok' | 'warn' | 'info'; mensagem: string } | null;

export function Toast({ aviso, aoSumir }: { aviso: ToastAviso; aoSumir: () => void }) {
  useEffect(() => {
    if (aviso == null) return;
    const t = setTimeout(aoSumir, 2600);
    return () => clearTimeout(t);
  }, [aviso, aoSumir]);

  if (aviso == null) return null;
  const cor = aviso.tipo === 'ok' ? 'var(--verde)' : aviso.tipo === 'warn' ? 'var(--laranja)' : 'var(--tint)';
  return (
    <div className="ios-toast" role="status">
      <span className="t-ic" style={{ background: cor }}>
        <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
      <span>{aviso.mensagem}</span>
    </div>
  );
}

/* ---------- Tabs inferiores estilo iOS: 5 posições + FAB central ---------- */
export function TabBar() {
  const pathname = usePathname();
  const [menuAcoes, setMenuAcoes] = useState(false);

  const rota = pathname.replace(/\/$/, '');

  const aba = (href: string, label: string, icone: ReactNode) => {
    const ativa = rota === href;
    return (
      <Link href={href} className={`flex flex-col items-center gap-0.5 pb-1 text-[10.5px] transition-colors ${ativa ? 'text-[var(--tint)] font-semibold' : 'text-[var(--muted-foreground)]'}`}>
        <svg viewBox="0 0 24 24" className={`h-[25px] w-[25px] ${ativa ? '-translate-y-0.5' : ''} transition-transform`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {icone}
        </svg>
        {label}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-3xl -translate-x-1/2 grid-cols-5 items-end justify-items-center border-t border-[var(--border)] bg-[var(--card)]/88 px-2 pt-2 backdrop-blur pb-[max(env(safe-area-inset-bottom),10px)]"
      >
        {/* 1. Dashboard */}
        {aba('/dashboard', 'Dashboard', <path d="M4 19h16M4 19V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14M10 11h4a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1zM18 8v11" />)}

        {/* 2. Estoque */}
        {aba('/chumbo/estoque', 'Estoque', <path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />)}

        {/* 3. FAB central de ação acelerada */}
        <button
          onClick={() => setMenuAcoes(true)}
          aria-label="Ações rápidas"
          className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--tint)] text-white shadow-lg transition-transform active:scale-90"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {/* 4. Mais */}
        {aba('/menu', 'Mais', <>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </>)}

        {/* 5. Configurações */}
        {aba('/configuracoes', 'Config.', <path d="M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />)}
      </nav>

      {menuAcoes && (
        <BottomSheet titulo="Ações rápidas" onClose={() => setMenuAcoes(false)}>
          <div className="grid gap-2.5">
            <Link href="/chumbo/entrada" className="ios-card-flat flex items-center gap-3 p-4 active:scale-[0.98] transition-transform">
              <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" stroke="var(--tint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span className="text-[15px] font-semibold">Entrada de Chumbo</span>
              <span className="ml-auto text-[var(--muted-foreground)]">›</span>
            </Link>
            <Link href="/chumbo/contagem" className="ios-card-flat flex items-center gap-3 p-4 active:scale-[0.98] transition-transform">
              <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" stroke="var(--tint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3 8-8M21 12a9 9 0 1 1-3-6.7L21 7" />
              </svg>
              <span className="text-[15px] font-semibold">Contagem</span>
              <span className="ml-auto text-[var(--muted-foreground)]">›</span>
            </Link>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/* ---------- Alternador de tema (toggle manual) ---------- */
export function ToggleTema() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com atributo externo (DOM) no mount
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  function alternar() {
    const novo = !dark;
    setDark(novo);
    document.documentElement.dataset.theme = novo ? 'dark' : 'light';
    // cookie é lido pelo servidor na próxima renderização (sem flash e sem script inline)
    document.cookie = `tema=${novo ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem('tema', novo ? 'dark' : 'light');
    } catch {}
  }

  return (
    <button
      onClick={alternar}
      aria-label="Alternar tema"
      className="ios-icon-btn"
    >
      <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke={dark ? 'var(--laranja)' : 'var(--tint)'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
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

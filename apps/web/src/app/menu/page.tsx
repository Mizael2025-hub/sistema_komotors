'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { consumir, enviar } from '@/lib/api/cliente';
import { TabBar, ToggleTema } from '@/components/ui';
import { SinoNotificacoes } from '@/components/sino';
import pkg from '../../../package.json';

const VERSAO = (pkg as { version: string }).version;

type Movimento = { tipo: string; barras: number; peso: number };
type Divergencia = { liga: string; cor: string; data: string; divergencia: number | null };
type Dashboard = {
  periodo_dias: number;
  entradas_saidas: Movimento[];
  divergencias: Divergencia[];
  percentual_pesado_geral: number;
};

type ItemMenu = {
  href: string | null;
  titulo: string;
  descricao: string;
  icone: string;
  emBreve?: boolean;
};

const ITENS: ItemMenu[] = [
  {
    href: '/dashboard',
    titulo: 'Dashboard do chumbo',
    descricao: 'Gráficos e métricas',
    icone: 'M3 3h18v18H3zM8 16v-5M12 16V8M16 16v-3',
  },
  {
    href: '/relatorios',
    titulo: 'Relatórios',
    descricao: 'XLSX e PDF com filtros',
    icone: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  },
  {
    href: null,
    titulo: 'Auditoria',
    descricao: 'Trilha completa de alterações',
    icone: 'M12 21a9 9 0 1 1 9-9M12 7v5l3 3M21 16h-5v5',
    emBreve: true,
  },
  {
    href: '/configuracoes',
    titulo: 'Configurações',
    descricao: 'Ligas, setores, colaboradores',
    icone: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
];

const fmtKg = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);

export default function PaginaMais() {
  const roteador = useRouter();
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    consumir<Dashboard>('/api/lead/dashboard?dias=30').then(setDados).catch(() => setDados(null));
  }, []);

  async function sair() {
    setSaindo(true);
    try {
      await enviar('/api/auth/logout', { metodo: 'POST' });
    } finally {
      roteador.replace('/login');
      roteador.refresh();
    }
  }

  const entradas = dados?.entradas_saidas.find((m) => m.tipo === 'ENTRADA')?.peso ?? 0;
  const saidas = dados?.entradas_saidas.find((m) => m.tipo === 'BAIXA_VENDA')?.peso ?? 0;
  const divergencias = dados?.divergencias.filter((d) => d.divergencia != null && d.divergencia !== 0).length ?? 0;

  return (
    <div className="min-h-dvh bg-background">
      <header className="ios-topbar">
        <div>
          <h1>Mais</h1>
          <div className="sub">Dashboard, relatórios e config</div>
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes />
          <ToggleTema />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[480px] pb-32 pt-1">
        {/* card de análise */}
        <div className="ios-card mx-4 mb-3.5 overflow-hidden">
          <div className="px-4 py-3.5">
            <span className="text-[15px] font-bold">Análise</span>
          </div>
          <div className="ios-divider" />
          <div className="grid grid-cols-2 gap-2.5 px-4 py-3">
            <div className="ios-stat">
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">
                {dados ? fmtKg(entradas) : '—'}<small className="text-[12px] font-semibold text-[var(--muted-foreground)]"> kg</small>
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Entradas (30d)</p>
            </div>
            <div className="ios-stat" style={{ background: 'var(--destructive-soft)' }}>
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--destructive)]">
                {dados ? fmtKg(saidas) : '—'}<small className="text-[12px] font-semibold text-[var(--muted-foreground)]"> kg</small>
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Saídas (30d)</p>
            </div>
            <div className="ios-stat" style={{ background: 'var(--laranja-soft)' }}>
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--laranja)]">{dados ? divergencias : '—'}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Divergências</p>
            </div>
            <div className="ios-stat" style={{ background: 'var(--teal-soft)' }}>
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--teal)]">{dados ? `${dados.percentual_pesado_geral}%` : '—'}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Pesado vs. estimado</p>
            </div>
          </div>
        </div>

        {/* menu */}
        <div className="ios-card mx-4 overflow-hidden">
          {ITENS.map((item, i) => {
            const conteudo = (
              <>
                <span
                  className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]"
                  style={{ background: 'var(--tint-soft)' }}
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="var(--tint)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icone} />
                  </svg>
                </span>
                <span className="flex-1 text-left">
                  <b className="flex items-center gap-2 text-[15px]">
                    {item.titulo}
                    {item.emBreve && <span className="st-badge st-vendido">Em breve</span>}
                  </b>
                  <span className="block text-[12.5px] text-[var(--muted-foreground)]">{item.descricao}</span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="#aeaeb2" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
              </>
            );
            return item.href ? (
              <Link key={item.titulo} href={item.href} className={`flex items-center gap-3 px-4 py-[13px] text-left active:bg-[var(--muted)] ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                {conteudo}
              </Link>
            ) : (
              <div key={item.titulo} className={`flex items-center gap-3 px-4 py-[13px] opacity-60 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                {conteudo}
              </div>
            );
          })}
        </div>

        {/* sair da conta */}
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

        <p className="pb-2 pt-6 text-center text-[11px] font-semibold tracking-wide text-[var(--muted-foreground)]">v{VERSAO}</p>
      </main>

      <TabBar />
    </div>
  );
}

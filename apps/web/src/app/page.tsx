import Link from 'next/link';
import { redirect } from 'next/navigation';
import { obterSessao } from '@/lib/auth/sessao';
import { BotaoSair } from '@/components/botao-sair';
import { ToggleTema, TabBar } from '@/components/ui';

type ItemMenu = {
  href: string;
  titulo: string;
  descricao: string;
  cor: string;
  icone: string;
  pronto: boolean;
};

const ITENS: ItemMenu[] = [
  { href: '/chumbo/entrada', titulo: 'Chumbo — Entrada', descricao: 'Apontamento de remessa com grade 2D', cor: 'var(--tint)', icone: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', pronto: true },
  { href: '/chumbo/estoque', titulo: 'Chumbo — Estoque', descricao: 'Grade 2D viva por lote, reservas e movimentações', cor: 'var(--verde)', icone: 'M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4', pronto: true },
  { href: '/chumbo/contagem', titulo: 'Chumbo — Contagem', descricao: 'Contagem diária e revisão contra o sistema', cor: 'var(--laranja)', icone: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', pronto: false },
  { href: '/configuracoes', titulo: 'Configurações', descricao: 'Ligas, setores, colaboradores, modelos de grade e polaridades', cor: 'var(--roxo)', icone: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z', pronto: true },
];

const FUTUROS = [
  { titulo: 'Dashboard', descricao: 'Métricas, gráficos e indicadores do chumbo' },
  { titulo: 'Relatórios', descricao: 'Movimentações, saldos e divergências (XLSX/PDF)' },
];

export default async function PaginaPrincipal() {
  const sessao = await obterSessao();
  if (!sessao) redirect('/login');

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-background/85 px-5 py-3 backdrop-blur">
        <div>
          <p className="text-[15px] font-bold tracking-tight">Komotors</p>
          <p className="text-[11px] text-muted-foreground">{sessao.nome} · ADMIN</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleTema />
          <BotaoSair />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-5">
        <h1 className="text-[26px] font-extrabold tracking-tight">Menu</h1>
        <p className="mb-5 text-[13px] text-[var(--muted-foreground)]">Módulos do sistema</p>

        <div className="ios-card mb-2 overflow-hidden">
          {ITENS.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`ios-field ${i > 0 ? 'border-b-0 border-t' : ''}`}
              style={{ flexDirection: 'row', padding: '13px 16px' }}
            >
              <span
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]"
                style={{ background: `color-mix(in srgb, ${item.cor} 14%, transparent)` }}
              >
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke={item.cor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icone} />
                </svg>
              </span>
              <span className="flex-1 text-left">
                <b className="block text-[15px]">{item.titulo}</b>
                <span className="block text-[12px] text-[var(--muted-foreground)]">{item.descricao}</span>
              </span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="#aeaeb2" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          ))}
        </div>

        <p className="mb-2 mt-6 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Em breve</p>
        <div className="ios-card opacity-60">
          {FUTUROS.map((f, i) => (
            <div key={f.titulo} className={`ios-field ${i > 0 ? 'border-t' : ''}`} style={{ flexDirection: 'row', padding: '13px 16px' }}>
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--muted)]">
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="9" /></svg>
              </span>
              <span className="flex-1 text-left">
                <b className="text-[15px]">{f.titulo}</b>
                <span className="block text-[12px] text-[var(--muted-foreground)]">{f.descricao}</span>
              </span>
            </div>
          ))}
        </div>
      </main>

      <TabBar />
    </div>
  );
}

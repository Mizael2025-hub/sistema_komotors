import Link from 'next/link';
import { redirect } from 'next/navigation';
import { obterSessao } from '@/lib/auth/sessao';
import { BotaoSair } from '@/components/botao-sair';

type ItemMenu = {
  href: string;
  titulo: string;
  descricao: string;
  pronto: boolean;
};

const ITENS: ItemMenu[] = [
  { href: '/configuracoes', titulo: 'Configurações', descricao: 'Ligas, setores, colaboradores, modelos de grade e polaridades', pronto: true },
  { href: '/chumbo/entrada', titulo: 'Chumbo — Entrada', descricao: 'Apontamento de remessa com grade 2D', pronto: false },
  { href: '/chumbo/estoque', titulo: 'Chumbo — Estoque', descricao: 'Grade 2D viva por lote, reservas e movimentações', pronto: false },
  { href: '/chumbo/contagem', titulo: 'Chumbo — Contagem', descricao: 'Contagem diária e revisão contra o sistema', pronto: false },
  { href: '/dashboard', titulo: 'Dashboard', descricao: 'Métricas, gráficos e indicadores do chumbo', pronto: false },
  { href: '/relatorios', titulo: 'Relatórios', descricao: 'Movimentações, saldos e divergências (XLSX/PDF)', pronto: false },
];

export default async function PaginaPrincipal() {
  const sessao = await obterSessao();
  if (!sessao) redirect('/login');

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <p className="text-sm font-semibold">Komotors</p>
          <p className="text-xs text-muted-foreground">{sessao.nome} · ADMIN</p>
        </div>
        <BotaoSair />
      </header>

      <main className="mx-auto w-full max-w-xl px-5 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Menu principal</h1>
        <p className="mb-6 text-sm text-muted-foreground">Módulos do sistema — os marcados como “em breve” fazem parte do roadmap.</p>

        <nav className="grid gap-3 sm:grid-cols-2">
          {ITENS.map((item) =>
            item.pronto ? (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <p className="font-medium">{item.titulo}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p>
              </Link>
            ) : (
              <div key={item.href} className="rounded-2xl border border-dashed border-border bg-card/40 p-4 opacity-60">
                <p className="font-medium">
                  {item.titulo} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">em breve</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p>
              </div>
            ),
          )}
        </nav>
      </main>
    </div>
  );
}

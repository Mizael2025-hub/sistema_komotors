'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { consumir } from '@/lib/api/cliente';
import { SinoNotificacoes } from '@/components/sino';
import { ToggleTema, TabBar, corLigaHex } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, CartesianGrid } from 'recharts';

type ItemLiga = { id: number; nome: string; cor: string };

type SaldoLiga = { liga: string; cor: string; estoque: number; reservado: number; no_setor: number; total_fisico: number };
type FluxoLinha = { tipo: string; barras: number; peso: number };
type PorSetor = { setor: string; barras: number; peso: number };
type Divergencia = { liga: string; cor: string; data: string; divergencia: number | null };
type Aging = { lote: string; liga: string; dias_desde_chegada: number; barras_restantes: number; peso_barras_dias: number; percentual_pesado: number };
type PesadoLote = { lote: string; liga: string; percentual_pesado: number };

type Painel = {
  periodo_dias: number;
  saldo_por_liga: SaldoLiga[];
  entradas_saidas: FluxoLinha[];
  por_setor: PorSetor[];
  divergencias: Divergencia[];
  aging: Aging[];
  pesado_por_lote: PesadoLote[];
};

const ROTULO_FLUXO: Record<string, string> = {
  ENTRADA: 'Entrada',
  RESERVA: 'Reserva',
  CANCELAMENTO_RESERVA: 'Cancel. reserva',
  MOVIMENTO_SETOR: 'Ao setor',
  BAIXA_VENDA: 'Venda',
  EDICAO: 'Edição',
  RECONCILIACAO: 'Reconciliação',
  AJUSTE: 'Ajuste',
};

const fmtPeso = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);

export default function PaginaDashboardChumbo() {
  const [ligas, setLigas] = useState<ItemLiga[] | null>(null);
  const [dias, setDias] = useState(30);
  const [ligaId, setLigaId] = useState('');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
     
    consumir<{ itens: ItemLiga[] }>('/api/config/ligas').then((r) => setLigas(r.itens ?? [])).catch(() => setLigas([]));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicador externo de carregamento no início da busca
    setCarregando(true);
    consumir<Painel>(`/api/lead/dashboard?dias=${dias}${ligaId ? `&liga_id=${ligaId}` : ''}`)
      .then((r) => setPainel(r))
      .catch((ex) => setErro(ex instanceof Error ? ex.message : 'Erro ao carregar dashboard.'))
      .finally(() => setCarregando(false));
  }, [dias, ligaId]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-background/85 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Dashboard do chumbo</h1>
          <p className="text-[12px] text-[var(--muted-foreground)]">Métrica dos movimentos do estoque (RF-D01/RF-D02)</p>
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes />
          <ToggleTema />
          <Link href="/menu" className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--tint)]">
            Menu
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
        {/* filtros (RF-D02): período + liga */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDias(d)} aria-pressed={dias === d}
              className={`rounded-full border-[1.5px] px-4 py-1.5 text-[13px] font-semibold transition-all active:scale-95 ${dias === d ? 'border-transparent bg-[var(--tint)] text-white' : 'border-[var(--border)] text-[var(--muted-foreground)]'}`}>
              {d} dias
            </button>
          ))}
          <select value={ligaId} onChange={(e) => setLigaId(e.target.value)}
            className="ml-auto rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[13px] font-semibold">
            <option value="">Todas as ligas</option>
            {(ligas ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
        </div>

        {erro && <p role="alert" className="mb-3 rounded-xl bg-[var(--destructive)]/10 px-3 py-2 text-[13px] font-medium text-[var(--destructive)]">{erro}</p>}
        {carregando && !painel && <p className="animate-pulse text-[13px] text-[var(--muted-foreground)]">Carregando painel.</p>}

        {painel && (
          <div className="grid gap-4">
            {/* saldo por liga */}
            <section className="ios-card p-4">
              <p className="mb-3 text-[14px] font-bold">Saldo por liga</p>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={painel.saldo_por_liga.filter((s) => s.total_fisico > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="liga" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={28} />
                    <Tooltip contentStyle={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }} />
                    <Bar dataKey="estoque" name="Estoque" stackId="s" fill="var(--tint)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="reservado" name="Reservado" stackId="s" fill="var(--laranja)" />
                    <Bar dataKey="no_setor" name="No setor" stackId="s" fill="var(--roxo)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* entradas × saídas no período */}
            <section className="ios-card p-4">
              <p className="mb-3 text-[14px] font-bold">Entradas × saídas · {painel.periodo_dias} dias</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {painel.entradas_saidas.map((f) => (
                  <div key={f.tipo} className="ios-stat">
                    <p className="text-[19px] font-extrabold tracking-tight">{f.barras} <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">barras</span></p>
                    <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">{f.peso > 0 ? `${fmtPeso(f.peso)} kg · ` : ''}{ROTULO_FLUXO[f.tipo] ?? f.tipo}</p>
                  </div>
                ))}
                {painel.entradas_saidas.length === 0 && <p className="col-span-2 text-[12px] text-[var(--muted-foreground)]">Sem movimentações no período.</p>}
              </div>
            </section>

            {/* movidos por setor */}
            <section className="ios-card p-4">
              <p className="mb-3 text-[14px] font-bold">Barras movidas por setor</p>
              {painel.por_setor.length === 0 ? (
                <p className="text-[13px] text-[var(--muted-foreground)]">Sem movimentos para setor no período.</p>
              ) : (
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={painel.por_setor}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="setor" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={28} />
                      <Tooltip contentStyle={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }} />
                      <Bar dataKey="barras" radius={[6, 6, 0, 0]}>
                        {painel.por_setor.map((_, i) => (
                          <Cell key={i} fill={i % 2 ? 'var(--roxo)' : 'var(--teal)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* divergências de contagem (RF-CT05) */}
            <section className="ios-card p-4">
              <p className="mb-3 text-[14px] font-bold">Divergências de contagem · última revisão</p>
              {painel.divergencias.length === 0 ? (
                <p className="text-[13px] text-[var(--muted-foreground)]">Sem revisões com divergência registrada.</p>
              ) : (
                <div className="grid gap-2">
                  {painel.divergencias.map((d) => (
                    <div key={`${d.liga}-${d.data}`} className="ios-card-flat flex items-center gap-2.5 p-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corLigaHex(d.cor) }} />
                      <p className="text-[13.5px] font-semibold">{d.liga}<span className="ml-1 font-normal text-[var(--muted-foreground)]">· {d.data.split('-').reverse().join('/')}</span></p>
                      <p className={`ml-auto text-[15px] font-extrabold tracking-tight ${(d.divergencia ?? 0) > 0 ? 'text-[var(--verde)]' : (d.divergencia ?? 0) < 0 ? 'text-[var(--destructive)]' : ''}`}>
                        {d.divergencia ?? 0} barra(s)
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* aging de lotes */}
            <section className="ios-card p-4">
              <p className="mb-3 text-[14px] font-bold">Aging de lotes · barras restantes × dias</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-[var(--muted-foreground)]">
                      <th className="pb-2">Lote</th>
                      <th className="pb-2">Liga</th>
                      <th className="pb-2 text-right">Dias</th>
                      <th className="pb-2 text-right">Barras rest.</th>
                      <th className="pb-2 text-right">Pesado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.aging.map((a) => (
                      <tr key={a.lote} className="border-t border-[var(--border)]">
                        <td className="py-2 font-semibold">{a.lote}</td>
                        <td className="py-2 text-[var(--muted-foreground)]">{a.liga}</td>
                        <td className="py-2 text-right tabular-nums">{a.dias_desde_chegada}</td>
                        <td className="py-2 text-right tabular-nums font-bold">{a.barras_restantes}</td>
                        <td className="py-2 text-right tabular-nums">{a.percentual_pesado}%</td>
                      </tr>
                    ))}
                    {painel.aging.length === 0 && (
                      <tr><td colSpan={5} className="py-3 text-center text-[var(--muted-foreground)]">Sem lotes abertos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* % pesado vs estimado por lote */}
            <section className="ios-card p-4">
              <p className="mb-3 text-[14px] font-bold">% pesado vs estimado por lote</p>
              {painel.pesado_por_lote.length === 0 ? (
                <p className="text-[13px] text-[var(--muted-foreground)]">Nenhum monte pesado ainda.</p>
              ) : (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={painel.pesado_por_lote} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis type="category" dataKey="lote" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={70} />
                      <Tooltip contentStyle={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }} />
                      <Bar dataKey="percentual_pesado" fill="var(--verde)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <TabBar />
    </div>
  );
}

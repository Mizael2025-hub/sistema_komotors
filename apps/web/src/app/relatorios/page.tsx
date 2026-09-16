'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { consumir } from '@/lib/api/cliente';
import { SinoNotificacoes } from '@/components/sino';
import { ToggleTema, TabBar } from '@/components/ui';

type ItemLiga = { id: number; nome: string; cor: string };
type ItemLote = { id: number; codigo: string };
type ItemSetor = { id: number; nome: string };

type DefRelatorio = {
  id: string;
  nome: string;
  formatos: string[];
  precisa_periodo: boolean;
};

const RELATORIOS: DefRelatorio[] = [
  { id: 'movimentacoes', nome: 'Movimentações de chumbo', formatos: ['xlsx', 'pdf'], precisa_periodo: true },
  { id: 'saldo', nome: 'Saldo de estoque de chumbo', formatos: ['xlsx'], precisa_periodo: false },
  { id: 'contagens', nome: 'Contagens e divergências', formatos: ['xlsx', 'pdf'], precisa_periodo: true },
  { id: 'vendas', nome: 'Baixas / Vendas', formatos: ['xlsx', 'pdf'], precisa_periodo: true },
];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const primeirosDoMes = () => `${hojeISO().slice(0, 7)}-01`;

export default function PaginaRelatoriosChumbo() {
  const [ligas, setLigas] = useState<ItemLiga[] | null>(null);
  const [lotes, setLotes] = useState<ItemLote[]>([]);
  const [setores, setSetores] = useState<ItemSetor[]>([]);

  const [de, setDe] = useState(primeirosDoMes());
  const [ate, setAte] = useState(hojeISO());
  const [ligaId, setLigaId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [tipoMvt, setTipoMvt] = useState('');
  const [setorId, setSetorId] = useState('');

  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
     
    consumir<{ itens: ItemLiga[] }>('/api/config/ligas').then((r) => setLigas(r.itens ?? [])).catch(() => setLigas([]));
    // lista de setores é melhor-esforço para o filtro
    consumir<{ itens: ItemSetor[] }>('/api/config/setores').then((r) => setSetores(r.itens ?? [])).catch(() => setSetores([]));
  }, []);

  useEffect(() => {
    if (ligaId === '') return;
     
    consumir<{ lotes: ItemLote[] }>(`/api/lead/stock?liga_id=${ligaId}`).then((r) => setLotes(r.lotes.map((l) => ({ id: l.id, codigo: l.codigo })))).catch(() => setLotes([]));
  }, [ligaId]);

  async function baixar(relatorio: DefRelatorio, formato: 'xlsx' | 'pdf') {
    const chave = `${relatorio.id}:${formato}`;
    setBaixando(chave);
    setErro(null);
    try {
      const p = new URLSearchParams();
      p.set('tipo', relatorio.id);
      p.set('formato', formato);
      if (relatorio.precisa_periodo || de) {
        p.set('de', de);
        p.set('ate', ate);
      }
      if (ligaId) p.set('liga_id', ligaId);
      if (loteId) p.set('lote_id', loteId);
      if (relatorio.id === 'movimentacoes' && tipoMvt) p.set('tipo_mvt', tipoMvt);
      if (setorId) p.set('setor_id', setorId);

      const r = await fetch(`/api/lead/reports?${p.toString()}`);
      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        throw new Error(corpo?.erro ?? 'Erro ao gerar relatório.');
      }
      const blob = await r.blob();
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nome = r.headers.get('Content-Disposition')?.match(/"([^"]+)"/)?.[1] ?? `relatorio.${formato}`;
      a.href = urlObj;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao gerar relatório.');
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-background/85 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Relatórios</h1>
          <p className="text-[12px] text-[var(--muted-foreground)]">Chumbo · XLSX e PDF</p>
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes />
          <ToggleTema />
          <Link href="/menu" className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--tint)]">
            Menu
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        {erro && <p role="alert" className="mb-3 rounded-xl bg-[var(--destructive)]/10 px-3 py-2 text-[13px] font-medium text-[var(--destructive)]">{erro}</p>}

        {/* filtros comuns (RF-R01) */}
        <div className="ios-card mb-4 p-4">
          <p className="mb-3 text-[14px] font-bold">Filtros</p>
          <div className="ios-group mb-3">
            <div className="ios-field">
              <span>De</span>
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="text-right" />
            </div>
            <div className="ios-field">
              <span>Até</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="text-right" />
            </div>
            <div className="ios-field">
              <span>Liga</span>
              <select value={ligaId} onChange={(e) => { setLigaId(e.target.value); setLoteId(''); if (e.target.value === '') setLotes([]); }}>
                <option value="">Todas</option>
                {(ligas ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Lote</span>
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)} disabled={ligaId === ''}>
                <option value="">Todos</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>{l.codigo}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Setor</span>
              <select value={setorId} onChange={(e) => setSetorId(e.target.value)}>
                <option value="">Todos</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Tipo mov.</span>
              <select value={tipoMvt} onChange={(e) => setTipoMvt(e.target.value)}>
                <option value="">Todos</option>
                <option value="ENTRADA">Entrada</option>
                <option value="RESERVA">Reserva</option>
                <option value="MOVIMENTO_SETOR">Movimento ao setor</option>
                <option value="BAIXA_VENDA">Baixa/Venda</option>
                <option value="EDICAO">Edição</option>
                <option value="RECONCILIACAO">Reconciliação</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)]">Os relatórios usam os filtros aplicados. Setor/tipo ficam desconsiderados quando vazios.</p>
        </div>

        {/* lista de relatórios com botões de formato (RF-R01/R02) */}
        <div className="grid gap-2.5">
          {RELATORIOS.map((rel) => (
            <div key={rel.id} className="ios-card p-4">
              <p className="text-[14px] font-bold">{rel.nome}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {rel.formatos.map((f) => (
                  <button
                    key={f}
                    onClick={() => baixar(rel, f as 'xlsx' | 'pdf')}
                    disabled={baixando != null}
                    className="ios-btn py-2.5 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={f === 'xlsx'
                      ? { background: 'var(--verde-soft)', color: 'var(--verde)' }
                      : { background: 'var(--destructive)', color: '#fff' }}
                  >
                    {baixando === `${rel.id}:${f}` ? 'Gerando.' : f === 'xlsx' ? 'XLSX' : 'PDF'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-[var(--muted-foreground)]">
          O arquivo baixa com nome datado. Relatórios pesados usam fila com notificação (aviso no sino).
        </p>
      </main>

      <TabBar />
    </div>
  );
}

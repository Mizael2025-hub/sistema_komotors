'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { COR_LIGA_HEX, type CorLiga } from '@komotors/shared';
import { enviar, consumir } from '@/lib/api/cliente';
import { BottomSheet, TabBar, ToggleTema } from '@/components/ui';

type ItemLiga = { id: number; nome: string; cor: string; ativo: boolean };
type Montes = Record<string, { qtd_barras: number; peso?: number; ordem?: number }>;

const dataHoje = () => new Date().toISOString().slice(0, 10);

export default function PaginaEntradaChumbo() {
  const [data, setData] = useState(dataHoje());
  const [codigo, setCodigo] = useState('');
  const [ligas, setLigas] = useState<{ itens: ItemLiga[] } | null>(null);
  const [ligaId, setLigaId] = useState('');
  const [fornecedor] = useState('INTERNO');
  const [pesoTotal, setPesoTotal] = useState('');
  const [linhas, setLinhas] = useState(2);
  const [colunas, setColunas] = useState(5);
  const [montes, setMontes] = useState<Montes>({});
  const [celula, setCelula] = useState<string | null>(null);
  const [qtd, setQtd] = useState('');
  const [peso, setPeso] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    consumir<{ itens: ItemLiga[] }>('/api/config/ligas').then((r) => setLigas(r)).catch(() => setLigas({ itens: [] }));
  }, []);

  const chave = (l: number, c: number) => `${l}-${c}`;

  const resumo = useMemo(() => {
    const lista = Object.values(montes);
    const barras = lista.reduce((s, m) => s + m.qtd_barras, 0);
    const pesoInformado = pesoTotal === '' ? null : Number(pesoTotal);
    const somaPesos = Object.values(montes).reduce((s, m) => s + (m.peso ?? 0), 0);
    return { montes: lista.length, barras, peso: pesoInformado ?? (somaPesos > 0 ? somaPesos : null) };
  }, [montes, pesoTotal]);

  function abrirCelula(l: number, c: number) {
    const kfun = chave(l, c);
    setCelula(kfun);
    const actual = montes[kfun];
    setQtd(actual ? String(actual.qtd_barras) : '');
    setPeso(actual && actual.peso != null ? String(actual.peso) : '');
  }

  function confirmarCelula() {
    if (!celula) return;
    const n = Number(qtd);
    if (!Number.isInteger(n) || n <= 0) {
      setErro('Informe uma quantidade de barras valida.');
      return;
    }
    setMontes((prev) => {
      const copia = { ...prev };
      if (celula in copia && qtd === '' && peso === '') delete copia[celula];
      else copia[celula] = { qtd_barras: n, peso: peso === '' ? undefined : Number(peso) };
      return copia;
    });
    setCelula(null);
    setErro(null);
  }

  function removerCelula() {
    if (!celula) return;
    setMontes((prev) => {
      const copia = { ...prev };
      delete copia[celula];
      return copia;
    });
    setCelula(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    const lista = Object.entries(montes).map(([k, m]) => {
      const [l, c] = k.split('-').map(Number);
      return { linha: l, coluna: c, qtd_barras: m.qtd_barras, peso: m.peso, ordem_liberacao: m.ordem };
    });
    if (lista.length === 0) {
      setErro('Marque pelo menos uma posicao na grade tocando nas celulas.');
      return;
    }
    setEnviando(true);
    try {
      const resultado = await enviar<{ lote: { id: number; codigo: string } }>('/api/lead/lots', {
        metodo: 'POST',
        corpo: {
          data_chegada: data,
          codigo: codigo.trim(),
          liga_id: Number(ligaId),
          fornecedor,
          peso_total_informado: pesoTotal === '' ? undefined : Number(pesoTotal),
          linhas,
          colunas,
          montes: lista,
        },
      });
      setSucesso(`Lote ${resultado.lote.codigo} cadastrado com ${lista.length} monte(s).`);
      setCodigo('');
      setPesoTotal('');
      setMontes({});
      setLinhas(2);
      setColunas(5);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao salvar entrada.');
    } finally {
      setEnviando(false);
    }
  }

  const nomeLiga = (id: string) => ligas?.itens.find((l) => String(l.id) === id)?.nome ?? '';
  const corHexLiga = (id: string) => {
    const cor = ligas?.itens.find((l) => String(l.id) === id)?.cor;
    return COR_LIGA_HEX[(cor as CorLiga) ?? 'CINZA'];
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-background/85 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Entrada de chumbo</h1>
          <p className="text-[12px] text-[var(--muted-foreground)]">Apontamento de remessa</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleTema />
          <Link href="/chumbo/estoque" className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--tint)]">
            Estoque
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        <form onSubmit={salvar} className="grid gap-4">
          <div className="ios-group">
            <div className="ios-field">
              <span>Data chegada</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="text-right" />
            </div>
            <div className="ios-field">
              <span>Nº do lote</span>
              <input required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: 0915" />
            </div>
            <div className="ios-field">
              <span>Liga</span>
              <select required value={ligaId} onChange={(e) => setLigaId(e.target.value)}>
                <option value="">Escolha…</option>
                {(ligas?.itens ?? []).filter((l) => l.ativo).map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Peso total</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={pesoTotal} onChange={(e) => setPesoTotal(e.target.value)}
                placeholder="Opcional — remessa pesada de uma vez" />
            </div>
          </div>

          <div className="px-1 text-[12.5px] text-[var(--muted-foreground)]">
            Toque nas posições onde o chumbo está fisicamente. Cada toque abre o monte.
          </div>

          <div className="ios-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-bold">Grade 2D</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setLinhas((v) => Math.min(20, v + 1))}
                  className="flex items-center gap-1 rounded-[10px] bg-[var(--muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tint)] active:scale-95">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 9v6M9 12h6" /></svg>
                  Linha
                </button>
                <button type="button" onClick={() => setColunas((v) => Math.min(20, v + 1))}
                  className="flex items-center gap-1 rounded-[10px] bg-[var(--muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tint)] active:scale-95">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 9v6M9 12h6" /></svg>
                  Coluna
                </button>
              </div>
            </div>

            <div className="grid gap-2 overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(4.5rem, 1fr))` }}>
              {Array.from({ length: linhas * colunas }, (_, i) => {
                const l = Math.floor(i / colunas) + 1;
                const c = (i % colunas) + 1;
                const k = chave(l, c);
                const m = montes[k];
                const preenchida = !!m;
                return (
                  <button key={k} type="button" onClick={() => abrirCelula(l, c)}
                    className={`h-[4.25rem] rounded-xl transition-transform active:scale-95 ${preenchida ? 'border-2 bg-[var(--card)] shadow-sm' : 'border-2 border-dashed'}`}
                    style={preenchida
                      ? { borderColor: corHexLiga(ligaId) || 'var(--tint)' }
                      : { borderColor: 'var(--border)' }}
                  >
                    {preenchida ? (
                      <span className="flex flex-col items-center justify-center gap-0.5">
                        <span className="text-[15px] font-extrabold tracking-tight">
                          {m.peso != null ? `${fmt(m.peso)}k` : `${m.qtd_barras}b`}
                        </span>
                        <span className="text-[10.5px] font-semibold text-[var(--muted-foreground)]">{m.qtd_barras} barras</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">{l}.{c}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {celula && (
              <div className="mt-3 rounded-xl bg-[var(--muted)] p-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">Quantidade de barras</span>
                    <input type="number" min={1} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="50"
                      className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 text-[15px] font-semibold outline-none" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">Peso (kg) — opcional</span>
                    <input type="number" min={0} step="0.01" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)}
                      className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 text-[15px] font-semibold outline-none" />
                  </label>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button type="button" onClick={removerCelula}
                    className="ios-btn ios-btn-secundario flex-1 py-2.5 text-[14px]">Remover</button>
                  <button type="button" onClick={confirmarCelula}
                    className="ios-btn ios-btn-primario flex-1 py-2.5 text-[14px]">OK</button>
                </div>
              </div>
            )}

            <p className="mt-2 text-[10.5px] text-[var(--muted-foreground)]">
              Ordem de liberação padrão: cima→baixo, esquerda→direita. Linhas: {linhas} · Colunas: {colunas}
            </p>
          </div>

          <div className="ios-card p-4">
            <p className="mb-3 text-[14px] font-bold">Resumo do lote</p>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="ios-stat text-[var(--tint)]">
                <p className="text-[19px] font-extrabold tracking-tight" style={{ color: 'var(--tint)' }}>{resumo.montes}</p>
                <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">Montes</p>
              </div>
              <div className="ios-stat">
                <p className="text-[19px] font-extrabold tracking-tight" style={{ color: 'var(--tint)' }}>{resumo.barras || '—'}</p>
                <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">Barras</p>
              </div>
              <div className="ios-stat">
                <p className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--tint)' }}>
                  {resumo.peso != null ? `${fmt(resumo.peso)} kg` : Object.values(montes).some((m) => m.peso == null) && resumo.montes > 0 ? 'Estimado' : '—'}
                </p>
                <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">{pesoTotal !== '' ? 'Peso informado' : 'Peso'}</p>
              </div>
            </div>
          </div>

          {erro && (
            <p role="alert" className="rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--tint-soft)', color: 'var(--destructive)' }}>{erro}</p>
          )}
          {sucesso && (
            <p className="rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--verde-soft)', color: 'var(--verde)' }}>{sucesso}</p>
          )}

          <button type="submit" disabled={enviando}
            className="ios-btn ios-btn-primario h-11 disabled:opacity-50">
            {enviando ? 'Salvando…' : 'Salvar entrada'}
          </button>

          {sucesso && (
            <Link href="/chumbo/estoque" className="text-center text-[13px] font-semibold text-[var(--tint)]">
              Ver estoque →
            </Link>
          )}
        </form>
      </main>

      <TabBar />
    </div>
  );
}

const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);

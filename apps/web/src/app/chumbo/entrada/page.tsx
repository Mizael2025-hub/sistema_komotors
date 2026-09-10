'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { enviar, consumir } from '@/lib/api/cliente';

type ItemLiga = { id: number; nome: string; cor: string; ativo: boolean };
type Montes = Record<string, { qtd_barras: number; peso?: number; ordem?: number }>;

const dataHoje = () => new Date().toISOString().slice(0, 10);

export default function PaginaEntradaChumbo() {
  const [data, setData] = useState(dataHoje());
  const [codigo, setCodigo] = useState('');
  const [ligas, setLigas] = useState<{ itens: ItemLiga[] } | null>(null);
  const [ligaId, setLigaId] = useState('');
  const [fornecedor, setFornecedor] = useState('INTERNO');
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

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Menu</Link>
          <span className="text-sm font-semibold">Chumbo — Entrada</span>
          <Link href="/chumbo/estoque" className="text-sm text-muted-foreground hover:text-foreground">Estoque →</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-5">
        <form onSubmit={salvar} className="grid gap-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Data da chegada</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Numero do lote (unico)</span>
              <input required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: L-2026-001"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Liga de chumbo (toda a remessa)</span>
              <select required value={ligaId} onChange={(e) => setLigaId(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none">
                <option value="">Escolha…</option>
                {(ligas?.itens ?? []).filter((l) => l.ativo).map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Fornecedor</span>
              <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none">
                <option value="INTERNO">Interno (~50 barras/monte)</option>
                <option value="EXTERNO">Externo (~35 barras/monte)</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>
            <label className="grid gap-1.5 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Peso total informado (kg) — opcional; usado quando a remessa foi pesada de uma vez</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={pesoTotal} onChange={(e) => setPesoTotal(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none" />
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Grade 2D — toque onde o chumbo fisicamente esta</p>
              <div className="flex gap-2 text-xs">
                <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                  L: {linhas}
                  <button type="button" onClick={() => setLinhas((v) => Math.max(1, v - 1))} className="px-1">−</button>
                  <button type="button" onClick={() => setLinhas((v) => Math.min(20, v + 1))} className="px-1">+</button>
                </span>
                <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                  C: {colunas}
                  <button type="button" onClick={() => setColunas((v) => Math.max(1, v - 1))} className="px-1">−</button>
                  <button type="button" onClick={() => setColunas((v) => Math.min(20, v + 1))} className="px-1">+</button>
                </span>
              </div>
            </div>

            <div className="grid overflow-x-auto rounded-lg" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(3rem, 1fr))` }}>
              {Array.from({ length: linhas * colunas }, (_, i) => {
                const l = Math.floor(i / colunas) + 1;
                const c = (i % colunas) + 1;
                const k = chave(l, c);
                const m = montes[k];
                return (
                  <button key={k} type="button" onClick={() => abrirCelula(l, c)}
                    className={`m-0.5 h-14 min-w-12 rounded-lg border text-xs transition-colors ${
                      montes[k]
                        ? 'border-foreground/40 bg-foreground/10 font-medium'
                        : celula === k
                          ? 'border-foreground/60 bg-muted'
                          : 'border-dashed border-border text-muted-foreground'
                    }`}>
                    {montes[k] ? (
                      <span className="block">
                        {m.qtd_barras} br{m.peso ? ` · ${m.peso}kg` : ''}
                      </span>
                    ) : (
                      <span className="text-[10px]">{l}.{c}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {celula && (
              <div className="mt-3 grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Quantidade de barras</span>
                  <input type="number" min={1} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder={fornecedor === 'EXTERNO' ? '35' : '50'}
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Peso do monte (kg) — opcional</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none" />
                </label>
                <div className="flex items-end gap-1.5">
                  <button type="button" onClick={confirmarCelula}
                    className="h-9 rounded-lg bg-foreground px-3 text-xs text-background">OK</button>
                  <button type="button" onClick={removerCelula}
                    className="h-9 rounded-lg border border-border px-2 text-xs">Limpar</button>
                </div>
              </div>
            )}

            <p className="mt-2 text-[11px] text-muted-foreground">
              Ordem de liberação padrão: cima→baixo, esquerda→direita (editável pela tela de estoque).
            </p>
          </div>

          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
            <div><p className="text-[11px] text-muted-foreground">Montes</p><p className="text-lg font-semibold">{resumo.montes}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Barras</p><p className="text-lg font-semibold">{resumo.barras || '—'}</p></div>
            <div>
              <p className="text-[11px] text-muted-foreground">Peso total {pesoTotal !== '' ? '(informado)' : '(somado)'}</p>
              <p className="text-lg font-semibold">
                {resumo.peso != null
                  ? `${resumo.peso} kg`
                  : Object.values(montes).some((m) => m.peso == null) && Object.keys(montes).length > 0
                    ? 'Estimado pelo sistema'
                    : '—'}
              </p>
            </div>
          </div>

          {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          {sucesso && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{sucesso}</p>}

          <button type="submit" disabled={enviando}
            className="h-11 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {enviando ? 'Salvando…' : 'Salvar entrada de chumbo'}
          </button>

          {sucesso && (
            <Link href="/chumbo/estoque" className="text-center text-sm text-muted-foreground hover:text-foreground">
              Ver estoque de chumbo →
            </Link>
          )}
        </form>
      </main>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { enviar, consumir } from '@/lib/api/cliente';
import { BottomSheet, corLigaHex, TabBar, ToggleTema, Toast, type ToastAviso } from '@/components/ui';
import { SinoNotificacoes } from '@/components/sino';

type ItemLiga = { id: number; nome: string; cor: string; ativo: boolean };
type Montes = Record<string, { qtd_barras: number; peso?: number; ordem?: number }>;

const dataHoje = () => new Date().toISOString().slice(0, 10);
const letraLinha = (l: number) => String.fromCharCode(64 + l);
const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);

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
  const [celula, setCelula] = useState<{ l: number; c: number } | null>(null);
  const [qtd, setQtd] = useState('');
  const [peso, setPeso] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<ToastAviso>(null);
  const [enviando, setEnviando] = useState(false);

  const sumirToast = useCallback(() => setAviso(null), []);

  useEffect(() => {
    consumir<{ itens: ItemLiga[] }>('/api/config/ligas').then((r) => setLigas(r)).catch(() => setLigas({ itens: [] }));
  }, []);

  const chave = (l: number, c: number) => `${l}-${c}`;

  const resumo = useMemo(() => {
    const lista = Object.values(montes);
    const barras = lista.reduce((s, m) => s + m.qtd_barras, 0);
    const pesoInformado = pesoTotal === '' ? null : Number(pesoTotal);
    const somaPesos = lista.reduce((s, m) => s + (m.peso ?? 0), 0);
    return { montes: lista.length, barras, peso: pesoInformado ?? (somaPesos > 0 ? somaPesos : null) };
  }, [montes, pesoTotal]);

  function abrirCelula(l: number, c: number) {
    const k = chave(l, c);
    setCelula({ l, c });
    const atual = montes[k];
    setQtd(atual ? String(atual.qtd_barras) : '');
    setPeso(atual && atual.peso != null ? String(atual.peso) : '');
  }

  function fecharCelula() {
    setCelula(null);
    setQtd('');
    setPeso('');
  }

  function confirmarCelula() {
    if (!celula) return;
    const n = Number(qtd);
    if (!Number.isInteger(n) || n <= 0) {
      setAviso({ tipo: 'warn', mensagem: 'Informe as barras' });
      return;
    }
    const k = chave(celula.l, celula.c);
    setMontes((prev) => ({ ...prev, [k]: { qtd_barras: n, peso: peso === '' ? undefined : Number(peso) } }));
    fecharCelula();
  }

  function removerCelula() {
    if (!celula) return;
    const k = chave(celula.l, celula.c);
    setMontes((prev) => {
      const copia = { ...prev };
      delete copia[k];
      return copia;
    });
    fecharCelula();
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    const lista = Object.entries(montes).map(([k, m]) => {
      const [l, c] = k.split('-').map(Number);
      return { linha: l, coluna: c, qtd_barras: m.qtd_barras, peso: m.peso, ordem_liberacao: m.ordem };
    });
    if (lista.length === 0) {
      setAviso({ tipo: 'warn', mensagem: 'Marque pelo menos um monte na grade' });
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
      setAviso({ tipo: 'ok', mensagem: `Lote ${resultado.lote.codigo} criado com ${lista.length} monte(s)` });
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

  const corHexLiga = (id: string) => corLigaHex(ligas?.itens.find((l) => String(l.id) === id)?.cor ?? '');

  return (
    <div className="min-h-dvh bg-background">
      <header className="ios-topbar">
        <div>
          <h1>Entrada de chumbo</h1>
          <div className="sub">Apontamento de remessa</div>
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes />
          <ToggleTema />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[480px] pb-32 pt-1">
        <form onSubmit={salvar} className="grid gap-4">
          <div className="ios-group mx-4">
            <div className="ios-field">
              <span>Data chegada</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="ios-field">
              <span>Nº do lote</span>
              <input required value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" pattern="[0-9]*" placeholder="Ex.: 0915" />
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
                placeholder="Opcional — ex.: 6250 kg" />
            </div>
          </div>

          <p className="hint mx-7 mb-2 text-[12.5px] leading-snug text-[var(--muted-foreground)]">
            Toque nas posições onde o chumbo está fisicamente. Cada toque abre o monte.
          </p>

          <div className="overflow-x-auto px-4 py-0.5">
            <div className="grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${colunas}, 88px)` }}>
              {Array.from({ length: linhas * colunas }, (_, i) => {
                const l = Math.floor(i / colunas) + 1;
                const c = (i % colunas) + 1;
                const k = chave(l, c);
                const m = montes[k];
                const preenchida = !!m;
                return (
                  <button key={k} type="button" onClick={() => abrirCelula(l, c)}
                    className={`relative flex h-[92px] flex-col items-center justify-center gap-0.5 rounded-[14px] text-center leading-tight transition-all active:scale-95 ${
                      preenchida ? 'border-2 border-solid bg-[var(--card)] shadow-[var(--sombra-card)]' : 'border-2 border-dashed bg-[var(--muted)]'
                    }`}
                    style={preenchida
                      ? { borderColor: corHexLiga(ligaId) || 'var(--tint)' }
                      : { borderColor: 'var(--border)' }}
                  >
                    {preenchida ? (
                      <>
                        {m.peso != null && m.peso > 0 ? (
                          <span className="whitespace-nowrap text-[15px] font-extrabold tracking-tight">{fmt(m.peso)}<span className="text-[10px] font-bold text-[var(--muted-foreground)]"> kg</span></span>
                        ) : (
                          <span className="whitespace-nowrap text-[15px] font-extrabold tracking-tight">{m.qtd_barras}b</span>
                        )}
                        <span className="text-[11.5px] font-semibold text-[var(--muted-foreground)]">{m.qtd_barras} barras</span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">{letraLinha(l)}{c}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ios-grade-tools px-4">
            <button type="button" onClick={() => setLinhas((v) => Math.min(20, v + 1))}>
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 9v6M9 12h6" /></svg>
              Adicionar linha
            </button>
            <button type="button" onClick={() => setColunas((v) => Math.min(20, v + 1))}>
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 9v6M9 12h6" /></svg>
              Adicionar coluna
            </button>
            <button type="button" onClick={() => setMontes({})}>
              <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
              Limpar
            </button>
          </div>

          <div className="ios-card mx-4">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5">
              <span className="text-[15px] font-bold">Resumo do lote</span>
              <span className="st-badge st-estoque">{resumo.montes} {resumo.montes === 1 ? 'monte' : 'montes'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 px-4 pb-3.5">
              <div className="ios-stat">
                <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">{resumo.peso != null ? fmt(resumo.peso) : '—'}<small className="text-[12px] font-semibold text-[var(--muted-foreground)]"> kg</small></p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">{pesoTotal !== '' ? 'Peso informado' : 'Peso'}</p>
              </div>
              <div className="ios-stat">
                <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">{resumo.barras || '—'}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Barras</p>
              </div>
              <div className="ios-stat">
                <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">{resumo.montes}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Montes</p>
              </div>
            </div>
          </div>

          {erro && (
            <p role="alert" className="mx-4 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--tint-soft)', color: 'var(--destructive)' }}>{erro}</p>
          )}

          <div className="mx-4">
            <button type="submit" disabled={enviando} className="ios-btn ios-btn-primario disabled:opacity-50">
              <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
              {enviando ? 'Salvando…' : 'Salvar entrada'}
            </button>
          </div>
        </form>
        <div className="h-5" />
      </main>

      {celula && (
        <BottomSheet titulo={`Monte ${letraLinha(celula.l)}${celula.c}`} onClose={fecharCelula}>
          <div className="ios-group">
            <label className="ios-field">
              <span>Peso (kg)</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={peso}
                onChange={(e) => setPeso(e.target.value)} placeholder="Opcional" />
            </label>
            <label className="ios-field">
              <span>Qtd. barras</span>
              <input type="number" min={1} inputMode="numeric" value={qtd}
                onChange={(e) => setQtd(e.target.value)} placeholder="50" />
            </label>
            <div className="ios-field">
              <span>Ordem liberação</span>
              <b className="flex-1 text-right text-[15px]">Auto (posição)</b>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2.5">
            {celula && montes[chave(celula.l, celula.c)] && (
              <button type="button" onClick={removerCelula} className="ios-btn ios-btn-secundario flex-1">Remover</button>
            )}
            <button type="button" onClick={confirmarCelula} className="ios-btn ios-btn-primario flex-[2]">OK</button>
          </div>
        </BottomSheet>
      )}

      <Toast aviso={aviso} aoSumir={sumirToast} />
      <TabBar />
    </div>
  );
}

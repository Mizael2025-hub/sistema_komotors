'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dataHojeLocal } from '@komotors/shared';
import { consumir, enviar } from '@/lib/api/cliente';
import { BottomSheet, corLigaHex, TabBar, ToggleTema, Toast, type ToastAviso } from '@/components/ui';
import { SinoNotificacoes } from '@/components/sino';

type ItemLiga = { id: number; nome: string; cor: string };
type ItemSetor = { id: number; nome: string; ativo?: boolean };

type Apontamento = {
  id: number;
  data: string;
  liga: ItemLiga;
  qtd_barras: number;
  lote: { id: number; codigo: string } | null;
  local: { id: number; nome: string } | null;
  observacao: string | null;
  divergencia_sistema: number | null;
  revisada_em: string | null;
  criado_em: string;
  usuario: string;
};

type TotalLiga = {
  liga: ItemLiga;
  apontado: number;
  sistema: number;
  divergencia: number;
  revisada_em: string | null;
};

type Contagem = {
  data: string;
  apontamentos: Apontamento[];
  totais: TotalLiga[];
};

type DiaContagem = { data: string; total_barras: number; apontamentos: number };

const dataBr = (iso: string) => (!iso ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/* "hoje" no fuso da fábrica — nunca UTC (RNF-07) */
const diaDesc = (d: string) => (d === dataHojeLocal() ? `Hoje · ${dataBr(d)}` : dataBr(d));

export default function PaginaContagemChumbo() {
  const [ligasItens, setLigasItens] = useState<ItemLiga[] | null>(null);
  const [setores, setSetores] = useState<ItemSetor[]>([]);
  const [data, setData] = useState(dataHojeLocal());
  const [contagem, setContagem] = useState<Contagem | null>(null);

  const [ligaForm, setLigaForm] = useState<number | ''>('');
  const [valor, setValor] = useState('');
  const [localId, setLocalId] = useState('');
  const [observacao, setObservacao] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [ligasAbertas, setLigasAbertas] = useState<Set<number>>(new Set());
  const [revisado, setRevisado] = useState(false);
  const [comparando, setComparando] = useState(false);
  const [diasLista, setDiasLista] = useState<DiaContagem[] | null>(null);
  const [compAlvo, setCompAlvo] = useState<string | null>(null);
  const [compContagem, setCompContagem] = useState<Contagem | null>(null);

  const [editando, setEditando] = useState<Apontamento | null>(null);
  const [editQtd, setEditQtd] = useState('');
  const [editLocal, setEditLocal] = useState<number | ''>('');
  const [editObs, setEditObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<ToastAviso>(null);

  const sumirToast = useCallback(() => setAviso(null), []);

  const carregarContagem = useCallback(async (dataISO: string) => {
    try {
      const r = await consumir<Contagem>(`/api/lead/counts?data=${dataISO}`);
      setContagem(r);
    } catch {
      setContagem(null);
    }
  }, []);

  useEffect(() => {
    consumir<{ itens: ItemLiga[] }>('/api/config/ligas').then((r) => setLigasItens(r.itens ?? [])).catch(() => setLigasItens([]));
    consumir<{ itens: ItemSetor[] }>('/api/config/setores').then((r) => setSetores((r.itens ?? []).filter((s) => s.ativo !== false))).catch(() => setSetores([]));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao trocar data
    carregarContagem(data);
    setRevisado(false);
    setCompAlvo(null);
    setCompContagem(null);
  }, [data, carregarContagem]);

  const podeEditarDia = data === dataHojeLocal();

  /* breakdown por local dentro de cada liga */
  const locaisPorLiga = useMemo(() => {
    const mapa = new Map<number, Map<string, number>>();
    for (const a of contagem?.apontamentos ?? []) {
      if (!mapa.has(a.liga.id)) mapa.set(a.liga.id, new Map());
      const porLocal = mapa.get(a.liga.id)!;
      const nome = a.local?.nome ?? 'Sem local';
      porLocal.set(nome, (porLocal.get(nome) ?? 0) + a.qtd_barras);
    }
    return mapa;
  }, [contagem]);

  function pressionar(v: string) {
    setValor((atual) => (atual.length >= 6 ? atual : atual + v));
  }

  function apagarUltimo() {
    setValor((atual) => atual.slice(0, -1));
  }

  function limparTudo() {
    setValor('');
  }

  async function adicionar() {
    if (ligaForm === '') {
      setAviso({ tipo: 'warn', mensagem: 'Escolha a liga' });
      return;
    }
    if (valor === '') {
      setAviso({ tipo: 'warn', mensagem: 'Digite as barras' });
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await enviar('/api/lead/counts', {
        metodo: 'POST',
        corpo: {
          acao: 'adicionar',
          dados: {
            data,
            liga_id: Number(ligaForm),
            qtd_barras: Number(valor),
            setor_id: localId === '' ? undefined : Number(localId),
            observacao: observacao || undefined,
          },
        },
      });
      setValor('');
      setObservacao('');
      setAviso({ tipo: 'ok', mensagem: 'Apontamento adicionado' });
      await carregarContagem(data);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao registrar apontamento.');
    } finally {
      setEnviando(false);
    }
  }

  async function revisar() {
    setEnviando(true);
    setErro(null);
    try {
      await enviar('/api/lead/counts', { metodo: 'POST', corpo: { acao: 'revisar', dados: { data } } });
      setRevisado(true);
      setAviso({ tipo: 'warn', mensagem: 'Revisão concluída — confira as divergências' });
      await carregarContagem(data);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao revisar.');
    } finally {
      setEnviando(false);
    }
  }

  async function excluirApontamento(id: number) {
    if (!confirm('Excluir este apontamento?')) return;
    setEnviando(true);
    setErro(null);
    try {
      await enviar('/api/lead/counts', { metodo: 'POST', corpo: { acao: 'excluir', dados: { apontamento_id: id } } });
      setAviso({ tipo: 'info', mensagem: 'Apontamento excluído' });
      await carregarContagem(data);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao excluir apontamento.');
    } finally {
      setEnviando(false);
    }
  }

  function abrirEditar(a: Apontamento) {
    setEditando(a);
    setEditQtd(String(a.qtd_barras));
    setEditLocal(a.local ? a.local.id : '');
    setEditObs(a.observacao ?? '');
  }

  async function salvarEdicao() {
    if (!editando) return;
    setEnviando(true);
    setErro(null);
    try {
      await enviar('/api/lead/counts', {
        metodo: 'POST',
        corpo: {
          acao: 'editar',
          dados: {
            apontamento_id: editando.id,
            qtd_barras: editQtd === '' ? undefined : Number(editQtd),
            setor_id: editLocal === '' ? null : Number(editLocal),
            observacao: editObs === '' ? null : editObs,
          },
        },
      });
      setEditando(null);
      setAviso({ tipo: 'ok', mensagem: 'Apontamento atualizado' });
      await carregarContagem(data);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao editar apontamento.');
    } finally {
      setEnviando(false);
    }
  }

  async function abrirComparar() {
    setComparando(true);
    try {
      const r = await consumir<{ dias: DiaContagem[] }>('/api/lead/counts?resumo=1&dias=30');
      setDiasLista(r.dias ?? []);
    } catch {
      setDiasLista([]);
    }
  }

  async function compararCom(alvo: string) {
    setComparando(false);
    setCompAlvo(alvo);
    try {
      const r = await consumir<Contagem>(`/api/lead/counts?data=${alvo}`);
      setCompContagem(r);
      setAviso({ tipo: 'ok', mensagem: 'Comparação atualizada' });
    } catch {
      setCompContagem(null);
    }
  }

  function trocarData(v: string) {
    setData(v || data);
    if (v && v !== dataHojeLocal()) setAviso({ tipo: 'info', mensagem: 'Visualizando outro dia — somente leitura' });
  }

  const subTopo = data === dataHojeLocal() ? `Hoje · ${dataBr(data)}` : dataBr(data);

  return (
    <div className="min-h-dvh bg-background">
      <header className="ios-topbar">
        <div>
          <h1>Contagem</h1>
          <div className="sub">{subTopo}</div>
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes />
          <ToggleTema />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[480px] pb-32 pt-1">
        {erro && (
          <p role="alert" className="mx-4 mb-3 rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--destructive)]" style={{ background: 'var(--destructive-soft)' }}>{erro}</p>
        )}

        {/* formulário do apontamento */}
        <div className="ios-group mx-4 mb-4">
          <div className="ios-field">
            <span>Data</span>
            <input type="date" value={data} onChange={(e) => trocarData(e.target.value)} />
          </div>
          <div className="ios-field">
            <span>Liga</span>
            <div className="flex flex-1 justify-end gap-2">
            {(ligasItens ?? []).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLigaForm((atual) => (atual === l.id ? '' : l.id))}
                aria-pressed={ligaForm === l.id}
                aria-label={l.nome}
                className={`dot-liga ${ligaForm === l.id ? 'on' : ''}`}
                style={{ backgroundColor: corLigaHex(l.cor), color: l.cor === 'AMARELO' ? '#1c1c1e' : '#fff' }}
              >
                {l.nome.match(/\d+/)?.[0] ?? l.id}
              </button>
            ))}
              {(ligasItens ?? []).length === 0 && (
                <span className="text-[13px] text-[var(--muted-foreground)]">Sem ligas cadastradas</span>
              )}
            </div>
          </div>
          <div className="ios-field">
            <span>Local</span>
            <select value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Escolha…</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div className="ios-field">
            <span>Observação</span>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional — só se precisar" />
          </div>
        </div>

        {/* teclado numérico */}
        <div className="ios-card mx-4 mb-4">
          <div className="ios-num-display">
            <input readOnly inputMode="none" placeholder="0" value={valor} aria-label="Quantidade de barras" />
          </div>
          <div className="ios-numpad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
              <button key={n} type="button" onClick={() => pressionar(n)}>{n}</button>
            ))}
            <button type="button" className="limpar" onClick={limparTudo} aria-label="Limpar tudo">C</button>
            <button type="button" onClick={() => pressionar('0')}>0</button>
            <button type="button" className="backspace" onClick={apagarUltimo} aria-label="Apagar último dígito">⌫</button>
          </div>
          <div className="px-4 pb-3.5">
            <button onClick={adicionar} disabled={enviando} className="ios-btn ios-btn-primario disabled:opacity-40">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              {enviando ? 'Enviando…' : 'Adicionar apontamento'}
            </button>
          </div>
        </div>

        {/* totais por liga */}
        {contagem && contagem.totais.length > 0 && (
          <div className="ios-card mb-4 mx-4 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5">
              <span className="text-[15px] font-bold">Totais · {dataCurta(data)}</span>
              <button onClick={revisar} disabled={enviando} className="st-badge st-estoque disabled:opacity-40">
                Revisar ↗
              </button>
            </div>
            <div className="ios-divider" />

            {contagem.totais.map((t, i) => {
              const aberta = ligasAbertas.has(t.liga.id);
              const locais = [...(locaisPorLiga.get(t.liga.id) ?? new Map()).entries()];
              return (
                <div key={t.liga.id} className={i > 0 ? 'border-t border-[var(--border)]' : ''}>
                  <button
                    onClick={() => setLigasAbertas((prev) => {
                      const copia = new Set(prev);
                      if (copia.has(t.liga.id)) copia.delete(t.liga.id);
                      else copia.add(t.liga.id);
                      return copia;
                    })}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left active:bg-[var(--muted)]"
                  >
                    <span className="h-[11px] w-[11px] shrink-0 rounded-full" style={{ backgroundColor: corLigaHex(t.liga.cor) }} />
                    <b className="flex-1 text-[15px]">{t.liga.nome}</b>
                    <b className="text-[17px] font-extrabold">{t.apontado}</b>
                    <span className="w-[74px] text-right text-[12px] font-semibold text-[var(--muted-foreground)]">barras</span>
                    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} fill="none" stroke="var(--muted-foreground)" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {aberta && (
                    <div className="px-4 pb-2">
                      {locais.length ? locais.map(([loc, v]) => (
                        <div key={loc} className="flex items-center py-1.5 pl-3 text-[13.5px]">
                          <span className="flex-1 text-[var(--muted-foreground)]">{loc}</span>
                          <b className="font-bold">{v}</b>
                          <span className="ml-3 w-16 text-right text-[11.5px] text-[var(--muted-foreground)]">barras</span>
                        </div>
                      )) : (
                        <p className="py-1.5 pl-3 text-[13px] text-[var(--muted-foreground)]">Sem apontamentos</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="px-4 pb-3.5 pt-1">
              <button onClick={abrirComparar} className="ios-btn ios-btn-secundario" style={{ paddingTop: 11, paddingBottom: 11, fontSize: 15 }}>
                <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path d="M4 6h16M4 12h10M4 18h14M18 9l3 3-3 3" /></svg>
                Comparar com outro dia
              </button>
            </div>

            {/* comparação com outro dia */}
            {compAlvo && compContagem && (
              <div className="px-4 pb-3.5">
                <b className="mb-1.5 block text-[13px] text-[var(--muted-foreground)]">{diaDesc(data)} × {diaDesc(compAlvo)}</b>
                {(() => {
                  const ligasUnion = new Map<number, ItemLiga>();
                  for (const t of [...contagem.totais, ...compContagem.totais]) ligasUnion.set(t.liga.id, t.liga);
                  return [...ligasUnion.values()].map((l) => {
                    const a = contagem.totais.find((t) => t.liga.id === l.id)?.apontado ?? 0;
                    const b = compContagem.totais.find((t) => t.liga.id === l.id)?.apontado ?? 0;
                    const dif = a - b;
                    const cor = dif === 0 ? 'var(--verde)' : dif > 0 ? 'var(--laranja)' : 'var(--destructive)';
                    return (
                      <div key={l.id} className="flex items-center gap-2.5 border-t border-[var(--border)] py-2 text-[13.5px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corLigaHex(l.cor) }} />
                        <b className="w-[52px]">{l.nome}</b>
                        <span className="text-[var(--muted-foreground)]">{dataCurta(data)} <b className="text-[var(--foreground)]">{a}</b></span>
                        <span className="text-[var(--muted-foreground)]">{dataCurta(compAlvo)} <b className="text-[var(--foreground)]">{b}</b></span>
                        <span className="ml-auto rounded-[9px] px-2.5 py-[3px] text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}>
                          {dif === 0 ? 'igual' : `${dif > 0 ? '+' : '−'}${Math.abs(dif)} barras`}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* caixa de divergência pós-revisão */}
            {revisado && (
              <div className="px-4 pb-3.5">
                <div className="rounded-xl px-3.5 py-3" style={{ background: 'var(--destructive-soft)' }}>
                  <b className="text-[13px] text-[var(--destructive)]">⚠ Divergência encontrada</b>
                  {contagem.totais.map((t) => {
                    const dif = t.divergencia;
                    const cor = dif === 0 ? 'var(--verde)' : 'var(--destructive)';
                    return (
                      <p key={t.liga.id} className="mt-1 text-[13.5px] text-[var(--muted-foreground)]">
                        {t.liga.nome}: sistema <b className="text-[var(--foreground)]">{t.sistema}</b> · contado <b className="text-[var(--foreground)]">{t.apontado}</b>{' '}
                        <b style={{ color: cor }}>{dif === 0 ? '✓ ok' : `${dif > 0 ? '+' : '−'}${Math.abs(dif)} barras`}</b>
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            {!podeEditarDia && <p className="px-4 pb-3.5 text-[11px] text-[var(--muted-foreground)]">Apontamentos só podem ser alterados no próprio dia.</p>}
          </div>
        )}

        {/* histórico do dia */}
        <div className="ios-section-label">Apontamentos · {dataCurta(data)}</div>
        <div className="ios-card mx-4 overflow-hidden">
          {(contagem?.apontamentos ?? []).length === 0 && (
            <p className="px-4 py-4.5 text-center text-[14px] text-[var(--muted-foreground)]">Nenhum apontamento neste dia</p>
          )}
          {(contagem?.apontamentos ?? []).map((a, i) => (
            <div key={a.id} className={`flex items-center gap-2.5 px-4 py-3 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
              <span className="h-[11px] w-[11px] shrink-0 rounded-full" style={{ backgroundColor: corLigaHex(a.liga.cor) }} />
              <div className="min-w-0 flex-1">
                <b className="block text-[15px]">{a.liga.nome}</b>
                <div className="truncate text-[12.5px] font-medium text-[var(--muted-foreground)]">
                  {a.local?.nome ?? 'Sem local'}{a.observacao ? ` · ${a.observacao}` : ''}
                </div>
              </div>
              <b className="text-[15px] font-bold">{a.qtd_barras}</b>
              {podeEditarDia && (
                <span className="flex shrink-0 gap-1.5">
                  <button onClick={() => abrirEditar(a)} className="px-1 py-1 text-[13px] font-bold text-[var(--tint)]">Editar</button>
                  <button onClick={() => excluirApontamento(a.id)} className="px-1 py-1 text-[13px] font-bold text-[var(--destructive)]">Excluir</button>
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="hint mx-7 mt-2 text-[12.5px] leading-snug text-[var(--muted-foreground)]">
          Os locais disponíveis no campo Local são os setores cadastrados em Configurações → Setores — a lista aparece aqui automaticamente.
        </p>
        <div className="h-5" />
      </main>

      {/* editar apontamento */}
      {editando && (
        <BottomSheet titulo={`Editar · ${editando.liga.nome}`} onClose={() => setEditando(null)}>
          <div className="ios-group mb-3">
            <div className="ios-field">
              <span>Barras</span>
              <input required value={editQtd} onChange={(e) => setEditQtd(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" pattern="[0-9]*" />
            </div>
            <div className="ios-field">
              <span>Local</span>
              <select value={String(editLocal)} onChange={(e) => setEditLocal(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Sem local</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Observação</span>
              <input value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
          </div>
          <button onClick={salvarEdicao} disabled={enviando}
            className="ios-btn ios-btn-primario disabled:opacity-40">
            {enviando ? 'Aplicando…' : 'Salvar edição'}
          </button>
        </BottomSheet>
      )}

      {/* escolher dia para comparar */}
      {comparando && (
        <BottomSheet titulo="Escolher dia para comparar" onClose={() => setComparando(false)}>
          {(diasLista ?? []).filter((d) => d.data !== data).length === 0 && (
            <p className="px-4 py-4 text-center text-[14px] text-[var(--muted-foreground)]">Nenhum outro dia com contagem</p>
          )}
          {(diasLista ?? []).filter((d) => d.data !== data).map((d) => (
            <button key={d.data} onClick={() => compararCom(d.data)} className="ios-field w-full text-left active:bg-[var(--muted)]">
              <b className="flex-1 text-[16px]">{diaDesc(d.data)}</b>
              <span className="text-right">
                <b className="block text-[15px]">{d.total_barras} barras</b>
                <span className="block text-[12px] text-[var(--muted-foreground)]">{d.apontamentos} apontamento(s)</span>
              </span>
            </button>
          ))}
        </BottomSheet>
      )}

      <Toast aviso={aviso} aoSumir={sumirToast} />
      <TabBar />
    </div>
  );
}

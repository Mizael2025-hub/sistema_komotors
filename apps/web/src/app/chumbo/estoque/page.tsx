'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { COR_LIGA_HEX, type CorLiga, type StatusMonte } from '@komotors/shared';
import { consumir, enviar } from '@/lib/api/cliente';

type Monte = {
  id: number;
  linha: number;
  coluna: number;
  qtd_barras: number;
  peso_exibido: number | null;
  estimado: boolean;
  status: StatusMonte;
  setor_reserva_id: number | null;
};

type Lote = {
  id: number;
  codigo: string;
  data_chegada: string;
  fornecedor: string;
  peso_total_informado: number | null;
  total_barras: number;
  total_montes: number;
  linhas: number;
  colunas: number;
  encerrado: boolean;
  resumo: { peso: number | null; barras: number };
  montes: Monte[];
};

type Estoque = {
  liga: { id: number; nome: string; cor: string };
  resumo: Record<'disponivel' | 'no_setor' | 'reservado' | 'vendido', { peso: number | null; barras: number }>;
  setores: { id: number; nome: string }[];
  lotes: Lote[];
};

type HistLinha = {
  id: number;
  tipo: string;
  status_anterior: string | null;
  status_novo: string | null;
  qtd_barras: number | null;
  peso: number | null;
  setor: string | null;
  destino: string | null;
  para_quem: string | null;
  observacao: string | null;
  data: string;
  criado_em: string;
  usuario: string;
};

type Historico = {
  monte: {
    id: number;
    status: StatusMonte;
    qtd_barras: number;
    peso_exibido: number | null;
    estimado: boolean;
    lote: { id: number; codigo: string; liga: { nome: string; cor: string } };
    setor_reserva: string | null;
  };
  movimentacoes: HistLinha[];
};

type ItemLiga = { id: number; nome: string; cor: string };

const ROTULO_STATUS: Record<StatusMonte, string> = {
  EM_ESTOQUE: '',
  RESERVADO: 'Reservado',
  NO_SETOR: 'No setor',
  PARCIAL: 'Parcial',
  VENDIDO: 'Vendido',
  AJUSTADO: 'Ajustado',
};

const ROTULO_TIPO: Record<string, string> = {
  ENTRADA: 'Entrada',
  RESERVA: 'Reserva',
  CANCELAMENTO_RESERVA: 'Reserva cancelada',
  MOVIMENTO_SETOR: 'Movimento ao setor',
  BAIXA_VENDA: 'Baixa / Venda',
  EDICAO: 'Edição',
  RECONCILIACAO: 'Reconciliação (sistema)',
  AJUSTE: 'Ajuste residual (sistema)',
};

const fmtPeso = (n: number | null | undefined) =>
  n == null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)} kg`;

const dataBr = (iso: string) => (!iso ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);

const hojeISO = () => new Date().toISOString().slice(0, 10);

function classeMonte(m: Monte, selecionado: boolean) {
  if (m.status === 'VENDIDO' || m.status === 'AJUSTADO') return 'border border-dashed border-border opacity-40';
  if (selecionado) return 'border-2 border-foreground bg-foreground/10';
  if (m.status === 'RESERVADO') return 'border-2 border-amber-500 bg-amber-500/10';
  if (m.status === 'NO_SETOR') return 'border border-blue-500/60 bg-blue-500/10';
  if (m.status === 'PARCIAL') return 'border border-purple-500/60 bg-purple-500/10';
  return 'border border-foreground/30';
}

export default function PaginaEstoqueChumbo() {
  const [ligasItens, setLigasItens] = useState<ItemLiga[] | null>(null);
  const [ligaId, setLigaId] = useState<number | null>(null);
  const [estoque, setEstoque] = useState<Estoque | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [arrastando, setArrastando] = useState<number | null>(null);

  const [modal, setModal] = useState<null | 'acoes' | 'historico'>(null);
  const [acaoAtiva, setAcaoAtiva] = useState<'reservar' | 'mover-setor' | 'venda' | 'editar' | null>(null);
  const [hist, setHist] = useState<Historico | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [formReserva, setFormReserva] = useState({ setor_id: '', observacao: '' });
  const [formMover, setFormMover] = useState({ setor_id: '', qtd_barras: '', peso: '', observacao: '' });
  const [formVenda, setFormVenda] = useState({ destino: '', para_quem: '', data: hojeISO(), qtd_barras: '', peso: '', pesoEditado: false, observacao: '' });
  const [formEditar, setFormEditar] = useState({ peso: '', qtd_barras: '' });

  const carregarLigas = useCallback(async () => {
    try {
      const r = await consumir<{ itens: { id: number; nome: string; cor: string }[] }>('/api/config/ligas');
      setLigasItens(r.itens ?? []);
    } catch {
      setLigasItens([]);
    }
  }, []);

  const carregarEstoque = useCallback(async (id: number) => {
    setErro(null);
    try {
      const r = await consumir<Estoque>(`/api/lead/stock?liga_id=${id}`);
      setEstoque(r);
      setExpandidos((prev) => {
        const validos = [...prev].filter((x) => r.lotes.some((l) => l.id === x));
        return validos.length ? new Set(validos) : new Set(r.lotes.slice(0, 1).map((l) => l.id));
      });
    } catch (ex) {
      setEstoque(null);
      setErro(ex instanceof Error ? ex.message : 'Erro ao carregar estoque.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de ligas no mount (setState pós-await)
    carregarLigas();
  }, [carregarLigas]);

  useEffect(() => {
    if (ligaId == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao trocar liga selecionada
    carregarEstoque(ligaId);
  }, [ligaId, carregarEstoque]);

  function trocarLiga(id: number) {
    setLigaId(id);
    setEstoque(null);
    setSelecionados(new Set());
    setModal(null);
    setAcaoAtiva(null);
    setHist(null);
  }

  function alternarExpandido(id: number) {
    setExpandidos((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarSelecao(modo: Monte) {
    setAviso(null);
    setSelecionados((prev) => {
      if (prev.has(modo.id)) {
        const copia = new Set(prev);
        copia.delete(modo.id);
        return copia;
      }
      if (modo.status === 'VENDIDO' || modo.status === 'AJUSTADO') {
        setAviso('Este monte saiu do estoque — toque duas vezes para ver o mini-resumo.');
        return prev;
      }
      const copia = new Set(prev);
      copia.add(modo.id);
      return copia;
    });
  }

  const montesConhecidos = () => estoque?.lotes.flatMap((l) => l.montes) ?? [];

  function abrirAcoes() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    const primeiro = montesConhecidos().find((m) => m.id === ids[0]);
    if (primeiro) {
      const pesoTexto = primeiro.peso_exibido != null ? String(primeiro.peso_exibido) : '';
      setFormMover((f) => ({ ...f, qtd_barras: String(primeiro.qtd_barras), peso: pesoTexto }));
      setFormVenda((f) => ({ ...f, qtd_barras: String(primeiro.qtd_barras), peso: pesoTexto }));
      setFormEditar({ peso: pesoTexto, qtd_barras: String(primeiro.qtd_barras) });
    }
    setAcaoAtiva(ids.some((id) => montesConhecidos().find((m) => m.id === id)?.status === 'RESERVADO') ? 'mover-setor' : 'reservar');
    setModal('acoes');
  }

  async function abrirHistorico(monteId: number) {
    setErro(null);
    try {
      const r = await consumir<Historico>(`/api/lead/piles/${monteId}`);
      setHist(r);
      setModal('historico');
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao carregar historico.');
    }
  }

  async function executarAcao() {
    if (acaoAtiva == null || selecionados.size === 0) return;
    setEnviando(true);
    setErro(null);
    try {
      if (acaoAtiva === 'editar') {
        const monteId = [...selecionados][0];
        await enviar(`/api/lead/piles/${monteId}`, {
          metodo: 'PATCH',
          corpo: {
            peso: formEditar.peso === '' ? undefined : Number(formEditar.peso),
            qtd_barras: formEditar.qtd_barras === '' ? undefined : Number(formEditar.qtd_barras),
          },
        });
      } else {
        let dados: unknown;
        if (acaoAtiva === 'reservar') {
          dados = {
            monte_ids: [...selecionados],
            setor_id: Number(formReserva.setor_id),
            observacao: formReserva.observacao || undefined,
          };
        } else if (acaoAtiva === 'mover-setor') {
          dados = {
            monte_ids: [...selecionados],
            setor_id: Number(formMover.setor_id),
            qtd_barras: formMover.qtd_barras === '' ? undefined : Number(formMover.qtd_barras),
            peso_informado: formMover.peso === '' ? undefined : Number(formMover.peso),
            observacao: formMover.observacao || undefined,
          };
        } else {
          const monteAlvo = montesConhecidos().find((m) => m.id === [...selecionados][0]);
          const pesoOriginal = monteAlvo?.peso_exibido != null ? String(monteAlvo.peso_exibido) : '';
          const editado = formVenda.peso !== '' && formVenda.peso !== pesoOriginal;
          dados = {
            monte_ids: [...selecionados],
            destino: formVenda.destino,
            para_quem: formVenda.para_quem,
            data: formVenda.data,
            qtd_barras: formVenda.qtd_barras === '' ? undefined : Number(formVenda.qtd_barras),
            peso_informado: formVenda.peso === '' ? undefined : Number(formVenda.peso),
            peso_editado: editado,
            observacao: formVenda.observacao || undefined,
          };
        }
        await enviar('/api/lead/actions', { metodo: 'POST', corpo: { acao: acaoAtiva, dados } });
      }
      setModal(null);
      setAcaoAtiva(null);
      setSelecionados(new Set());
      setAviso('Operação registrada com sucesso.');
      if (ligaId != null) await carregarEstoque(ligaId);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro na operação.');
      if (ligaId != null) await carregarEstoque(ligaId);
    } finally {
      setEnviando(false);
    }
  }

  async function dragSolto(loteId: number, linha: number, coluna: number, maxL: number, maxC: number) {
    if (arrastando == null) return;
    if (linha > maxL || coluna > maxC) return;
    setErro(null);
    try {
      await enviar(`/api/lead/piles/${arrastando}`, { metodo: 'PATCH', corpo: { linha, coluna } });
      setAviso('Monte reposicionado.');
      if (ligaId != null) await carregarEstoque(ligaId);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao reposicionar.');
      if (ligaId != null) await carregarEstoque(ligaId);
    } finally {
      setArrastando(null);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex gap-2 items-center border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Menu</Link>
        <span className="mx-auto text-sm font-semibold">Chumbo — Estoque</span>
        <Link href="/chumbo/entrada" className="text-sm text-muted-foreground hover:text-foreground">+ Entrada</Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {(ligasItens ?? []).map((l) => (
            <button
              key={l.id}
              onClick={() => trocarLiga(l.id)}
              aria-pressed={ligaId === l.id}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                ligaId === l.id ? 'font-medium ring-2 ring-foreground ring-offset-1' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[(l.cor as CorLiga) ?? 'CINZA'] }} />
              {l.nome}
            </button>
          ))}
        </div>

        {ligasItens != null && ligasItens.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma liga ativa. Cadastre em <Link href="/configuracoes" className="underline">Configurações</Link>.
          </p>
        )}
        {ligasItens != null && ligaId == null && ligasItens.length > 0 && (
          <p className="text-sm text-muted-foreground">Escolha uma liga para consultar o estoque.</p>
        )}

        {erro && modal !== 'acoes' && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        {aviso && <p className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}

        {estoque && (
          <>
            <div className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Disponível no estoque</p>
                <p className="text-lg font-semibold">{fmtPeso(estoque.resumo.disponivel.peso)}</p>
                <p className="text-xs text-muted-foreground">{estoque.resumo.disponivel.barras} barras</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">No setor</p>
                <p className="text-lg font-semibold">{fmtPeso(estoque.resumo.no_setor.peso)}</p>
                <p className="text-xs text-muted-foreground">{estoque.resumo.no_setor.barras} barras</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reservado</p>
                <p className="text-lg font-semibold">{fmtPeso(estoque.resumo.reservado.peso)}</p>
                <p className="text-xs text-muted-foreground">{estoque.resumo.reservado.barras} barras</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendido acumulado</p>
                <p className="text-lg font-semibold">{fmtPeso(estoque.resumo.vendido.peso)}</p>
                <p className="text-xs text-muted-foreground">{estoque.resumo.vendido.barras} barras</p>
              </div>
            </div>

            <div className="grid gap-3">
              {estoque.lotes.map((l) => (
                <div key={l.id} className={`rounded-2xl border border-border bg-card ${l.encerrado ? 'opacity-70' : ''}`}>
                  <button onClick={() => alternarExpandido(l.id)} className="w-full px-4 py-3 text-left">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        Lote {l.codigo}
                        {l.encerrado && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">encerrado</span>}
                      </p>
                      <span className="text-xs text-muted-foreground">{expandidos.has(l.id) ? 'recolher ▲' : 'expandir ▼'}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Chegada {dataBr(l.data_chegada)} · {fmtPeso(l.resumo.peso)} disponível · {l.resumo.barras}/{l.total_barras} barras · {l.total_montes} montes
                    </p>
                  </button>

                  {expandidos.has(l.id) && (
                    <div className="border-t border-border px-4 py-3">
                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Barras disponíveis: <b className="text-foreground">{l.resumo.barras}</b></span>
                        <span>Peso disponível: <b className="text-foreground">{fmtPeso(l.resumo.peso)}</b></span>
                        <span>Na chegada: {l.total_barras} barras{weightResumoTotal(l)}</span>
                      </div>

                      <div className="grid gap-1.5 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${l.colunas}, minmax(3rem, 1fr))` }}>
                        {(() => {
                          const celulas: (Monte | null)[] = new Array(l.linhas * l.colunas).fill(null);
                          for (const m of l.montes) celulas[(m.linha - 1) * l.colunas + (m.coluna - 1)] = m;
                          return celulas.map((m, indice) => {
                            const linha02 = Math.floor(indice / l.colunas) + 1;
                            const coluna02 = (indice % l.colunas) + 1;
                            if (!m) {
                              return (
                                <button
                                  key={`vazia-${indice}`}
                                  onClick={() => setSelecionados(new Set())}
                                  onDragOver={(e) => { if (arrastando != null) e.preventDefault(); }}
                                  onDrop={() => dragSolto(l.id, linha02, coluna02, l.linhas, l.colunas)}
                                  className="h-14 min-w-12 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground"
                                >
                                  {arrastando != null ? '↦' : `${linha02}.${coluna02}`}
                                </button>
                              );
                            }
                            return (
                              <button
                                key={m.id}
                                onClick={() => alternarSelecao(m)}
                                onDoubleClick={() => (m.status === 'VENDIDO' || m.status === 'AJUSTADO' ? abrirHistorico(m.id) : abrirAcoes())}
                                draggable={m.status !== 'VENDIDO' && m.status !== 'AJUSTADO'}
                                onDragStart={() => setArrastando(m.id)}
                                className={`m-0.5 h-14 min-w-12 rounded-lg p-1 text-left text-[10px] leading-tight ${classeMonte(m, selecionados.has(m.id))}`}
                              >
                                <span className="block truncate font-medium">{m.qtd_barras} br</span>
                                <span className="block truncate">{m.peso_exibido != null ? `${m.peso_exibido}${m.estimado ? '*' : ''}kg` : '—'}</span>
                                {ROTULO_STATUS[m.status] && <span className="block truncate text-[9px] text-muted-foreground">{ROTULO_STATUS[m.status]}</span>}
                              </button>
                            );
                          });
                        })()}
                      </div>

                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        * = peso estimado · 1 toque seleciona/desseleciona · clique em área vazia limpa · duplo clique abre ações (ou resumo de indisponível) · arraste para reorganizar
                      </p>
                    </div>
                  )}
                </div>
              ))}
              {estoque.lotes.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum lote desta liga ainda — <Link href="/chumbo/entrada" className="underline">registrar entrada</Link>
                </p>
              )}
            </div>

            {selecionados.size > 0 && (
              <div className="sticky bottom-3 mt-4 flex items-center justify-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 shadow-sm backdrop-blur">
                <span className="text-xs text-muted-foreground">{selecionados.size} selecionado(s)</span>
                <button onClick={abrirAcoes} className="rounded-full bg-foreground px-3.5 py-1 text-xs text-background">Ações</button>
                <button onClick={() => setSelecionados(new Set())} className="rounded-full border border-border px-3 py-1 text-xs">Limpar</button>
              </div>
            )}
          </>
        )}
      </main>

      {modal === 'acoes' && acaoAtiva && estoque && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={() => setModal(null)}>
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium">Ações — {selecionados.size} monte(s)</p>
              <button onClick={() => setModal(null)} className="text-sm text-muted-foreground">✕</button>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 text-xs">
              {(['reservar', 'mover-setor', 'venda', 'editar'] as const).map((a) => (
                <button key={a} onClick={() => setAcaoAtiva(a)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 ${acaoAtiva === a ? 'bg-foreground text-background' : 'border border-border text-muted-foreground'}`}>
                  {a === 'reservar' ? 'Reservar' : a === 'mover-setor' ? 'Mover ao setor' : a === 'venda' ? 'Baixa/Venda' : 'Editar'}
                </button>
              ))}
            </div>

            {acaoAtiva === 'reservar' && (
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Setor de destino</span>
                  <select value={formReserva.setor_id} onChange={(e) => setFormReserva({ ...formReserva, setor_id: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="">Escolha…</option>
                    {estoque.setores.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Observação (opcional)</span>
                  <input value={formReserva.observacao} onChange={(e) => setFormReserva({ ...formReserva, observacao: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <p className="text-[10px] text-muted-foreground">O chumbo continua no estoque, marcado como separado para o setor escolhido.</p>
              </div>
            )}

            {acaoAtiva === 'mover-setor' && (
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Setor de destino</span>
                  <select value={formMover.setor_id} onChange={(e) => setFormMover({ ...formMover, setor_id: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="">Escolha…</option>
                    {estoque.setores.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Barras (vazio = mover o monte todo; frações permitidas)</span>
                  <input type="number" min={1} inputMode="numeric" value={formMover.qtd_barras}
                    onChange={(e) => setFormMover({ ...formMover, qtd_barras: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Peso informado (kg) — se pesado de fato, vira peso real</span>
                  <input type="number" min={0.01} step="0.01" inputMode="decimal" value={formMover.peso}
                    onChange={(e) => setFormMover({ ...formMover, peso: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Observação (opcional)</span>
                  <input value={formMover.observacao} onChange={(e) => setFormMover({ ...formMover, observacao: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
              </div>
            )}

            {acaoAtiva === 'venda' && (
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Destino</span>
                  <input value={formVenda.destino} onChange={(e) => setFormVenda({ ...formVenda, destino: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Para quem</span>
                  <input value={formVenda.para_quem} onChange={(e) => setFormVenda({ ...formVenda, para_quem: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1">
                    <span className="text-[11px] text-muted-foreground">Data</span>
                    <input type="date" value={formVenda.data} onChange={(e) => setFormVenda({ ...formVenda, data: e.target.value })}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px] text-muted-foreground">Barras (vazio = tudo)</span>
                    <input type="number" min={1} inputMode="numeric" value={formVenda.qtd_barras}
                      onChange={(e) => setFormVenda({ ...formVenda, qtd_barras: e.target.value })}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                  </label>
                </div>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Peso (kg) — padrão: média do monte, editável</span>
                  <input type="number" min={0.01} step="0.01" inputMode="decimal" value={formVenda.peso}
                    onChange={(e) => setFormVenda({ ...formVenda, peso: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                  <span className="text-[10px] text-muted-foreground">Editar o peso marca como pesagem real (RF-P02/P04) e dispara a reconciliação do lote.</span>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Observação (aparece no relatório)</span>
                  <input value={formVenda.observacao} onChange={(e) => setFormVenda({ ...formVenda, observacao: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
              </div>
            )}

            {acaoAtiva === 'editar' && (
              <div className="grid gap-3">
                {selecionados.size > 1 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">A edição aplica ao primeiro monte da seleção.</p>}
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Novo peso exibido (kg)</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={formEditar.peso}
                    onChange={(e) => setFormEditar({ ...formEditar, peso: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-muted-foreground">Nova quantidade de barras</span>
                  <input type="number" min={1} inputMode="numeric" value={formEditar.qtd_barras}
                    onChange={(e) => setFormEditar({ ...formEditar, qtd_barras: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                </label>
              </div>
            )}

            {erro && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

            <button onClick={executarAcao}
              disabled={enviando || (acaoAtiva === 'reservar' && !formReserva.setor_id) || (acaoAtiva === 'mover-setor' && !formMover.setor_id) || (acaoAtiva === 'venda' && (!formVenda.destino || !formVenda.para_quem))}
              className="mt-4 h-10 w-full rounded-xl bg-foreground text-background text-sm font-medium disabled:opacity-50">
              {enviando ? 'Aplicando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {modal === 'historico' && hist && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={() => setModal(null)}>
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium">Histórico do monte</p>
              <button onClick={() => setModal(null)} className="text-sm text-muted-foreground">✕</button>
            </div>
            <div className="mb-4 rounded-xl border border-border bg-background p-3 text-xs">
              <p>Liga {hist.monte.lote.liga.nome} · Lote {hist.monte.lote.codigo}</p>
              <p>{hist.monte.qtd_barras} barras · {fmtPeso(hist.monte.peso_exibido)}{hist.monte.estimado ? ' (estimado)' : ''}</p>
              <p className="text-muted-foreground">Status: {ROTULO_STATUS[hist.monte.status] || 'Em estoque'}{hist.monte.setor_reserva ? ` — ${hist.monte.setor_reserva}` : ''}</p>
            </div>
            <ol className="relative border-l border-border pl-4">
              {hist.movimentacoes.map((mv) => (
                <li key={mv.id} className="mb-4">
                  <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-foreground/50" />
                  <p className="text-sm font-medium">{ROTULO_TIPO[mv.tipo] ?? mv.tipo}</p>
                  <p className="text-xs text-muted-foreground">
                    {dataBr(mv.data)} · {mv.usuario}{mv.setor ? ` · ${mv.setor}` : ''}{mv.para_quem ? ` · para ${mv.para_quem}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mv.qtd_barras != null ? `${mv.qtd_barras} barras` : ''}{mv.peso != null ? ` · ${fmtPeso(mv.peso)}` : ''}
                  </p>
                  {mv.observacao && <p className="mt-0.5 text-xs">{mv.observacao}</p>}
                </li>
              ))}
              {hist.movimentacoes.length === 0 && <li className="text-xs text-muted-foreground">Sem movimentações.</li>}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function weightResumoTotal(lote: Lote): string {
  return lote.peso_total_informado != null ? ` · informado ${fmtPeso(lote.peso_total_informado)}` : '';
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { COR_LIGA_HEX, type CorLiga } from '@komotors/shared';
import { consumir, enviar } from '@/lib/api/cliente';
import { BottomSheet, TabBar, ToggleTema } from '@/components/ui';
import { SinoNotificacoes } from '@/components/sino'


type ItemLiga = { id: number; nome: string; cor: string };

type Apontamento = {
  id: number;
  data: string;
  liga: ItemLiga;
  qtd_barras: number;
  lote: { id: number; codigo: string } | null;
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

const dataBr = (iso: string) => (!iso ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);
const hojeISO = () => new Date().toISOString().slice(0, 10);

export default function PaginaContagemChumbo() {
  const [ligasItens, setLigasItens] = useState<ItemLiga[] | null>(null);
  const [data, setData] = useState(hojeISO());
  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [lotesLiga, setLotesLiga] = useState<{ id: number; codigo: string }[]>([]);

  const [leagueForm, setLigaForm] = useState<number | ''>('');
  const [qtd, setQtd] = useState('');
  const [loteId, setLoteId] = useState<number | ''>('');
  const [observacao, setObservacao] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<Apontamento | null>(null);
  const [editQtd, setEditQtd] = useState('');
  const [editObs, setEditObs] = useState('');
  const [editLoteId, setEditLoteId] = useState<number | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao trocar data
    carregarContagem(data);
  }, [data, carregarContagem]);

  useEffect(() => {
    if (leagueForm == null || leagueForm === '') return;
     
    consumir<{ lotes: { id: number; codigo: string }[] }>(`/api/lead/stock?liga_id=${leagueForm}`)
      .then((r) => setLotesLiga(r.lotes.map((l) => ({ id: l.id, codigo: l.codigo }))))
      .catch(() => setLotesLiga([]));
  }, [leagueForm]);

  async function adicionar() {
    if (leagueForm === '' || qtd === '') return;
    setEnviando(true);
    setErro(null);
    try {
      await enviar('/api/lead/counts', {
        metodo: 'POST',
        corpo: {
          acao: 'adicionar',
          dados: {
            data,
            liga_id: Number(leagueForm),
            qtd_barras: Number(qtd),
            lote_id: loteId === '' ? undefined : Number(loteId),
            observacao: observacao || undefined,
          },
        },
      });
      setQtd('');
      setLoteId('');
      setObservacao('');
      setAviso('Apontamento registrado.');
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
      setAviso('Revisão registrada.');
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
      setAviso('Apontamento excluído.');
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
    setEditObs(a.observacao ?? '');
    setEditLoteId(a.lote ? a.lote.id : '');
    if (leagueForm !== a.liga.id) setLigaForm(a.liga.id);
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
            lote_id: editLoteId === '' ? null : Number(editLoteId),
            observacao: editObs === '' ? null : editObs,
          },
        },
      });
      setEditando(null);
      setAviso('Apontamento atualizado.');
      await carregarContagem(data);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao editar apontamento.');
    } finally {
      setEnviando(false);
    }
  }

  const podeSalvar = leagueForm !== '' && qtd !== '' && Number(qtd) > 0 && !enviando;
  const podeEditarDia = data === hojeISO();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-background/85 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Contagem de chumbo</h1>
          <p className="text-[12px] text-[var(--muted-foreground)]">{dataBr(data)}</p>
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
        {aviso && <p className="mb-3 rounded-xl bg-[var(--verde-soft)] px-3 py-2 text-[13px] font-medium text-[var(--verde)]">{aviso}</p>}

        {/* form de apontamento (RF-CT01) */}
        <div className="ios-card mb-4 p-4">
          <p className="mb-3 text-[14px] font-bold">Apontar</p>
          <div className="ios-group mb-3">
            <div className="ios-field">
              <span>Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="text-right" />
            </div>
          </div>

          <p className="mb-2 text-[12px] font-semibold text-[var(--muted-foreground)]">Liga</p>
          <div className="mb-4 flex gap-2.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: 'none' }}>
            {(ligasItens ?? []).map((l) => {
              const ativa = leagueForm === l.id;
              return (
                <button key={l.id} onClick={() => {
                  const nova = ativa ? '' : l.id;
                  setLigaForm(nova);
                  setLoteId('');
                  if (nova === '') setLotesLiga([]);
                }} aria-pressed={ativa}
                  className="flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 py-2 text-[13.5px] transition-all active:scale-95"
                  style={ativa
                    ? { backgroundColor: COR_LIGA_HEX[(l.cor as CorLiga) ?? 'CINZA'], borderColor: 'transparent', color: (l.cor as CorLiga) === 'AMARELO' ? '#1c1c1e' : '#fff' }
                    : { borderColor: 'var(--border)' }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[(l.cor as CorLiga) ?? 'CINZA'] }} />
                  {l.nome}
                </button>
              );
            })}
          </div>

          <div className="ios-group mb-3">
            <div className="ios-field">
              <span>Barras</span>
              <input required value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" pattern="[0-9]*" placeholder="Ex.: 300" />
            </div>
            <div className="ios-field">
              <span>Lote</span>
              <select value={String(loteId)} onChange={(e) => setLoteId(e.target.value === '' ? '' : Number(e.target.value))} disabled={leagueForm === ''}>
                <option value="">Opcional</option>
                {lotesLiga.map((l) => (
                  <option key={l.id} value={l.id}>{l.codigo}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Observação</span>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <button onClick={adicionar} disabled={!podeSalvar}
            className="ios-btn ios-btn-primario disabled:opacity-40 disabled:cursor-not-allowed">
            {enviando ? 'Enviando…' : 'Adicionar'}
          </button>
        </div>

        {/* card de totais por liga (RF-CT02/CT03) */}
        {contagem && contagem.totais.length > 0 && (
          <div className="ios-card mb-4 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[14px] font-bold">Totais por liga</p>
              <button onClick={revisar} disabled={enviando}
                className="rounded-[10px] bg-[var(--tint-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tint)] transition-transform active:scale-95 disabled:opacity-40">
                Revisar
              </button>
            </div>
            <div className="grid gap-2">
              {contagem.totais.map((t) => {
                const dif = t.divergencia;
                const destaque = dif !== 0;
                return (
                  <div key={t.liga.id} className="flex items-center gap-2.5 rounded-xl p-3" style={{ background: destaque ? 'var(--laranja-soft)' : 'var(--muted)' }}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[(t.liga.cor as CorLiga) ?? 'CINZA'] }} />
                    <span className="text-[13.5px] font-semibold">{t.liga.nome}</span>
                    <span className="ml-auto text-right">
                      <span className="block text-[15px] font-extrabold tracking-tight">{t.apontado} barras <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">apontado</span></span>
                      <span className="block text-[11.5px] font-semibold text-[var(--muted-foreground)]">
                        sistema: {t.sistema}
                        {destaque && <span className={`ml-1 font-bold ${dif > 0 ? 'text-[var(--laranja)]' : 'text-[var(--destructive)]'}`}>· dif {dif > 0 ? '+' : ''}{dif}</span>}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            {!podeEditarDia && <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">Apontamentos só podem ser alterados no próprio dia.</p>}
          </div>
        )}

        {/* histórico do dia (RF-CT02/CT04) */}
        {contagem && contagem.apontamentos.length > 0 && (
          <div className="ios-card p-4">
            <p className="mb-3 text-[14px] font-bold">Histórico do dia · {contagem.apontamentos.length} apontamento(s)</p>
            <div className="grid gap-2">
              {contagem.apontamentos.map((a) => {
                const editavel = podeEditarDia;
                return (
                  <div key={a.id} className="ios-card-flat flex items-center gap-2.5 p-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[(a.liga.cor as CorLiga) ?? 'CINZA'] }} />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-bold">{a.liga.nome} · {a.qtd_barras} barras{a.lote ? ` · ${a.lote.codigo}` : ''}</p>
                      <p className="truncate text-[11.5px] text-[var(--muted-foreground)]">
                        {a.usuario} · {new Date(a.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {a.observacao ? ` · ${a.observacao}` : ''}
                      </p>
                    </div>
                    {editavel && (
                      <span className="ml-auto flex shrink-0 gap-1.5">
                        <button onClick={() => abrirEditar(a)} className="rounded-[10px] bg-[var(--tint-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--tint)]">Editar</button>
                        <button onClick={() => excluirApontamento(a.id)} className="rounded-[10px] bg-[var(--destructive)]/10 px-2.5 py-1.5 font-semibold text-[var(--destructive)]">Excluir</button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {contagem && contagem.apontamentos.length === 0 && (
          <p className="text-[13px] text-[var(--muted-foreground)]">Nenhum apontamento nesse dia.</p>
        )}
      </main>

      {editando && (
        <BottomSheet titulo={`Editar apontamento · ${editando.liga.nome}`} onClose={() => setEditando(null)}>
          <div className="ios-group mb-3">
            <div className="ios-field">
              <span>Barras</span>
              <input required value={editQtd} onChange={(e) => setEditQtd(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" pattern="[0-9]*" />
            </div>
            <div className="ios-field">
              <span>Lote</span>
              <select value={String(editLoteId)} onChange={(e) => setEditLoteId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Nenhum</option>
                {lotesLiga.map((l) => (
                  <option key={l.id} value={l.id}>{l.codigo}</option>
                ))}
              </select>
            </div>
            <div className="ios-field">
              <span>Observação</span>
              <input value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
          </div>
          <button onClick={salvarEdicao} disabled={enviando}
            className="ios-btn ios-btn-primario disabled:opacity-40 disabled:cursor-not-allowed">
            {enviando ? 'Aplicando⬦' : 'Salvar edição'}
          </button>
        </BottomSheet>
      )}

      <TabBar />
    </div>
  );
}

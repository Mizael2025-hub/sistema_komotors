'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { COR_LIGA_HEX, type CorLiga, type StatusMonte } from '@komotors/shared';
import { consumir, enviar } from '@/lib/api/cliente';
import { BottomSheet, TabBar, ToggleTema } from '@/components/ui';
import { SinoNotificacoes } from '@/components/sino'


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

type ItemResumoLiga = {
  liga: ItemLiga;
  resumo: Record<'disponivel' | 'no_setor' | 'reservado' | 'vendido', { peso: number | null; barras: number }>;
  lotes: number;
};

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

const COR_TIPO: Record<string, string> = {
  ENTRADA: 'var(--verde)',
  RESERVA: 'var(--laranja)',
  CANCELAMENTO_RESERVA: 'var(--muted-foreground)',
  MOVIMENTO_SETOR: 'var(--roxo)',
  BAIXA_VENDA: 'var(--destructive)',
  EDICAO: 'var(--tint)',
  RECONCILIACAO: 'var(--teal)',
  AJUSTE: 'var(--teal)',
};

const fmtPeso = (n: number | null | undefined) =>
  n == null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)} kg`;

const fmtTotalPeso = (ns: number[]) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(ns.reduce((s, n) => s + n, 0));

const dataBr = (iso: string) => (!iso ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);

const hojeISO = () => new Date().toISOString().slice(0, 10);

function classeMonte(m: Monte, selecionado: boolean) {
  if (m.status === 'VENDIDO' || m.status === 'AJUSTADO')
    return 'border border-dashed border-[var(--border)] opacity-40 grayscale';
  if (selecionado)
    return 'border-2 border-[var(--tint)] bg-[var(--tint-soft)] ring-2 ring-[var(--tint)] ring-offset-1 ring-offset-[var(--card)] scale-[1.03]';
  if (m.status === 'RESERVADO') return 'border-2 border-[var(--laranja)] bg-[var(--laranja-soft)]';
  if (m.status === 'NO_SETOR') return 'border border-dashed border-[var(--roxo)]/60 bg-[var(--roxo-soft)] opacity-60';
  if (m.status === 'PARCIAL') return 'border border-dashed border-[var(--teal)] bg-[var(--teal-soft)]';
  return 'border-2 border-[var(--tint)]/40';
}

function corSelos(status: string) {
  if (status === 'RESERVADO') return { fundo: 'var(--laranja-soft)', cor: 'var(--laranja)' };
  if (status === 'NO_SETOR') return { fundo: 'var(--roxo-soft)', cor: 'var(--roxo)' };
  if (status === 'PARCIAL') return { fundo: 'var(--teal-soft)', cor: 'var(--teal)' };
  return { fundo: 'var(--muted-foreground)', cor: 'var(--muted-foreground)' };
}

const ROTULO_ACAO: Record<string, string> = {
  reservar: 'Reservar',
  'mover-setor': 'Mover ao setor',
  venda: 'Baixa/Venda',
  editar: 'Editar',
};

export default function PaginaEstoqueChumbo() {
  const [ligasItens, setLigasItens] = useState<ItemLiga[] | null>(null);
  const [resumoGeral, setResumoGeral] = useState<ItemResumoLiga[] | null>(null);
  const [ligaId, setLigaId] = useState<number | null>(null);
  const [estoque, setEstoque] = useState<Estoque | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [reorganizando, setReorganizando] = useState(false);

  /* aviso de sucesso é um toast discreto — some sozinho, nunca trava o trabalho */
  useEffect(() => {
    if (aviso == null) return;
    const t = setTimeout(() => setAviso(null), 2800);
    return () => clearTimeout(t);
  }, [aviso]);

  function alternarReorganizar() {
    setReorganizando((r) => {
      if (r) setArrastando(null);
      return !r;
    });
  }

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
      const itens = r.itens ?? [];
      setLigasItens(itens);
      try {
        const detalhes = await Promise.all(
          itens.map(async (l) => {
            try {
              const e = await consumir<Estoque>(`/api/lead/stock?liga_id=${l.id}`);
              return { liga: l, resumo: e.resumo, lotes: e.lotes.length };
            } catch {
              return null;
            }
          }),
        );
        setResumoGeral(detalhes.filter((d): d is ItemResumoLiga => d != null));
      } catch {
        setResumoGeral([]);
      }
    } catch {
      setLigasItens([]);
    }
  }, []);

  const carregarEstoque = useCallback(async (id: number) => {
    setErro(null);
    try {
      const r = await consumir<Estoque>(`/api/lead/stock?liga_id=${id}`);
      setEstoque(r);
      // preserva os lotes que o usuário expandiu — a recarga não recolhe nada
      setExpandidos((prev) => new Set([...prev].filter((x) => r.lotes.some((l) => l.id === x))));
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
    setReorganizando(false);
    setArrastando(null);
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

  function abrirAcaoDireta(acao: 'reservar' | 'mover-setor' | 'venda' | 'editar') {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    const primeiro = montesConhecidos().find((m) => m.id === ids[0]);
    if (primeiro) {
      const pesoTexto = primeiro.peso_exibido != null ? String(primeiro.peso_exibido) : '';
      setFormMover((f) => ({
        ...f,
        setor_id: primeiro.setor_reserva_id != null ? String(primeiro.setor_reserva_id) : f.setor_id,
        qtd_barras: String(primeiro.qtd_barras),
        peso: pesoTexto,
      }));
      setFormVenda((f) => ({
        ...f,
        qtd_barras: String(primeiro.qtd_barras),
        peso: pesoTexto,
        pesoEditado: false,
      }));
      setFormEditar({ peso: pesoTexto, qtd_barras: String(primeiro.qtd_barras) });
    }
    setAcaoAtiva(acao);
    setModal('acoes');
  }

  /* peso pela média do monte: peso_monte / barras_monte × barras_movidas */
  function barrasChange(tipo: 'mover' | 'venda', valor: string) {
    const primeiro = montesConhecidos().find((m) => m.id === [...selecionados][0]);
    const n = parseInt(valor, 10);
    const media =
      primeiro && primeiro.qtd_barras > 0 && primeiro.peso_exibido != null && n > 0
        ? Math.round(((primeiro.peso_exibido / primeiro.qtd_barras) * n) * 100) / 100
        : null;
    const pesoTexto = media != null ? String(media) : '';
    if (tipo === 'mover') setFormMover((f) => ({ ...f, qtd_barras: valor, peso: pesoTexto }));
    else setFormVenda((f) => ({ ...f, qtd_barras: valor, peso: pesoTexto, pesoEditado: false }));
  }

  function abrirAcoes() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    const auto = ids.some((id) => montesConhecidos().find((m) => m.id === id)?.status === 'RESERVADO') ? 'mover-setor' : 'reservar';
    abrirAcaoDireta(auto);
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
          dados = {
            monte_ids: [...selecionados],
            destino: formVenda.destino,
            para_quem: formVenda.para_quem,
            data: formVenda.data,
            qtd_barras: formVenda.qtd_barras === '' ? undefined : Number(formVenda.qtd_barras),
            peso_informado: formVenda.peso === '' ? undefined : Number(formVenda.peso),
            peso_editado: formVenda.pesoEditado,
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
      // mantém o modo reorganização ativo — permite mover vários montes sem pausas
      setArrastando(null);
      if (ligaId != null) await carregarEstoque(ligaId);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao reposicionar.');
      if (ligaId != null) await carregarEstoque(ligaId);
    } finally {
      setArrastando(null);
    }
  }

  const estatistica = (rotulo: string, dado: { peso: number | null; barras: number }, extra?: { fundo: string; cor: string }) => (
    <div className="ios-stat" style={extra ? { background: extra.fundo } : {}}>
      <p className={`text-[19px] font-extrabold tracking-tight`} style={{ color: extra ? extra.cor : undefined }}>
        {fmtPeso(dado.peso)}
      </p>
      <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">{dado.barras} barras</p>
      <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">{rotulo}</p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-background/85 px-5 py-3 backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Estoque</h1>
          <p className="text-[12px] text-[var(--muted-foreground)]">Chumbo · {estoque?.liga.nome ?? 'escolha a liga'}</p>
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
        <div className="mb-3 flex gap-2.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => { setLigaId(null); setEstoque(null); setSelecionados(new Set()); setModal(null); setAcaoAtiva(null); setHist(null); }}
            aria-pressed={ligaId == null}
            className={`flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 py-2 text-[13.5px] transition-all active:scale-95 ${
              ligaId == null
                ? 'border-[var(--tint)] bg-[var(--tint-soft)] font-semibold text-[var(--tint)]'
                : 'ios-card-flat font-medium'
            }`}
          >
            Todas
          </button>
          {(ligasItens ?? []).map((l) => (
            <button
              key={l.id}
              onClick={() => trocarLiga(l.id)}
              aria-pressed={ligaId === l.id}
              className={`flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 py-2 text-[13.5px] transition-all active:scale-95 ${
                ligaId === l.id
                  ? 'border-[var(--tint)] bg-[var(--tint-soft)] font-semibold text-[var(--tint)]'
                  : 'ios-card-flat font-medium'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[(l.cor as CorLiga) ?? 'CINZA'] }} />
              {l.nome}
            </button>
          ))}
        </div>

        {(resumoGeral != null && ligaId == null) && (
          <>
            <div className="ios-card mb-4 p-4">
              <p className="mb-3 text-[14px] font-bold">Visão geral das ligas</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="ios-stat">
                  <p className="text-[19px] font-extrabold tracking-tight" style={{ color: 'var(--verde)' }}>
                    {fmtTotalPeso(resumoGeral.map((r) => r.resumo.disponivel.peso ?? 0))}
                  </p>
                  <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">kg disponível · {resumoGeral.reduce((s, r) => s + r.resumo.disponivel.barras, 0)} barras</p>
                </div>
                <div className="ios-stat">
                  <p className="text-[19px] font-extrabold tracking-tight" style={{ color: 'var(--tint)' }}>
                    {resumoGeral.reduce((s, r) => s + r.lotes, 0)}
                  </p>
                  <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">lotes ativos</p>
                </div>
              </div>
            </div>

            <div className="ios-card overflow-hidden">
              {resumoGeral.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">Nenhuma liga com estoque.</p>
              )}
              {resumoGeral.map((r, i) => (
                <button
                  key={r.liga.id}
                  onClick={() => trocarLiga(r.liga.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--muted)] ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[12px] font-extrabold"
                    style={{ backgroundColor: COR_LIGA_HEX[(r.liga.cor as CorLiga) ?? 'CINZA'], color: (r.liga.cor as CorLiga) === 'AMARELO' ? '#1c1c1e' : '#fff' }}
                  >
                    {[...r.liga.nome].find((c) => /[0-9]/.test(c)) ?? 'L'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px]">{r.liga.nome}</b>
                    <span className="block truncate text-[12px] text-[var(--muted-foreground)]">
                      {fmtPeso(r.resumo.disponivel.peso)} disponível · {r.resumo.disponivel.barras} barras · {r.lotes} lote(s)
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="#aeaeb2" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              ))}
            </div>
          </>
        )}

        {ligasItens != null && ligasItens.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhuma liga ativa. Cadastre em <Link href="/configuracoes" className="underline">Configurações</Link>.
          </p>
        )}
        {ligasItens != null && ligaId == null && ligasItens.length > 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">Escolha uma liga para consultar o estoque.</p>
        )}
        {ligasItens != null && ligaId != null && estoque === null && !erro && (
          <p className="animate-pulse text-sm text-[var(--muted-foreground)]">Carregando estoque da liga selecionada…</p>
        )}

        {erro && modal !== 'acoes' && (
          <p role="alert" className="mb-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--tint-soft)', color: 'var(--destructive)' }}>{erro}</p>
        )}
        {aviso && (
          <p className="mb-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--verde-soft)', color: 'var(--verde)' }}>{aviso}</p>
        )}

        {estoque && (
          <>
            <div className="ios-card mb-5 p-4">
              <div className="grid grid-cols-3 gap-2.5">
                {estatistica('Disponível', estoque.resumo.disponivel, { fundo: 'var(--verde-soft)', cor: 'var(--verde)' })}
                {estatistica('No setor', estoque.resumo.no_setor, { fundo: 'var(--roxo-soft)', cor: 'var(--roxo)' })}
                {estatistica('Reservado', estoque.resumo.reservado, { fundo: 'var(--laranja-soft)', cor: 'var(--laranja)' })}
              </div>
              <p className="mt-2.5 flex justify-between border-t border-[var(--border)] pt-2 text-[12px] text-[var(--muted-foreground)]">
                <span>Vendido acumulado: <b className="text-[var(--foreground)]">{fmtPeso(estoque.resumo.vendido.peso)}</b></span>
                <span>{estoque.lotes.length} lote(s)</span>
              </p>
            </div>

            <div className="grid gap-3.5">
              {estoque.lotes.map((l) => {
                const corHex = COR_LIGA_HEX[(estoque.liga.cor as CorLiga) ?? 'CINZA'];
                return (
                <div key={l.id} className={`ios-card ${l.encerrado ? 'opacity-70' : ''} overflow-hidden`}>
                  <button onClick={() => alternarExpandido(l.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--muted)]">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[12px] font-extrabold text-white"
                      style={{ backgroundColor: corHex, color: ['AMARELO'].includes((estoque.liga.cor as CorLiga) ?? '') ? '#1c1c1e' : '#fff' }}
                    >
                      {[...estoque.liga.nome].find((c) => /[0-9]/.test(c)) ?? 'L'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[15.5px] font-bold">
                        Lote {l.codigo}
                        {l.encerrado && <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted-foreground)]">encerrado</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-[var(--muted-foreground)]">
                        {dataBr(l.data_chegada)} · {fmtPeso(l.resumo.peso)} · {l.resumo.barras}/{l.total_barras} barras · {l.total_montes} montes
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2.4" strokeLinecap="round"
                      className={`h-4 w-4 shrink-0 transition-transform ${expandidos.has(l.id) ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {expandidos.has(l.id) && (
                    <div className="border-t border-[var(--border)] px-4 py-3">
                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--muted-foreground)]">
                        <span>Disponível: <b className="text-[var(--foreground)]">{l.resumo.barras} barras</b></span>
                        <span>Peso: <b className="text-[var(--foreground)]">{fmtPeso(l.resumo.peso)}</b></span>
                        <span>Na chegada: {l.total_barras} barras{weightResumoTotal(l)}</span>
                      </div>

                      <div className="grid gap-1.5 overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${l.colunas}, minmax(4.5rem, 1fr))` }}>
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
                                  onClick={() => {
                                    if (reorganizando && arrastando != null) dragSolto(l.id, linha02, coluna02, l.linhas, l.colunas);
                                    else setSelecionados(new Set());
                                  }}
                                  onDragOver={(e) => { if (arrastando != null) e.preventDefault(); }}
                                  onDrop={() => dragSolto(l.id, linha02, coluna02, l.linhas, l.colunas)}
                                  className={`grid h-[4.25rem] place-items-center rounded-xl border-2 border-dashed text-[10px] transition-all ${
                                    reorganizando && arrastando != null
                                      ? 'border-[var(--tint)] bg-[var(--tint-soft)] text-[var(--tint)] font-bold'
                                      : 'border-[var(--border)] text-[var(--muted-foreground)]'
                                  }`}
                                >
                                  {arrastando != null ? '↦' : ''}
                                </button>
                              );
                            }
                            return (
                              <button
                                key={m.id}
                                onClick={() => {
                                  if (reorganizando) {
                                    if (arrastando == null) setArrastando(m.id);
                                    else setAviso('Escolha uma posição vazia como destino — toque novamente em Reorganizar para sair.');
                                  } else alternarSelecao(m);
                                }}
                                onDoubleClick={() => (m.status === 'VENDIDO' || m.status === 'AJUSTADO' ? abrirHistorico(m.id) : abrirAcoes())}
                                draggable={m.status !== 'VENDIDO' && m.status !== 'AJUSTADO'}
                                onDragStart={() => setArrastando(m.id)}
                                className={`relative flex h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl text-center leading-tight shadow-sm transition-transform active:scale-95 ${classeMonte(m, reorganizando ? false : selecionados.has(m.id))}`}
                              >
                                {reorganizando && arrastando == m.id && (
                                  <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--laranja)] text-[10px] font-bold text-white shadow">↦</span>
                                )}
                                {m.peso_exibido != null ? (
                                  <span className="text-[14px] font-extrabold tracking-tight">{fmtPeso(m.peso_exibido).replace(' kg', '')}<span className="text-[9px] font-bold text-[var(--muted-foreground)]">kg</span></span>
                                ) : (
                                  <span className="text-[14px] font-extrabold">—</span>
                                )}
                                <span className="text-[10.5px] font-semibold text-[var(--muted-foreground)]">{m.qtd_barras} barras</span>
                                {m.estimado && <span className="absolute bottom-0.5 text-[8px] font-bold tracking-wide text-[var(--laranja)]">ESTIMADO</span>}
                                {selecionados.has(m.id) && (
                                  <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--tint)] text-[10px] font-bold text-white shadow">✓</span>
                                )}
                              </button>
                            );
                          });
                        })()}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <button onClick={alternarReorganizar}
                          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                            reorganizando ? 'bg-[var(--laranja)] text-white' : 'bg-[var(--muted)] text-[var(--tint)]'
                          }`}>
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h11l-3-3M21 16H10l3 3" /></svg>
                          {reorganizando ? 'Concluir' : 'Reorganizar'}
                        </button>
                      </div>
                      {reorganizando && (
                        <p className="mt-2 rounded-xl px-3 py-2 text-[12px] font-medium" style={{ background: 'var(--laranja-soft)', color: 'var(--laranja)' }}>
                          Modo reorganização: toque no monte de origem (↦) e depois numa posição vazia.
                        </p>
                      )}

                      <div className="ios-legend mt-3">
                        <div><i style={{ border: '2px solid var(--tint)', opacity: 0.5 }} />Em estoque</div>
                        <div><i style={{ background: 'var(--laranja-soft)', border: '1.5px solid var(--laranja)' }} />Reservado</div>
                        <div><i style={{ border: '2px dashed var(--teal)' }} />Parcial</div>
                        <div><i style={{ border: '2px dashed var(--roxo)', opacity: 0.6 }} />No setor</div>
                        <div><i style={{ background: 'var(--muted)' }} />Vendido</div>
                        <div><i style={{ border: '2px dashed var(--border)' }} />Vazio</div>
                      </div>
                      <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
                        Toque seleciona/desseleciona · toque no vazio limpa · duplo clique abre ações (ou resumo do indisponível) · arraste para reorganizar
                      </p>
                    </div>
                  )}
                </div>
              );
              })}
              {estoque.lotes.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                  Nenhum lote desta liga ainda — <Link href="/chumbo/entrada" className="font-semibold text-[var(--tint)] underline">registrar entrada</Link>
                </p>
              )}
            </div>

            {selecionados.size > 0 && (
              <div className="fixed bottom-16 left-1/2 z-40 w-[calc(100%-20px)] max-w-2xl -translate-x-1/2 rounded-[20px] bg-[var(--card)] p-3.5 shadow-[var(--sombra-card)] border border-[var(--border)]">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <b className="text-[14px]">{selecionados.size} {selecionados.size > 1 ? 'montes' : 'monte'} selecionado(s)</b>
                  <button onClick={() => setSelecionados(new Set())} className="text-[12px] font-semibold text-[var(--muted-foreground)]">Limpar</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['reservar', 'mover-setor', 'venda', 'editar'].map((a) => {
                    const cor =
                      a === 'reservar' ? 'var(--laranja)' : a === 'mover-setor' ? 'var(--roxo)' : a === 'venda' ? 'var(--destructive)' : 'var(--tint)';
                    return (
                      <button
                        key={a}
                        onClick={() => abrirAcaoDireta(a as 'reservar' | 'mover-setor' | 'venda' | 'editar')}
                        className="flex flex-col items-center gap-1 rounded-xl bg-[var(--muted)] py-2.5 text-[11px] font-bold active:scale-95"
                        style={{ color: cor }}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {a === 'reservar' ? <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" /> : a === 'mover-setor' ? <path d="M3 12l9-9 9 9M5 10v10h14V10" /> : a === 'venda' ? <path d="M21 12c-1 5-5 8-9 10-4-2-8-5-9-10V5l9-3 9 3zM9 12l2 2 4-5" /> : <path d="M17 3l4 4L8 20l-5 1 1-5z" />}
                        </svg>
                        {a === 'mover-setor' ? 'Mover' : a === 'venda' ? 'Venda' : ROTULO_ACAO[a]}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { const id = [...selecionados][0]; if (id != null) abrirHistorico(id); }} className="mt-2 w-full rounded-xl py-2 text-[13px] font-bold text-[var(--tint)] active:bg-[var(--muted)]">
                  Ver histórico do primeiro monte selecionado
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {modal === 'acoes' && acaoAtiva && estoque && (
        <BottomSheet titulo={`Ações — ${selecionados.size} monte(s)`} onClose={() => setModal(null)}>
          {enviando && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm">
              <p className="rounded-full bg-[var(--foreground)] px-4 py-2 text-xs text-[var(--background)] font-semibold">Aplicando operação⬦</p>
            </div>
          )}

          {acaoAtiva === 'reservar' && (
            <div className="ios-group">
              <label className="ios-field">
                <span>Setor de destino</span>
                <select value={formReserva.setor_id} onChange={(e) => setFormReserva({ ...formReserva, setor_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {estoque.setores.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                </select>
              </label>
              <label className="ios-field">
                <span>Observação</span>
                <input value={formReserva.observacao} onChange={(e) => setFormReserva({ ...formReserva, observacao: e.target.value })} placeholder="Opcional" />
              </label>
            </div>
          )}

          {acaoAtiva === 'mover-setor' && (
            <div className="ios-group">
              <label className="ios-field">
                <span>Setor</span>
                <select value={formMover.setor_id} onChange={(e) => setFormMover({ ...formMover, setor_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {estoque.setores.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                </select>
              </label>
              <label className="ios-field">
                <span>Barras</span>
                <input type="number" min={1} inputMode="numeric" value={formMover.qtd_barras}
                  onChange={(e) => barrasChange('mover', e.target.value)} placeholder="Vazio = monte todo" />
              </label>
              <label className="ios-field">
                <span>Peso (kg)</span>
                <input type="number" min={0.01} step="0.01" inputMode="decimal" value={formMover.peso}
                  onChange={(e) => setFormMover({ ...formMover, peso: e.target.value })} placeholder="Aut. pela média" />
              </label>
              <label className="ios-field">
                <span>Observação</span>
                <input value={formMover.observacao} onChange={(e) => setFormMover({ ...formMover, observacao: e.target.value })} placeholder="Opcional" />
              </label>
            </div>
          )}

          {acaoAtiva === 'venda' && (
            <div className="ios-group">
              <label className="ios-field">
                <span>Destino</span>
                <input value={formVenda.destino} onChange={(e) => setFormVenda({ ...formVenda, destino: e.target.value })} placeholder="Para onde vai" />
              </label>
              <label className="ios-field">
                <span>Para quem</span>
                <input value={formVenda.para_quem} onChange={(e) => setFormVenda({ ...formVenda, para_quem: e.target.value })} placeholder="Nome do responsável" />
              </label>
              <label className="ios-field">
                <span>Data</span>
                <input type="date" value={formVenda.data} onChange={(e) => setFormVenda({ ...formVenda, data: e.target.value })} className="text-right" />
              </label>
              <label className="ios-field">
                <span>Barras</span>
                <input type="number" min={1} inputMode="numeric" value={formVenda.qtd_barras}
                  onChange={(e) => barrasChange('venda', e.target.value)} placeholder="Vazio = tudo" />
              </label>
              <label className="ios-field">
                <span>Peso (kg)</span>
                <input type="number" min={0.01} step="0.01" inputMode="decimal" value={formVenda.peso}
                  onChange={(e) => setFormVenda({ ...formVenda, peso: e.target.value, pesoEditado: true })} placeholder="Aut. pela média — editável" />
              </label>
              <label className="ios-field">
                <span>Observação</span>
                <input value={formVenda.observacao} onChange={(e) => setFormVenda({ ...formVenda, observacao: e.target.value })} placeholder="Aparece no relatório" />
              </label>
              <p className="px-4 pb-3 pt-2 text-[11px] text-[var(--muted-foreground)]">
                Editar o peso marca como pesagem real e dispara a reconciliação do lote.
              </p>
            </div>
          )}

          {acaoAtiva === 'editar' && (
            <div className="ios-group">
              {selecionados.size > 1 && (
                <p className="rounded-xl px-4 py-2 text-xs font-medium" style={{ background: 'var(--laranja-soft)', color: 'var(--laranja)' }}>
                  A edição aplica ao primeiro monte da seleção.
                </p>
              )}
              <label className="ios-field">
                <span>Novo peso (kg)</span>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={formEditar.peso}
                  onChange={(e) => setFormEditar({ ...formEditar, peso: e.target.value })} />
              </label>
              <label className="ios-field">
                <span>Barras</span>
                <input type="number" min={1} inputMode="numeric" value={formEditar.qtd_barras}
                  onChange={(e) => setFormEditar({ ...formEditar, qtd_barras: e.target.value })} />
              </label>
            </div>
          )}

          {erro && (
            <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--tint-soft)', color: 'var(--destructive)' }}>{erro}</p>
          )}

          <button onClick={executarAcao}
            disabled={enviando || (acaoAtiva === 'reservar' && !formReserva.setor_id) || (acaoAtiva === 'mover-setor' && !formMover.setor_id) || (acaoAtiva === 'venda' && (!formVenda.destino || !formVenda.para_quem))}
            className="ios-btn ios-btn-primario mt-4 h-11 disabled:opacity-50">
            {enviando ? 'Aplicando…' : 'Confirmar'}
          </button>
        </BottomSheet>
      )}

      {modal === 'historico' && hist && (
        <BottomSheet titulo="Histórico do monte" onClose={() => setModal(null)}>
          <div className="mb-4 rounded-xl bg-[var(--muted)] p-3.5 text-[13px]">
            <p className="font-semibold">Liga {hist.monte.lote.liga.nome} · Lote {hist.monte.lote.codigo}</p>
            <p className="text-[var(--muted-foreground)]">
              {hist.monte.qtd_barras} barras · {fmtPeso(hist.monte.peso_exibido)}{hist.monte.estimado ? ' (estimado)' : ''}
            </p>
            <p className="text-[var(--muted-foreground)]">
              {ROTULO_STATUS[hist.monte.status] || 'Em estoque'}{hist.monte.setor_reserva ? ` — ${hist.monte.setor_reserva}` : ''}
            </p>
          </div>
          <ol className="relative border-l-2 border-[var(--border)] pl-4">
            {hist.movimentacoes.map((mv) => {
              const cor = COR_TIPO[mv.tipo] ?? 'var(--muted-foreground)';
              return (
                <li key={mv.id} className="relative mb-5">
                  <span
                    className="absolute -left-[calc(1rem+8px+1px)] top-1 grid h-[15px] w-[15px] place-items-center rounded-full"
                    style={{ background: cor }}
                  >
                    <svg viewBox="0 0 24 24" className="h-2 w-2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  <p className="text-[14px] font-semibold">{ROTULO_TIPO[mv.tipo] ?? mv.tipo}</p>
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    {dataBr(mv.data)} · {mv.usuario}{mv.setor ? ` · ${mv.setor}` : ''}{mv.para_quem ? ` · para ${mv.para_quem}` : ''}
                  </p>
                  <p className="text-[12px] text-[var(--muted-foreground)]">
                    {mv.qtd_barras != null ? `${mv.qtd_barras} barras` : ''}{mv.peso != null ? ` · ${fmtPeso(mv.peso)}` : ''}
                  </p>
                  {mv.observacao && <p className="mt-0.5 text-[12px]">{mv.observacao}</p>}
                </li>
              );
            })}
            {hist.movimentacoes.length === 0 && <li className="text-[13px] text-[var(--muted-foreground)]">Sem movimentações.</li>}
          </ol>
        </BottomSheet>
      )}

      <TabBar />
    </div>
  );
}

function weightResumoTotal(lote: Lote): string {
  return lote.peso_total_informado != null ? ` · informado ${fmtPeso(lote.peso_total_informado)}` : '';
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { dataHojeLocal, type StatusMonte } from '@komotors/shared';
import { consumir, enviar } from '@/lib/api/cliente';
import { BottomSheet, corLigaHex, TabBar, ToggleTema, Toast, type ToastAviso } from '@/components/ui';
import { SinoNotificacoes } from '@/components/sino';

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
  lotes: Lote[];
};

/* Passo A — o backend devolve tudo numa única chamada (ligas + setores + estoques). */
type EstoqueCompleto = {
  ligas: { id: number; nome: string; cor: string; ativo: boolean }[];
  setores: { id: number; nome: string }[];
  estoques: Estoque[];
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
    linha: number;
    coluna: number;
    qtd_barras: number;
    peso_exibido: number | null;
    estimado: boolean;
    lote: { id: number; codigo: string; liga: { nome: string; cor: string } };
    setor_reserva: string | null;
  };
  movimentacoes: HistLinha[];
};

type ItemLiga = { id: number; nome: string; cor: string; ativo?: boolean };
type LoteComLiga = Lote & { liga: ItemLiga };

/* espelha DISPONIVEIS do servico.ts — usado para recalcular "encerrado" na UI otimista */
const DISPONIVEIS_UI: StatusMonte[] = ['EM_ESTOQUE', 'RESERVADO', 'PARCIAL'];

const ROTULO_STATUS: Record<StatusMonte, string> = {
  EM_ESTOQUE: 'Em estoque',
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

const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);

const dataBr = (iso: string) => (!iso ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);

const letraLinha = (l: number) => String.fromCharCode(64 + l);

/* Ações da barra flutuante — ícones fixos, sem dependência de estado. */
const ACAO_BOTOES: { acao: 'reservar' | 'mover-setor' | 'venda' | 'editar' | 'historico'; rotulo: string; cor: string; icone: string }[] = [
  { acao: 'reservar', rotulo: 'Reservar', cor: 'var(--laranja)', icone: 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z' },
  { acao: 'mover-setor', rotulo: 'Mover', cor: 'var(--roxo)', icone: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { acao: 'venda', rotulo: 'Venda', cor: 'var(--destructive)', icone: 'M9 12l2 2 4-5M21 12c-1 5-5 8-9 10-4-2-8-5-9-10V5l9-3 9 3z' },
  { acao: 'editar', rotulo: 'Editar', cor: 'var(--tint)', icone: 'M17 3l4 4L8 20l-5 1 1-5z' },
  { acao: 'historico', rotulo: 'Histórico', cor: 'var(--tint)', icone: 'M12 7v5l3 3M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z' },
];

/* buckets por status — mesmo recorte visual do protótipo (disjoint) */
type Balde = { peso: number; barras: number };
function baldesDe(ms: Monte[]) {
  const somar = (pred: (m: Monte) => boolean): Balde => ({
    peso: ms.filter(pred).reduce((s, m) => s + (m.peso_exibido ?? 0), 0),
    barras: ms.filter(pred).reduce((s, m) => s + m.qtd_barras, 0),
  });
  return {
    disponivel: somar((m) => m.status === 'EM_ESTOQUE' || m.status === 'PARCIAL'),
    reservado: somar((m) => m.status === 'RESERVADO'),
    no_setor: somar((m) => m.status === 'NO_SETOR'),
  };
}

/* ---------- Passo B: patches otimistas (espelham a matemática do servico.ts) ---------- */

type PatchMonte = Partial<
  Pick<Monte, 'status' | 'qtd_barras' | 'peso_exibido' | 'estimado' | 'setor_reserva_id' | 'linha' | 'coluna'>
> & { id: number };

/* espelha exercerFracaoMonte (servico.ts): peso proporcional pela média e
   split PARCIAL quando move/vende só parte das barras */
function calcMovimentoPatch(
  m: Monte,
  movidas: number | undefined,
  pesoInf: number | undefined,
  setor: number | null,
  statusIntegral: 'NO_SETOR' | 'VENDIDO',
): PatchMonte[] {
  const total = m.qtd_barras;
  const mov = Math.min(total, movidas ?? total);
  const parcial = mov < total;
  const pesoBase = m.peso_exibido;
  let pesoMovido: number | null = null;
  if (pesoInf != null) pesoMovido = Math.round(pesoInf * 100) / 100;
  else if (pesoBase != null && total > 0) pesoMovido = Math.round(((pesoBase / total) * mov) * 100) / 100;

  if (!parcial) {
    return [{ id: m.id, status: statusIntegral, setor_reserva_id: statusIntegral === 'NO_SETOR' ? setor : null }];
  }
  const resto = pesoBase != null && pesoMovido != null ? Math.max(0, Math.round((pesoBase - pesoMovido) * 100) / 100) : null;
  return [{ id: m.id, status: 'PARCIAL', qtd_barras: total - mov, ...(resto != null ? { peso_exibido: resto } : {}) }];
}

function classeCelula(m: Monte, selecionado: boolean) {
  const base = 'relative flex h-[92px] w-[88px] flex-col items-center justify-center gap-0.5 rounded-[14px] text-center leading-tight transition-all active:scale-95';
  /* borda neutra padronizada (var(--border) — contraste nos dois temas);
     a cor da liga não pinta mais os montes — identificação fica no card do lote */
  let extra = ' border-2 border-solid border-[var(--border)] bg-[var(--card)] shadow-[var(--sombra-card)]';
  if (m.status === 'RESERVADO') extra += ' bg-[var(--laranja-soft)]';
  if (m.status === 'NO_SETOR') extra += ' bg-[var(--roxo-soft)]';
  if (m.status === 'VENDIDO' || m.status === 'AJUSTADO') extra += ' opacity-[0.38] grayscale-[0.6]';
  if (m.status === 'PARCIAL') extra += ' border-dashed';
  if (selecionado) extra += ' outline outline-[3px] outline-offset-2 outline-[var(--tint)] scale-[1.04]';
  return base + extra;
}

export default function PaginaEstoqueChumbo() {
  const [ligasItens, setLigasItens] = useState<ItemLiga[] | null>(null);
  const [estoques, setEstoques] = useState<Estoque[] | null>(null);
  const [setores, setSetores] = useState<{ id: number; nome: string }[]>([]);
  const [ligaId, setLigaId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<ToastAviso>(null);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [reorganizando, setReorganizando] = useState(false);

  const [modal, setModal] = useState<null | 'acoes' | 'miniresumo' | 'historico'>(null);
  const [acaoAtiva, setAcaoAtiva] = useState<'reservar' | 'mover-setor' | 'venda' | 'editar' | null>(null);
  const [hist, setHist] = useState<Historico | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [formReserva, setFormReserva] = useState({ setor_id: '', observacao: '' });
  const [formMover, setFormMover] = useState({ setor_id: '', qtd_barras: '', peso: '', observacao: '' });
  const [formVenda, setFormVenda] = useState({ destino: '', para_quem: '', data: dataHojeLocal(), qtd_barras: '', peso: '', pesoEditado: false, observacao: '' });
  const [formEditar, setFormEditar] = useState({ peso: '', qtd_barras: '' });

  const sumirToast = useCallback(() => setAviso(null), []);

  /* sequência da carga — cliques repetidos em "sincronizar" descartam respostas
     antigas (a última carga concluída é a que vale) */
  const seqCarga = useRef(0);

  const [, iniciarTransicao] = useTransition();

  /* Passo A/B — uma única chamada devolve ligas + setores + estoques (antes:
     1 chamada por liga + recarga total bloqueante após cada ação). */
  const carregarTudo = useCallback(async () => {
    const seq = ++seqCarga.current;
    setErro(null);
    try {
      const r = await consumir<EstoqueCompleto>('/api/lead/stock');
      if (seq !== seqCarga.current) return; // chegou tarde — outra carga já assumiu
      setLigasItens(r.ligas);
      setSetores(r.setores);
      setEstoques(r.estoques);
      // preserva os lotes que o usuário expandiu — a recarga não recolhe nada
      setExpandidos((prev) => new Set([...prev].filter((x) => r.estoques.some((e) => e.lotes.some((l) => l.id === x)))));
    } catch {
      if (seq !== seqCarga.current) return;
      setLigasItens([]);
      setEstoques([]);
      setErro('Erro ao carregar estoque.');
    }
  }, []);

  /* Passo B — revalidação em segundo plano: startTransition mantém a tela
     interativa enquanto os dados frescos chegam (sem overlay, sem await). */
  const revalidarEmFundo = useCallback(() => {
    iniciarTransicao(async () => {
      await carregarTudo();
    });
  }, [carregarTudo, iniciarTransicao]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (setState pós-await)
    carregarTudo();
  }, [carregarTudo]);

  /* escopo atual: todas as ligas ou apenas a selecionada */
  const lotesComLiga = useMemo<LoteComLiga[]>(() => {
    if (estoques == null) return [];
    const base = ligaId == null ? estoques : estoques.filter((e) => e.liga.id === ligaId);
    return base.flatMap((e) => e.lotes.map((l) => ({ ...l, liga: e.liga })));
  }, [estoques, ligaId]);

  const resumoEscopo = useMemo(() => baldesDe(lotesComLiga.flatMap((l) => l.montes)), [lotesComLiga]);
  const lotesAtivos = useMemo(
    () => lotesComLiga.filter((l) => l.montes.some((m) => m.status !== 'VENDIDO' && m.status !== 'AJUSTADO')).length,
    [lotesComLiga],
  );

  const tituloResumo = ligaId == null ? 'Resumo geral' : `Resumo · ${ligasItens?.find((l) => l.id === ligaId)?.nome ?? ''}`;

  function trocarLiga(id: number | null) {
    setLigaId(id);
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

  function alternarReorganizar() {
    setReorganizando((r) => {
      if (r) setArrastando(null);
      else setAviso({ tipo: 'info', mensagem: 'Modo reorganização: toque na origem e no destino' });
      return !r;
    });
  }

  const montesConhecidos = () => lotesComLiga.flatMap((l) => l.montes);

  /* ---------- Passo B: UI otimista ---------- */

  function aplicarPatches(patches: PatchMonte[]) {
    if (patches.length === 0) return;
    const ids = new Set(patches.map((p) => p.id));
    setEstoques((atual) => {
      if (atual == null) return atual;
      return atual.map((e) => ({
        ...e,
        lotes: e.lotes.map((l) => {
          if (!l.montes.some((m) => ids.has(m.id))) return l;
          const montes = l.montes.map((m) => {
            const p = patches.find((x) => x.id === m.id);
            return p ? ({ ...m, ...p } as Monte) : m;
          });
          return { ...l, montes, encerrado: !montes.some((m) => DISPONIVEIS_UI.includes(m.status)) };
        }),
      }));
    });
  }

  function alternarSelecao(modo: Monte) {
    setSelecionados((prev) => {
      if (prev.has(modo.id)) {
        const copia = new Set(prev);
        copia.delete(modo.id);
        return copia;
      }
      const copia = new Set(prev);
      copia.add(modo.id);
      return copia;
    });
  }

  function abrirAcaoDireta(acao: 'reservar' | 'mover-setor' | 'venda' | 'editar') {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    if (ids.length === 1) {
      /* com um monte: pré-preenche peso/barras do monte para edição */
      const primeiro = primeiroSelecionado();
      if (primeiro) {
        const pesoTexto = primeiro.peso_exibido != null ? String(primeiro.peso_exibido) : '';
        setFormMover((f) => ({
          ...f,
          setor_id: primeiro.setor_reserva_id != null ? String(primeiro.setor_reserva_id) : f.setor_id,
          qtd_barras: String(primeiro.qtd_barras),
          peso: pesoTexto,
        }));
        setFormVenda((f) => ({ ...f, qtd_barras: String(primeiro.qtd_barras), peso: pesoTexto, pesoEditado: false }));
        setFormEditar({ peso: pesoTexto, qtd_barras: String(primeiro.qtd_barras) });
      }
    } else {
      /* com vários montes a ação é sempre integral — peso/barras ficam vazios
         e desabilitados (RF-M03/M05; o servidor também rejeita) */
      setFormMover((f) => ({ ...f, qtd_barras: '', peso: '' }));
      setFormVenda((f) => ({ ...f, qtd_barras: '', peso: '', pesoEditado: false }));
      setFormEditar({ peso: '', qtd_barras: '' });
    }
    setAcaoAtiva(acao);
    setModal('acoes');
  }

  /* peso pela média do monte: peso_monte / barras_monte × barras_movidas (só com 1 monte) */
  function barrasChange(tipo: 'mover' | 'venda', valor: string) {
    if (selecionados.size > 1) return;
    const primeiro = primeiroSelecionado();
    const n = parseInt(valor, 10);
    const media =
      primeiro && primeiro.qtd_barras > 0 && primeiro.peso_exibido != null && n > 0
        ? Math.round(((primeiro.peso_exibido / primeiro.qtd_barras) * n) * 100) / 100
        : null;
    const pesoTexto = media != null ? String(media) : '';
    if (tipo === 'mover') setFormMover((f) => ({ ...f, qtd_barras: valor, peso: pesoTexto }));
    else setFormVenda((f) => ({ ...f, qtd_barras: valor, peso: pesoTexto, pesoEditado: false }));
  }

  async function abrirIndisponivel(monteId: number) {
    setErro(null);
    try {
      const r = await consumir<Historico>(`/api/lead/piles/${monteId}`);
      setHist(r);
      setModal('miniresumo');
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao carregar historico.');
    }
  }

  async function executarAcao() {
    if (acaoAtiva == null || selecionados.size === 0) return;
    const varios = selecionados.size > 1; // peso/barras só existem com 1 monte (RF-M03/M05)

    /* Passo B — UI otimista: aplica em memória na hora, envia em paralelo e
       revalida em segundo plano; erro reverte para o snapshot. */
    const snapshot = estoques;
    const patches: PatchMonte[] = [];
    if (acaoAtiva === 'reservar') {
      const setor = Number(formReserva.setor_id);
      for (const m of itensSelecionados()) patches.push({ id: m.id, status: 'RESERVADO', setor_reserva_id: setor });
    } else if (acaoAtiva === 'mover-setor') {
      const setor = Number(formMover.setor_id);
      const movidas = varios || formMover.qtd_barras === '' ? undefined : Number(formMover.qtd_barras);
      const pesoInf = varios || formMover.peso === '' ? undefined : Number(formMover.peso);
      for (const m of itensSelecionados()) patches.push(...calcMovimentoPatch(m, movidas, pesoInf, setor, 'NO_SETOR'));
    } else if (acaoAtiva === 'venda') {
      const movidas = varios || formVenda.qtd_barras === '' ? undefined : Number(formVenda.qtd_barras);
      const pesoInf = varios || formVenda.peso === '' ? undefined : Number(formVenda.peso);
      for (const m of itensSelecionados()) patches.push(...calcMovimentoPatch(m, movidas, pesoInf, null, 'VENDIDO'));
    } else {
      const alvo = primeiroSelecionado();
      if (alvo)
        patches.push({
          id: alvo.id,
          qtd_barras: formEditar.qtd_barras === '' ? alvo.qtd_barras : Number(formEditar.qtd_barras),
          peso_exibido: formEditar.peso === '' ? alvo.peso_exibido : Number(formEditar.peso),
          /* peso editado = pesagem real (RF-P02) — sai do estado "estimado" */
          estimado: formEditar.peso === '' ? alvo.estimado : false,
        });
    }

    aplicarPatches(patches);
    const rotulo = acaoAtiva === 'venda' ? 'Baixa/venda' : acaoAtiva === 'mover-setor' ? 'Movimento' : acaoAtiva === 'editar' ? 'Edição' : 'Reserva';
    setModal(null);
    setAcaoAtiva(null);
    setSelecionados(new Set());
    setAviso({ tipo: 'ok', mensagem: `${rotulo} registrado` });
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
            qtd_barras: varios ? undefined : formMover.qtd_barras === '' ? undefined : Number(formMover.qtd_barras),
            peso_informado: varios ? undefined : formMover.peso === '' ? undefined : Number(formMover.peso),
            observacao: formMover.observacao || undefined,
          };
        } else {
          dados = {
            monte_ids: [...selecionados],
            destino: formVenda.destino,
            para_quem: formVenda.para_quem,
            data: formVenda.data,
            qtd_barras: varios ? undefined : formVenda.qtd_barras === '' ? undefined : Number(formVenda.qtd_barras),
            peso_informado: varios ? undefined : formVenda.peso === '' ? undefined : Number(formVenda.peso),
            peso_editado: varios ? false : formVenda.pesoEditado,
            observacao: formVenda.observacao || undefined,
          };
        }
        await enviar('/api/lead/actions', { metodo: 'POST', corpo: { acao: acaoAtiva, dados } });
      }
      /* reconcilia estimativas e encerrados sem travar a tela */
      revalidarEmFundo();
    } catch (ex) {
      setEstoques(snapshot); // reverte a otimista
      setErro(ex instanceof Error ? ex.message : 'Erro na operação.');
    } finally {
      setEnviando(false);
    }
  }

  async function expandirLote(l: LoteComLiga) {
    const snapshot = estoques;
    const novas = Math.min(20, l.colunas + 1);
    // otimista: a grade cresce na hora
    setEstoques(
      (atual) => atual?.map((e) => ({ ...e, lotes: e.lotes.map((x) => (x.id === l.id ? { ...x, colunas: novas } : x)) })) ?? null,
    );
    setErro(null);
    try {
      await enviar(`/api/lead/lots/${l.id}`, { metodo: 'PATCH', corpo: { linhas: l.linhas, colunas: novas } });
      setAviso({ tipo: 'ok', mensagem: 'Grade expandida' });
    } catch (ex) {
      setEstoques(snapshot);
      setErro(ex instanceof Error ? ex.message : 'Erro ao expandir a grade.');
    }
  }

  async function dragSolto(loteId: number, linha: number, coluna: number, maxL: number, maxC: number) {
    if (arrastando == null) return;
    if (linha > maxL || coluna > maxC) return;
    const snapshot = estoques;
    const monteId = arrastando;
    // otimista: o monte salta para a nova posição na hora
    aplicarPatches([{ id: monteId, linha, coluna }]);
    setArrastando(null);
    setErro(null);
    try {
      await enviar(`/api/lead/piles/${monteId}`, { metodo: 'PATCH', corpo: { linha, coluna } });
      // mantém o modo reorganização ativo — permite mover vários montes sem pausas
    } catch (ex) {
      setEstoques(snapshot); // reverte
      setErro(ex instanceof Error ? ex.message : 'Erro ao reposicionar.');
    }
  }

  function sincronizar() {
    // revalidação em segundo plano — a tela nunca trava
    revalidarEmFundo();
    setAviso({ tipo: 'info', mensagem: 'Sincronizando…' });
  }

  const statBalde = (rotulo: string, dado: Balde, extra?: { fundo: string; cor: string }) => (
    <div className="ios-stat" style={extra ? { background: extra.fundo } : {}}>
      <p className="text-[20px] font-extrabold tracking-tight" style={{ color: extra ? extra.cor : undefined }}>
        {fmtNum(dado.peso)}<small className="text-[12px] font-semibold text-[var(--muted-foreground)]"> kg</small>
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">
        {rotulo}<br />{fmtNum(dado.barras)} barras
      </p>
    </div>
  );

  const itensSelecionados = () => [...selecionados].map((id) => montesConhecidos().find((m) => m.id === id)).filter((m): m is Monte => m != null);

  /* primeiro monte da seleção — base dos formulários e do título do sheet de edição */
  const primeiroSelecionado = () => montesConhecidos().find((m) => m.id === [...selecionados][0]);
  const monteAlvo = primeiroSelecionado();

  return (
    <div className="min-h-dvh bg-background">
      <header className="ios-topbar">
        <div>
          <h1>Estoque</h1>
          <div className="sub">{estoques == null ? 'Carregando…' : '● Sincronizado agora'}</div>
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes />
          <button onClick={sincronizar} aria-label="Sincronizar" className="ios-icon-btn">
            <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></svg>
          </button>
          <ToggleTema />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[480px] pb-32 pt-1">
        <div className="ios-section-label">Liga</div>
        <div className="flex gap-2.5 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => trocarLiga(null)}
            aria-pressed={ligaId == null}
            className={`flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-[15px] py-[9px] text-[14px] font-semibold shadow-[var(--sombra-card)] transition-all active:scale-95 ${
              ligaId == null ? 'border-[var(--tint)] bg-[var(--tint-soft)] text-[var(--tint)]' : 'border-transparent bg-[var(--card)]'
            }`}
          >
            <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'linear-gradient(135deg,#ffcc00,#ff453a 50%,#1c1c1e 75%,#32d74b)' }} />
            Todas
          </button>
          {(ligasItens ?? []).filter((l) => l.ativo !== false).map((l) => (
            <button
              key={l.id}
              onClick={() => trocarLiga(l.id)}
              aria-pressed={ligaId === l.id}
              className={`flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-[15px] py-[9px] text-[14px] font-semibold shadow-[var(--sombra-card)] transition-all active:scale-95 ${
                ligaId === l.id ? 'border-[var(--tint)] bg-[var(--tint-soft)] text-[var(--tint)]' : 'border-transparent bg-[var(--card)]'
              }`}
            >
              <span className="h-[11px] w-[11px] rounded-full" style={{ backgroundColor: corLigaHex(l.cor) }} />
              {l.nome}
            </button>
          ))}
        </div>

        {erro && modal !== 'acoes' && (
          <p role="alert" className="mx-4 mb-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--tint-soft)', color: 'var(--destructive)' }}>{erro}</p>
        )}

        {ligasItens != null && ligasItens.length === 0 && (
          <p className="mx-4 text-sm text-[var(--muted-foreground)]">
            Nenhuma liga ativa. Cadastre em <Link href="/configuracoes" className="underline">Configurações</Link>.
          </p>
        )}
        {ligasItens != null && ligasItens.length > 0 && estoques == null && (
          <p className="mx-4 animate-pulse text-sm text-[var(--muted-foreground)]">Carregando estoque…</p>
        )}

        {estoques != null && (
          <>
            {/* resumo do escopo */}
            <div className="ios-card mx-4 mb-3.5">
              <div className="flex items-center justify-between gap-2 px-4 py-3.5">
                <span className="text-[15px] font-bold">{tituloResumo}</span>
                <span className="st-badge st-estoque">{lotesAtivos} {lotesAtivos === 1 ? 'lote ativo' : 'lotes ativos'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 px-4 pb-3.5">
                {statBalde('Disponível', resumoEscopo.disponivel)}
                {statBalde('No setor', resumoEscopo.no_setor, { fundo: 'var(--roxo-soft)', cor: 'var(--roxo)' })}
                {statBalde('Reservado', resumoEscopo.reservado, { fundo: 'var(--laranja-soft)', cor: 'var(--laranja)' })}
              </div>
            </div>

            {/* lotes */}
            <div className="grid gap-3.5">
              {lotesComLiga.map((l) => {
                const corHex = corLigaHex(l.liga.cor);
                const stats = baldesDe(l.montes);
                const pesoLote = l.peso_total_informado ?? l.montes.reduce((s, m) => s + (m.peso_exibido ?? 0), 0);
                const aberto = expandidos.has(l.id);
                return (
                  <div key={l.id} className={`ios-card mx-4 overflow-hidden ${l.encerrado ? 'opacity-70' : ''}`}>
                    <button onClick={() => alternarExpandido(l.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--muted)]">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-extrabold"
                        style={{ backgroundColor: corHex, color: l.liga.cor === 'AMARELO' ? '#1c1c1e' : '#fff' }}
                      >
                        {[...l.liga.nome].find((c) => /[0-9]/.test(c)) ?? 'L'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-[16px] tracking-tight">
                          Lote {l.codigo}
                          {l.encerrado && <span className="ml-2 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted-foreground)]">encerrado</span>}
                        </b>
                        <span className="mt-0.5 block truncate text-[12.5px] font-medium text-[var(--muted-foreground)]">
                          {dataBr(l.data_chegada)} · {fmtNum(pesoLote)} kg · {l.total_barras} barras · {l.total_montes} montes
                        </span>
                      </span>
                      <svg
                        viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                        className={`h-[17px] w-[17px] shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`}
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>

                    {aberto && (
                      <div className="border-t border-[var(--border)] pt-3">
                        <div className="grid grid-cols-3 gap-2.5 px-4 pb-3.5">
                          {statBalde('Disponível', stats.disponivel)}
                          {statBalde('Reservado', stats.reservado, { fundo: 'var(--laranja-soft)', cor: 'var(--laranja)' })}
                          {statBalde('No setor', stats.no_setor, { fundo: 'var(--roxo-soft)', cor: 'var(--roxo)' })}
                        </div>

                        <div className="ios-grade-tools px-4">
                          <button onClick={alternarReorganizar} className={reorganizando ? 'text-[var(--laranja)]' : ''}>
                            <svg viewBox="0 0 24 24"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" /></svg>
                            {reorganizando ? 'Concluir' : 'Reorganizar'}
                          </button>
                          <button onClick={() => expandirLote(l)}>
                            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 9v6M9 12h6" /></svg>
                            Expandir
                          </button>
                        </div>

                        <div className="overflow-x-auto px-4 pb-1">
                          <div className="grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${l.colunas}, 88px)` }}>
                            {(() => {
                              const celulas: (Monte | null)[] = new Array(l.linhas * l.colunas).fill(null);
                              for (const m of l.montes) celulas[(m.linha - 1) * l.colunas + (m.coluna - 1)] = m;
                              return celulas.map((m, indice) => {
                                const linha02 = Math.floor(indice / l.colunas) + 1;
                                const coluna02 = (indice % l.colunas) + 1;
                                const pos = `${letraLinha(linha02)}${coluna02}`;
                                if (!m) {
                                  return (
                                    <button
                                      key={`vazia-${indice}`}
                                      onClick={() => {
                                        if (reorganizando && arrastando != null) dragSolto(l.id, linha02, coluna02, l.linhas, l.colunas);
                                      }}
                                      onDragOver={(e) => { if (arrastando != null) e.preventDefault(); }}
                                      onDrop={() => dragSolto(l.id, linha02, coluna02, l.linhas, l.colunas)}
                                      className={`grid h-[92px] place-items-center rounded-[14px] border-2 border-dashed text-[10px] font-semibold transition-all ${
                                        reorganizando && arrastando != null
                                          ? 'border-[var(--tint)] bg-[var(--tint-soft)] text-[var(--tint)] font-bold'
                                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
                                      }`}
                                    >
                                      {arrastando != null ? '↦' : pos}
                                    </button>
                                  );
                                }
                                const indisponivel = m.status === 'VENDIDO' || m.status === 'AJUSTADO' || m.status === 'NO_SETOR';
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => {
                                      if (reorganizando) {
                                        if (arrastando == null) setArrastando(m.id);
                                        else setAviso({ tipo: 'warn', mensagem: 'Escolha uma posição vazia como destino' });
                                      } else if (indisponivel) {
                                        abrirIndisponivel(m.id);
                                      } else {
                                        alternarSelecao(m);
                                      }
                                    }}
                                    draggable={!indisponivel}
                                    onDragStart={() => setArrastando(m.id)}
                                    className={classeCelula(m, reorganizando ? false : selecionados.has(m.id))}
                                  >
                                    {reorganizando && arrastando == m.id && (
                                      <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--laranja)] text-[10px] font-bold text-white shadow">↦</span>
                                    )}
                                    {(() => {
                                      /* "No setor": texto no mesmo roxo do card de resumo
                                         (var(--roxo) sobre --roxo-soft) — legível nos 2 temas,
                                         sem texto branco/foreground no bloco */
                                      const noSetor = m.status === 'NO_SETOR';
                                      return (
                                        <>
                                          {m.peso_exibido != null ? (
                                            <span className={`whitespace-nowrap text-[15px] font-extrabold tracking-tight ${noSetor ? 'text-[var(--roxo)]' : ''}`}>
                                              {fmtNum(m.peso_exibido)}<span className={`text-[10px] font-bold ${noSetor ? 'text-[var(--roxo)]' : 'text-[var(--muted-foreground)]'}`}> kg</span>
                                            </span>
                                          ) : (
                                            <span className={`text-[15px] font-extrabold ${noSetor ? 'text-[var(--roxo)]' : ''}`}>—</span>
                                          )}
                                          <span className={`text-[11.5px] font-semibold ${noSetor ? 'text-[var(--roxo)]' : 'text-[var(--muted-foreground)]'}`}>{m.qtd_barras} barras</span>
                                        </>
                                      );
                                    })()}
                                    {m.estimado && <span className="absolute bottom-[5px] text-[9.5px] font-bold tracking-[0.3px] text-[var(--laranja)]">ESTIMADO</span>}
                                    {selecionados.has(m.id) && !reorganizando && (
                                      <span className="absolute -right-[7px] -top-[7px] grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[var(--tint)] px-1 text-[11px] font-extrabold text-white shadow">✓</span>
                                    )}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {reorganizando && (
                          <p className="mx-4 mt-2 rounded-xl px-3 py-2 text-[12px] font-medium" style={{ background: 'var(--laranja-soft)', color: 'var(--laranja)' }}>
                            Modo reorganização: toque no monte de origem (↦) e depois numa posição vazia.
                          </p>
                        )}

                        <div className="ios-legend px-4 pb-3.5 pt-3">
                          <div><i style={{ background: 'var(--card)', border: '1.5px solid var(--border)' }} />Em estoque</div>
                          <div><i style={{ background: 'var(--laranja-soft)', border: '1.5px solid var(--laranja)' }} />Reservado</div>
                          <div><i style={{ background: 'var(--roxo-soft)', border: '1.5px solid var(--roxo)' }} />No setor</div>
                          <div><i style={{ border: '2px dashed var(--teal)' }} />Parcial</div>
                          <div><i style={{ background: 'var(--muted)' }} />Vendido/movido</div>
                          <div><i style={{ border: '2px dashed var(--border)' }} />Vazio</div>
                        </div>
                        <p className="px-4 pb-3.5 text-[10px] text-[var(--muted-foreground)]">
                          Toque seleciona · vendido/no setor abre o mini-resumo · arraste para reorganizar
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {lotesComLiga.length === 0 && (
                <p className="mx-4 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                  Nenhum lote {ligaId != null ? 'desta liga' : ''} ainda — <Link href="/chumbo/entrada" className="font-semibold text-[var(--tint)] underline">registrar entrada</Link>
                </p>
              )}
            </div>
          </>
        )}
        <div className="h-5" />
      </main>

      {/* barra de ações flutuante (montes selecionados) */}
      {selecionados.size > 0 && (() => {
        const itens = itensSelecionados();
        const peso = itens.reduce((s, m) => s + (m.peso_exibido ?? 0), 0);
        const barras = itens.reduce((s, m) => s + m.qtd_barras, 0);
        return (
          <div className="ios-actionbar">
            <div className="info">
              <b>{itens.length} {itens.length > 1 ? 'montes' : 'monte'}</b>
              <span>{fmtNum(peso)} kg · {barras} barras</span>
            </div>
            <div className="flex gap-2">
              {ACAO_BOTOES.map((b) => (
                <button
                  key={b.acao}
                  onClick={() => {
                    if (b.acao === 'historico') {
                      const id = [...selecionados][0];
                      if (id != null) abrirIndisponivel(id);
                    } else {
                      abrirAcaoDireta(b.acao);
                    }
                  }}
                  className="ios-ab-btn"
                  style={{ color: b.cor }}
                >
                  <svg viewBox="0 0 24 24"><path d={b.icone} /></svg>
                  {b.rotulo}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {modal === 'acoes' && acaoAtiva && (
        <BottomSheet
          titulo={acaoAtiva === 'reservar' ? 'Reservar monte' : acaoAtiva === 'mover-setor' ? 'Mover ao setor' : acaoAtiva === 'venda' ? 'Baixa / Venda' : monteAlvo ? `Editar monte ${letraLinha(monteAlvo.linha)}${monteAlvo.coluna}` : 'Editar monte'}
          onClose={() => setModal(null)}
        >
          {acaoAtiva === 'reservar' && (
            <div className="ios-group">
              <label className="ios-field">
                <span>Setor de destino</span>
                <select value={formReserva.setor_id} onChange={(e) => setFormReserva({ ...formReserva, setor_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {setores.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                </select>
              </label>
              <label className="ios-field">
                <span>Montes</span>
                <b className="flex-1 text-right text-[15px]">{itensSelecionados().map((m) => `${letraLinha(m.linha)}${m.coluna}`).join(', ')}</b>
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
                  {setores.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                </select>
              </label>
              {selecionados.size > 1 && (
                <p className="px-4 py-1 text-[12px] font-medium" style={{ color: 'var(--laranja)' }}>
                  Vários montes selecionados — cada monte sai inteiro, com peso pela média.
                </p>
              )}
              <label className="ios-field">
                <span>Barras</span>
                <input type="number" min={1} inputMode="numeric" value={formMover.qtd_barras} disabled={selecionados.size > 1}
                  onChange={(e) => barrasChange('mover', e.target.value)} placeholder="Vazio = monte todo" />
              </label>
              <label className="ios-field">
                <span>Peso (auto)</span>
                <input type="number" min={0.01} step="0.01" inputMode="decimal" value={formMover.peso} disabled={selecionados.size > 1}
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
                <input value={formVenda.destino} onChange={(e) => setFormVenda({ ...formVenda, destino: e.target.value })} placeholder="Ex.: Comprador / Sucata" />
              </label>
              <label className="ios-field">
                <span>Para quem</span>
                <input value={formVenda.para_quem} onChange={(e) => setFormVenda({ ...formVenda, para_quem: e.target.value })} placeholder="Nome do responsável" />
              </label>
              <label className="ios-field">
                <span>Data</span>
                <input type="date" value={formVenda.data} onChange={(e) => setFormVenda({ ...formVenda, data: e.target.value })} />
              </label>
              {selecionados.size > 1 && (
                <p className="px-4 py-1 text-[12px] font-medium" style={{ color: 'var(--laranja)' }}>
                  Vários montes selecionados — baixa integral, com peso pela média.
                </p>
              )}
              <label className="ios-field">
                <span>Barras</span>
                <input type="number" min={1} inputMode="numeric" value={formVenda.qtd_barras} disabled={selecionados.size > 1}
                  onChange={(e) => barrasChange('venda', e.target.value)} placeholder="Vazio = tudo" />
              </label>
              <label className="ios-field">
                <span>Peso (auto)</span>
                <input type="number" min={0.01} step="0.01" inputMode="decimal" value={formVenda.peso} disabled={selecionados.size > 1}
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
                <p className="px-4 py-2 text-xs font-medium" style={{ color: 'var(--laranja)' }}>
                  A edição aplica ao primeiro monte da seleção.
                </p>
              )}
              <label className="ios-field">
                <span>Barras</span>
                <input type="number" min={1} inputMode="numeric" value={formEditar.qtd_barras}
                  onChange={(e) => setFormEditar({ ...formEditar, qtd_barras: e.target.value })} />
              </label>
              <label className="ios-field">
                <span>Peso (kg)</span>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={formEditar.peso}
                  onChange={(e) => setFormEditar({ ...formEditar, peso: e.target.value })} />
              </label>
              <p className="px-4 pb-3 pt-2 text-[12.5px] text-[var(--muted-foreground)]">
                Editar o peso registra a pesagem real e reajusta os estimados do lote (reconciliação); a edição gera registro de auditoria.
              </p>
            </div>
          )}

          {erro && (
            <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--tint-soft)', color: 'var(--destructive)' }}>{erro}</p>
          )}

          <button onClick={executarAcao}
            disabled={enviando || (acaoAtiva === 'reservar' && !formReserva.setor_id) || (acaoAtiva === 'mover-setor' && !formMover.setor_id) || (acaoAtiva === 'venda' && (!formVenda.destino || !formVenda.para_quem))}
            className={`ios-btn mt-4 disabled:opacity-50 ${acaoAtiva === 'venda' ? 'ios-btn-perigo' : 'ios-btn-primario'}`}>
            {enviando ? 'Aplicando…' : acaoAtiva === 'editar' ? 'Salvar alterações' : `Confirmar ${acaoAtiva === 'reservar' ? 'reserva' : acaoAtiva === 'mover-setor' ? 'movimento' : 'baixa/venda'}`}
          </button>
        </BottomSheet>
      )}

      {modal === 'miniresumo' && hist && (
        <BottomSheet titulo={`Monte ${letraLinha(hist.monte.linha)}${hist.monte.coluna} · Lote ${hist.monte.lote.codigo}`} onClose={() => setModal(null)}>
          <div className="grid grid-cols-3 gap-2.5 pb-3">
            <div className="ios-stat">
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">{fmtNum(hist.monte.peso_exibido)}<small className="text-[12px] font-semibold text-[var(--muted-foreground)]"> kg</small></p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Peso</p>
            </div>
            <div className="ios-stat">
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">{hist.monte.qtd_barras}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Barras</p>
            </div>
            <div className="ios-stat">
              <p className="text-[20px] font-extrabold tracking-tight text-[var(--tint)]">{letraLinha(hist.monte.linha)}{hist.monte.coluna}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]">Posição</p>
            </div>
          </div>
          <div className="rounded-xl bg-[var(--muted)] px-3.5 py-3 text-[14px]">
            {hist.monte.status === 'VENDIDO' && <>Vendido/baixado {(() => {
              const mv = [...hist.movimentacoes].reverse().find((x) => x.tipo === 'BAIXA_VENDA');
              return mv ? <>para <b>{mv.destino ?? '—'}</b>{mv.para_quem ? ` · ${mv.para_quem}` : ''}</> : null;
            })()}</>}
            {hist.monte.status === 'NO_SETOR' && <>Movido para <b>{hist.monte.setor_reserva ?? hist.movimentacoes.find((x) => x.tipo === 'MOVIMENTO_SETOR')?.setor ?? '—'}</b></>}
            {hist.monte.status === 'AJUSTADO' && <>Ajustado pelo sistema (reconciliação do lote)</>}
          </div>
          <button onClick={() => setModal('historico')} className="ios-btn ios-btn-secundario mt-3.5">Ver histórico completo</button>
        </BottomSheet>
      )}

      {modal === 'historico' && hist && (
        <BottomSheet titulo={`Histórico · Lote ${hist.monte.lote.codigo}`} onClose={() => setModal(null)}>
          <div className="mb-4 rounded-xl bg-[var(--muted)] p-3.5 text-[13px]">
            <p className="font-semibold">Liga {hist.monte.lote.liga.nome} · Lote {hist.monte.lote.codigo}</p>
            <p className="text-[var(--muted-foreground)]">
              {hist.monte.qtd_barras} barras · {fmtPeso(hist.monte.peso_exibido)}{hist.monte.estimado ? ' (estimado)' : ''}
            </p>
            <p className="text-[var(--muted-foreground)]">
              {ROTULO_STATUS[hist.monte.status]}{hist.monte.setor_reserva ? ` — ${hist.monte.setor_reserva}` : ''}
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

      <Toast aviso={aviso} aoSumir={sumirToast} />
      <TabBar />
    </div>
  );
}

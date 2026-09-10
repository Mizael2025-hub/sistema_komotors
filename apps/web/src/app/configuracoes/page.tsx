'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { COR_LIGA, COR_LIGA_HEX, type CorLiga } from '@komotors/shared';
import { consumir, enviar } from '@/lib/api/cliente';

type ItemConfig = {
  id: number;
  nome?: string;
  cor?: string;
  ativo: boolean;
  setor_id?: number;
  setor?: { id: number; nome: string };
};

type Crud = 'ligas' | 'setores' | 'colaboradores' | 'modelos-grade';

const ABAS: { chave: Crud; rotulo: string }[] = [
  { chave: 'ligas', rotulo: 'Ligas de chumbo' },
  { chave: 'setores', rotulo: 'Setores' },
  { chave: 'colaboradores', rotulo: 'Colaboradores' },
  { chave: 'modelos-grade', rotulo: 'Modelos de grade' },
];

export default function PaginaConfiguracoes() {
  const [aba, setAba] = useState<Crud>('ligas');
  const [itens, setItens] = useState<ItemConfig[] | undefined>(undefined);
  const [setores, setSetores] = useState<ItemConfig[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(true);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState<CorLiga | ''>('');
  const [setorId, setSetorId] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregarLista = useCallback(async (crud: Crud, incluirInativos: boolean) => {
    try {
      const resultado = await consumir<{ itens: ItemConfig[] }>(
        `/api/config/${crud}?incluir_inativos=${incluirInativos ? 1 : 0}`,
      );
      setItens(resultado.itens ?? []);
      setErro(null);
    } catch (ex) {
      setItens([]);
      setErro(ex instanceof Error ? ex.message : 'Erro ao carregar a lista.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao trocar aba: setState ocorre somente após o await
    carregarLista(aba, mostrarInativos);
  }, [aba, mostrarInativos, carregarLista]);

  const carregarSetores = useCallback(async () => {
    try {
      const r = await consumir<{ itens: ItemConfig[] }>('/api/config/setores?incluir_inativos=1');
      setSetores(r.itens ?? []);
    } catch {
      /* lista de setores é melhor-esforço */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch best-effort ao abrir aba de colaboradores
    if (aba === 'colaboradores') carregarSetores();
  }, [aba, carregarSetores]);

  function limparFormulario() {
    setEditandoId(null);
    setNome('');
    setCor('');
    setSetorId('');
    setErro(null);
  }

  function trocarAba(t: Crud) {
    setAba(t);
    setItens(undefined);
    limparFormulario();
  }

  function iniciarEdicao(item: ItemConfig) {
    setEditandoId(item.id);
    setNome(item.nome ?? '');
    setCor((item.cor as CorLiga) ?? '');
    setSetorId(item.setor_id ? String(item.setor_id) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const corpo: Record<string, unknown> = {};
      if (aba === 'ligas') Object.assign(corpo, { nome, cor });
      else if (aba === 'colaboradores') Object.assign(corpo, { nome, setor_id: Number(setorId) });
      
      else Object.assign(corpo, { nome });

      if (editandoId !== null) {
        await enviar(`/api/config/${aba}/${editandoId}`, { metodo: 'PATCH', corpo });
      } else {
        await enviar(`/api/config/${aba}`, { metodo: 'POST', corpo });
      }
      limparFormulario();
      await carregarLista(aba, mostrarInativos);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao salvar.');
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(item: ItemConfig) {
    setErro(null);
    try {
      await enviar(`/api/config/${aba}/${item.id}`, { metodo: 'PATCH', corpo: { ativo: !item.ativo } });
      await carregarLista(aba, mostrarInativos);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Erro ao alterar status.');
    }
  }

  const rotuloAba = ABAS.find((a) => a.chave === aba)?.rotulo ?? '';
  const usaNomeTexto = true;
  const mostraSetores = aba === 'colaboradores';

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Menu</Link>
          <span className="text-sm font-semibold">Configurações</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {ABAS.map((t) => (
            <button
              key={t.chave}
              onClick={() => trocarAba(t.chave)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                aba === t.chave ? 'bg-foreground text-background' : 'border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        <form onSubmit={salvar} className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-medium">{editandoId !== null ? `Editar ${rotuloAba.toLowerCase()}` : `Nova ${aba === 'ligas' ? 'liga de chumbo' : aba === 'setores' ? 'setor' : aba === 'colaboradores' ? 'colaborador' : 'modelo de grade'}`}</p>

          {usaNomeTexto && (
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Nome</span>
              <input
                required
                maxLength={100}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Digite o nome"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}

          {mostraSetores && (
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Setor</span>
              <select
                required
                value={setorId}
                onChange={(e) => setSetorId(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Escolha o setor…</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome} {s.ativo ? '' : '(inativo)'}</option>
                ))}
              </select>
            </label>
          )}

          {aba === 'ligas' && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-xs text-muted-foreground">Cor da liga (identifica visualmente o chumbo no sistema)</legend>
              <div className="flex flex-wrap gap-2">
                {COR_LIGA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCor(c); if (!nome.trim()) setNome(c === 'AZUL' ? 'Liga 6' : c === 'VERMELHO' ? 'Liga 5' : c === 'PRETO' ? 'Liga 0' : c === 'VERDE' ? 'Liga 4' : c.charAt(0) + c.slice(1).toLowerCase()); }}
                    aria-pressed={cor === c}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                      cor === c ? 'border-foreground font-medium' : 'border-border text-muted-foreground'
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[c] }} />
                    {c.toLowerCase()}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {erro && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando || (!usaNomeTexto && !cor) || (mostraSetores && !setorId)}
              className="h-10 flex-1 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? 'Salvando…' : editandoId !== null ? 'Salvar alterações' : 'Adicionar'}
            </button>
            {editandoId !== null && (
              <button type="button" onClick={limparFormulario} className="h-10 rounded-lg border border-border px-4 text-sm hover:bg-muted">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{itens === undefined ? 'Carregando…' : `${itens.length} cadastro(s)`}</p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => { setMostrarInativos(e.target.checked); setItens(undefined); }} />
            Mostrar inativos
          </label>
        </div>

        <ul className="grid gap-2">
          {(itens ?? []).map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 ${item.ativo ? '' : 'opacity-50'}`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {aba === 'ligas' && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COR_LIGA_HEX[item.cor as CorLiga] }} />}
                  {aba === 'colaboradores' ? item.nome : item.nome ?? item.cor?.toLowerCase()}
                  <span className="text-xs font-normal text-muted-foreground">
                    {aba === 'ligas' ? `cor: ${item.cor?.toLowerCase()}` : aba === 'colaboradores' ? `— ${item.setor?.nome ?? ''}` : ''}
                  </span>
                </p>
                {!item.ativo && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">inativo</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => iniciarEdicao(item)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
                  Editar
                </button>
                <button onClick={() => alternarAtivo(item)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
                  {item.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </li>
          ))}
          {itens !== undefined && itens.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum cadastro ainda.
            </li>
          )}
        </ul>
      </main>
    </div>
  );
}

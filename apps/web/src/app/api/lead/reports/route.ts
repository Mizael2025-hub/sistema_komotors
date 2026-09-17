import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS, erro } from '@/lib/api/erros';
import { dataHojeLocal } from '@komotors/shared';
import { gerarDados, nomeArquivo, RELATORIOS, TIPOS_RELATORIO, type TipoRelatorio } from '@/lib/relatorios/gerador';
import { pdfDe, xlsxDe, type Tabela } from '@/lib/relatorios/exportacao';
import { criarNotificacao } from '@/lib/notificacao';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const url = new URL(request.url);
  const tipo = url.searchParams.get('tipo');
  const formato = url.searchParams.get('formato');
  const de = url.searchParams.get('de') ?? '';
  const ate = url.searchParams.get('ate') ?? '';
  const liga = url.searchParams.get('liga_id') ?? '';
  const lote = url.searchParams.get('lote_id') ?? '';
  const tipoMvt = url.searchParams.get('tipo_mvt') ?? '';
  const setor = url.searchParams.get('setor_id') ?? '';

  if (!tipo || !(TIPOS_RELATORIO as readonly string[]).includes(tipo)) return erro(400, 'Informe o tipo de relatório.', undefined, 'E_VALIDACAO');
  if (!formato || !['xlsx', 'pdf'].includes(formato)) return erro(400, 'Informe o formato (xlsx ou pdf).', undefined, 'E_VALIDACAO');
  if (tipo !== 'saldo' && (!DATA_ISO.test(de) || !DATA_ISO.test(ate))) return erro(400, 'Informe o período (de/ate) em formato AAAA-MM-DD.', undefined, 'E_VALIDACAO');
  if (tipo === 'saldo' && de && !DATA_ISO.test(de)) return erro(400, 'Data inicial inválida.', undefined, 'E_VALIDACAO');

  const rel = tipo as TipoRelatorio;
  // "hoje" no fuso da fábrica (RNF-07) — nunca UTC
  const hoje = dataHojeLocal();
  const filtros = {
    de: tipo === 'saldo' && !de ? hoje : de,
    ate: tipo === 'saldo' && !ate ? hoje : ate,
    ...(liga ? { liga_id: Number(liga) } : {}),
    ...(lote ? { lote_id: Number(lote) } : {}),
    ...(tipoMvt ? { tipo: tipoMvt } : {}),
    ...(setor ? { setor_id: Number(setor) } : {}),
  };

  try {
    const dados = await gerarDados(rel, filtros);
    const def = RELATORIOS.find((r) => r.id === rel);
    if (!def) return erro(404, 'Relatório não encontrado.');
    const tabela: Tabela = {
      titulo: `${dados.titulo} (${filtros.de} a ${filtros.ate})`,
      colunas: def.colunas,
      linhas: dados.linhas,
    };

    const buffer =
      formato === 'pdf'
        ? await pdfDe(tabela)
        : await xlsxDe(tabela);

    const nome = nomeArquivo(rel, formato as 'xlsx' | 'pdf', filtros.de, filtros.ate);

    await criarNotificacao({
      usuario_id: sessao.usuario_id,
      titulo: `Relatório pronto: ${def.nome}`,
      mensagem: `${dados.linhas.length} linha(s) · filtros ${filtros.de} a ${filtros.ate}`,
      url: '/relatorios',
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (ex) {
    return ERROS.erroInterno(ex);
  }
}

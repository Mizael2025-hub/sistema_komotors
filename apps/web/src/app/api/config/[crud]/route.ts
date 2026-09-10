import { listar, criar } from '@/lib/configuracoes/servico';
import { lerCorpo, validaCrud, autorizarAdmin, SCHEMAS, type CrudValido } from '@/lib/configuracoes/rotas';
import { ERROS, erro } from '@/lib/api/erros';

export async function GET(request: Request, { params }: { params: Promise<{ crud: string }> }) {
  const { crud } = await params;
  if (!validaCrud(crud)) return ERROS.naoEncontrado('Modulo');
  const { sessao, resposta } = await autorizarAdmin();
  if (!sessao) return resposta!;

  const incluirInativos = new URL(request.url).searchParams.get('incluir_inativos') === '1';
  return Response.json({ itens: await listar(crud as CrudValido, incluirInativos) });
}

export async function POST(request: Request, { params }: { params: Promise<{ crud: string }> }) {
  const { crud } = await params;
  if (!validaCrud(crud)) return ERROS.naoEncontrado('Modulo');
  const { sessao, resposta } = await autorizarAdmin();
  if (!sessao) return resposta!;

  const parsed = SCHEMAS[crud as CrudValido].safeParse(await lerCorpo(request));
  if (!parsed.success) {
    return ERROS.erroValidacao(parsed.error.issues);
  }

  const dados = parsed.data as { nome?: string; qtd_barras?: never };

  try {
    const criado = await criar(crud as CrudValido, dados, sessao);
    return Response.json({ item: criado }, { status: 201 });
  } catch (ex) {
    if (ex instanceof Error && ex.message.includes('Unique')) {
      const nome = (dados as { nome?: string }).nome ?? 'registro';
      const rotulos: Record<CrudValido, string> = {
        ligas: 'liga', setores: 'setor', colaboradores: 'colaborador', 'modelos-grade': 'modelo', polaridades: 'polaridade',
      };
      return ERROS.conflito(`Ja existe ${rotulos[crud as CrudValido]} "${nome}" cadastrado.`);
    }
    return ERROS.erroInterno(ex);
  }
}

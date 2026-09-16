/* ---------- Exportação de relatórios: XLSX (exceljs) e PDF (pdfmake 0.3.x, Roboto PT-BR) ---------- */
import { createRequire } from 'module';

export type Tabela = { titulo: string; colunas: string[]; linhas: string[][] };

function largurasPorColuna(colunas: string[]): number[] {
  return colunas.map((c) => Math.max(10, Math.min(30, c.length + 8)));
}

export async function xlsxDe(tabela: Tabela): Promise<Buffer> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  const ws = wb.addWorksheet('Relatorio');

  const totalCol = tabela.colunas.length;
  ws.mergeCells(1, 1, 1, totalCol);
  const titulo = ws.getCell(1, 1);
  titulo.value = tabela.titulo;
  titulo.font = { bold: true, size: 14 };

  ws.addRow([]);
  const cabecalho = ws.addRow(tabela.colunas);
  estilizarCabecalho(cabecalho);

  for (const linha of tabela.linhas) ws.addRow(linha);

  largurasPorColuna(tabela.colunas).forEach((largura, i) => {
    ws.getColumn(i + 1).width = largura;
  });

  if (ws.rowCount > 3) {
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: ws.rowCount, column: totalCol } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

function estilizarCabecalho(linha: { eachCell: (fn: (cell: { font: unknown; fill: unknown }) => void) => void }) {
  linha.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
  });
}

export async function pdfDe(tabela: Tabela): Promise<Buffer> {
  /* pdfmake 0.3 é CJS - createRequire evita o interop do bundler (serverExternalPackages deixa fs/fs paths no runtime) */
  const moduloNode = createRequire(import.meta.url);
  const Printer = moduloNode('pdfmake/js/Printer').default;
  const vfs = moduloNode('pdfmake/js/virtual-fs').default;
  const UrlResolver = moduloNode('pdfmake/js/URLResolver').default;
  const fontes = moduloNode('pdfmake/fonts/Roboto.js');
  const urlResolver = new UrlResolver(vfs);
  const impressora = new Printer(fontes, vfs, urlResolver, () => true);

  const definicao = {
    info: { title: tabela.titulo, author: 'Komotors' },
    pageSize: 'A4',
    pageOrientation: 'landscape' as const,
    defaultStyle: { font: 'Roboto', fontSize: 8.5 },
    content: [
      { text: 'Komotors', fontSize: 15, bold: true, margin: [0, 0, 0, 2] },
      { text: `${tabela.titulo} - ${new Date().toLocaleDateString('pt-BR')}`, fontSize: 11, color: '#444444', margin: [0, 0, 0, 14] },
      {
        table: {
          headerRows: 1,
          widths: largurasPorColuna(tabela.colunas).map(() => 'auto'),
          body: [tabela.colunas.map((c) => ({ text: c, bold: true, fontSize: 9 })), ...tabela.linhas],
        },
      },
    ],
  };

  const docPdfKit = (await impressora.createPdfKitDocument(definicao)) as NodeJS.ReadWriteStream & { end: () => void };
  return new Promise<Buffer>((resolve, reject) => {
    const pedacos: Uint8Array[] = [];
    docPdfKit.on('data', (p: Uint8Array) => pedacos.push(p));
    docPdfKit.on('end', () => resolve(Buffer.concat(pedacos)));
    docPdfKit.on('error', reject);
    docPdfKit.end();
  });
}

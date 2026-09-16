declare module 'pdfmake/fonts/Roboto.js' {
  const fontes: Record<string, Record<string, string>>;
  export default fontes;
}

declare module 'pdfmake/js/virtual-fs' {
  const VirtualFs: new () => unknown;
  export default VirtualFs;
}

declare module 'pdfmake/js/URLResolver' {
  const URLResolver: new (vfs: unknown) => unknown;
  export default URLResolver;
}

declare module 'pdfmake/js/Printer' {
  type DocPdfKit = NodeJS.ReadWriteStream & { end: () => void };
  const Printer: new (
    fontes: unknown,
    virtualfs: unknown,
    urlResolver: unknown,
    localAccessPolicy?: unknown,
  ) => { createPdfKitDocument: (definicao: unknown) => Promise<DocPdfKit> };
  export default Printer;
}

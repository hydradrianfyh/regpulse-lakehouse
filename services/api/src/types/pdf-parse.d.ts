declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    version?: string;
  }

  type PdfParseFn = (data: Buffer | Uint8Array | ArrayBuffer) => Promise<PdfParseResult>;

  const pdfParse: PdfParseFn;
  export default pdfParse;
}

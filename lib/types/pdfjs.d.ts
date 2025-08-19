declare module 'pdfjs-dist/build/pdf.mjs' {
  export function getDocument(src: Uint8Array | { data: Uint8Array }): { promise: Promise<any> };
}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs';


import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = Awaited<ReturnType<typeof loadPdf>>

export function loadPdf(data: ArrayBuffer, compatibilityMode = false) {
  const assetBase = `${import.meta.env.BASE_URL}pdfjs/`
  return pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    wasmUrl: `${assetBase}wasm/`,
    enableXfa: true,
    useSystemFonts: true,
    disableFontFace: compatibilityMode,
  }).promise
}

export async function extractPageText(doc: PdfDocument, pageNumber: number) {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

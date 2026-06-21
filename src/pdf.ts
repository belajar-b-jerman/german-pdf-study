import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = Awaited<ReturnType<typeof loadPdf>>

export function loadPdf(data: ArrayBuffer) {
  return pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise
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

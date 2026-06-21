export type Tool = 'cursor' | 'pen' | 'highlighter' | 'line' | 'text' | 'eraser'

export type NavMode = 'buttons' | 'swipe' | 'scroll'

export type Point = {
  x: number
  y: number
}

export type Stroke = {
  id: string
  page: number
  tool: Exclude<Tool, 'cursor' | 'eraser' | 'text'>
  color: string
  width: number
  points: Point[]
  createdAt: number
}

export type TextAnnotation = {
  id: string
  page: number
  x: number
  y: number
  width: number
  text: string
  color: string
  fontSize: number
  createdAt: number
}

export type BundledPdf = {
  title: string
  file: string
  size?: number
}

export type DocRecord = {
  id: string
  name: string
  size: number
  addedAt: number
  updatedAt: number
  lastPage: number
  pageCount?: number
}

export type DocWithData = DocRecord & {
  data: ArrayBuffer
}

export type NoteRecord = {
  id: string
  docId: string
  page: number
  text: string
  updatedAt: number
}

export type VocabRecord = {
  id: string
  docId: string
  page: number
  term: string
  meaning: string
  example: string
  color: string
  createdAt: number
}

export type StudyNoteKind = 'summary' | 'grammar' | 'vocab' | 'example' | 'question'

export type StudyNoteRecord = {
  id: string
  docId: string
  page: number
  kind: StudyNoteKind
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

export type SearchHit = {
  page: number
  snippet: string
}

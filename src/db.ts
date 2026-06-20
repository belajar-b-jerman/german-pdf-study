import { openDB, type DBSchema } from 'idb'
import type { DocRecord, DocWithData, NoteRecord, Stroke, StudyNoteRecord, TextAnnotation, VocabRecord } from './types'

type StrokePage = {
  id: string
  docId: string
  page: number
  strokes: Stroke[]
  updatedAt: number
}

type TextPage = {
  id: string
  docId: string
  page: number
  items: TextAnnotation[]
  updatedAt: number
}

interface StudyDb extends DBSchema {
  docs: {
    key: string
    value: DocRecord
  }
  files: {
    key: string
    value: { id: string; data: ArrayBuffer }
  }
  strokes: {
    key: string
    value: StrokePage
  }
  textAnnotations: {
    key: string
    value: TextPage
  }
  notes: {
    key: string
    value: NoteRecord
    indexes: { byDoc: string }
  }
  vocab: {
    key: string
    value: VocabRecord
    indexes: { byDoc: string }
  }
  studyNotes: {
    key: string
    value: StudyNoteRecord
    indexes: { byDoc: string; byDocPage: [string, number] }
  }
}

const dbPromise = openDB<StudyDb>('deutsch-pdf-study', 4, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('strokes')) db.createObjectStore('strokes', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('textAnnotations')) {
      db.createObjectStore('textAnnotations', { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains('notes')) {
      const notes = db.createObjectStore('notes', { keyPath: 'id' })
      notes.createIndex('byDoc', 'docId')
    }
    if (!db.objectStoreNames.contains('vocab')) {
      const vocab = db.createObjectStore('vocab', { keyPath: 'id' })
      vocab.createIndex('byDoc', 'docId')
    }
    if (!db.objectStoreNames.contains('studyNotes')) {
      const studyNotes = db.createObjectStore('studyNotes', { keyPath: 'id' })
      studyNotes.createIndex('byDoc', 'docId')
      studyNotes.createIndex('byDocPage', ['docId', 'page'])
    }
  },
})

export async function listDocs() {
  const db = await dbPromise
  return db.getAll('docs')
}

export async function saveDoc(doc: DocRecord, data: ArrayBuffer) {
  const db = await dbPromise
  const tx = db.transaction(['docs', 'files'], 'readwrite')
  await Promise.all([tx.objectStore('docs').put(doc), tx.objectStore('files').put({ id: doc.id, data })])
  await tx.done
}

export async function getDoc(id: string): Promise<DocWithData | undefined> {
  const db = await dbPromise
  const [doc, file] = await Promise.all([db.get('docs', id), db.get('files', id)])
  if (!doc || !file) return undefined
  return { ...doc, data: file.data }
}

export async function updateDocMeta(id: string, patch: Partial<Omit<DocRecord, 'id'>>) {
  const db = await dbPromise
  const doc = await db.get('docs', id)
  if (!doc) return
  await db.put('docs', { ...doc, ...patch, updatedAt: Date.now() })
}

export async function getStrokes(docId: string, page: number) {
  const db = await dbPromise
  const row = await db.get('strokes', `${docId}:${page}`)
  return row?.strokes ?? []
}

export async function saveStrokes(docId: string, page: number, strokes: Stroke[]) {
  const db = await dbPromise
  await db.put('strokes', {
    id: `${docId}:${page}`,
    docId,
    page,
    strokes,
    updatedAt: Date.now(),
  })
}

export async function getTextAnnotations(docId: string, page: number) {
  const db = await dbPromise
  const row = await db.get('textAnnotations', `${docId}:${page}`)
  return row?.items ?? []
}

export async function saveTextAnnotations(docId: string, page: number, items: TextAnnotation[]) {
  const db = await dbPromise
  await db.put('textAnnotations', {
    id: `${docId}:${page}`,
    docId,
    page,
    items,
    updatedAt: Date.now(),
  })
}

export async function getNote(docId: string, page: number) {
  const db = await dbPromise
  return db.get('notes', `${docId}:${page}`)
}

export async function saveNote(note: NoteRecord) {
  const db = await dbPromise
  await db.put('notes', note)
}

export async function listVocab(docId: string) {
  const db = await dbPromise
  return db.getAllFromIndex('vocab', 'byDoc', docId)
}

export async function saveVocab(vocab: VocabRecord) {
  const db = await dbPromise
  await db.put('vocab', vocab)
}

export async function deleteVocab(id: string) {
  const db = await dbPromise
  await db.delete('vocab', id)
}

export async function listStudyNotes(docId: string) {
  const db = await dbPromise
  return db.getAllFromIndex('studyNotes', 'byDoc', docId)
}

export async function saveStudyNote(note: StudyNoteRecord) {
  const db = await dbPromise
  await db.put('studyNotes', note)
}

export async function deleteStudyNote(id: string) {
  const db = await dbPromise
  await db.delete('studyNotes', id)
}

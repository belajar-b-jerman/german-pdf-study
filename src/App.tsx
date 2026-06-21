import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Bookmark,
  ClipboardList,
  Download,
  Eraser,
  FileUp,
  FolderOpen,
  Highlighter,
  ListChecks,
  Maximize2,
  Minus,
  MousePointer2,
  NotebookTabs,
  PenLine,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import './App.css'
import {
  deleteStudyNote,
  deleteVocab,
  getDoc,
  getNote,
  getStrokes,
  getTextAnnotations,
  listDocs,
  listStudyNotes,
  listVocab,
  saveDoc,
  saveNote,
  saveStrokes,
  saveStudyNote,
  saveTextAnnotations,
  saveVocab,
  updateDocMeta,
} from './db'
import { extractPageText, loadPdf, type PdfDocument } from './pdf'
import type {
  DocRecord,
  BundledPdf,
  NavMode,
  NoteRecord,
  SearchHit,
  Stroke,
  StudyNoteKind,
  StudyNoteRecord,
  TextAnnotation,
  Tool,
  VocabRecord,
} from './types'

const colors = ['#f2c94c', '#ee6c4d', '#3d8b74', '#2f80ed', '#111827']
const suggestedFiles = [
  'Netzwerk neu A1 Kursbuch.pdf',
  'Netzwerk Neu A1 - Ubungsbuch.pdf',
  'BAHAN AJAR BABAK A1 FULL.pdf',
]
const studyNoteKinds: { id: StudyNoteKind; label: string; prompt: string }[] = [
  { id: 'summary', label: 'Ringkasan', prompt: 'Apa inti halaman ini?' },
  { id: 'grammar', label: 'Grammar', prompt: 'Pola apa yang perlu diingat?' },
  { id: 'vocab', label: 'Vocab', prompt: 'Kata/frasa penting dan artinya' },
  { id: 'example', label: 'Contoh', prompt: 'Kalimat contoh buatan sendiri' },
  { id: 'question', label: 'Pertanyaan', prompt: 'Apa yang masih membingungkan?' },
]

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function currentTimestamp() {
  return new Date().getTime()
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  if (stroke.points.length === 0) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.34
    ctx.globalCompositeOperation = 'multiply'
  }

  const first = stroke.points[0]
  ctx.beginPath()
  ctx.moveTo(first.x * width, first.y * height)

  if (stroke.tool === 'line') {
    const last = stroke.points.at(-1) ?? first
    ctx.lineTo(last.x * width, last.y * height)
  } else {
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x * width, point.y * height)
    }
  }

  ctx.stroke()
  ctx.restore()
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function App() {
  const pageStageRef = useRef<HTMLDivElement | null>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const gestureRef = useRef<{ x: number; y: number } | null>(null)
  const textDragRef = useRef<{
    id: string
    startX: number
    startY: number
    originalX: number
    originalY: number
    latestX: number
    latestY: number
  } | null>(null)
  const wheelRef = useRef(0)
  const [docs, setDocs] = useState<DocRecord[]>([])
  const [bundledPdfs, setBundledPdfs] = useState<BundledPdf[]>([])
  const [activeDocId, setActiveDocId] = useState<string>('')
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [fitToScreen, setFitToScreen] = useState(true)
  const [navMode, setNavMode] = useState<NavMode>('buttons')
  const [tool, setTool] = useState<Tool>('cursor')
  const [showLibrary, setShowLibrary] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showStudy, setShowStudy] = useState(false)
  const [color, setColor] = useState(colors[0])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([])
  const [activeTextId, setActiveTextId] = useState('')
  const [textSize, setTextSize] = useState(18)
  const [draft, setDraft] = useState<Stroke | null>(null)
  const [note, setNote] = useState('')
  const [vocab, setVocab] = useState<VocabRecord[]>([])
  const [studyNotes, setStudyNotes] = useState<StudyNoteRecord[]>([])
  const [noteKind, setNoteKind] = useState<StudyNoteKind>('summary')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [term, setTerm] = useState('')
  const [meaning, setMeaning] = useState('')
  const [example, setExample] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [isIndexing, setIsIndexing] = useState(false)
  const [status, setStatus] = useState('Siap')
  const activeDoc = useMemo(() => docs.find((doc) => doc.id === activeDocId), [activeDocId, docs])

  useEffect(() => {
    listDocs().then((items) => {
      const sorted = items.sort((a, b) => b.updatedAt - a.updatedAt)
      setDocs(sorted)
      setActiveDocId(sorted[0]?.id ?? '')
    })
    fetch(`${import.meta.env.BASE_URL}pdfs/manifest.json`)
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => setBundledPdfs(Array.isArray(items) ? items : []))
      .catch(() => setBundledPdfs([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function openDoc() {
      if (!activeDocId) {
        setPdfDoc(null)
        return
      }

      setStatus('Membuka PDF')
      const doc = await getDoc(activeDocId)
      if (!doc || cancelled) return
      const loaded = await loadPdf(doc.data)
      if (cancelled) return
      setPdfDoc(loaded)
      setPageCount(loaded.numPages)
      setPage(Math.min(doc.lastPage || 1, loaded.numPages))
      setDocs((items) =>
        items.map((item) => (item.id === doc.id ? { ...item, pageCount: loaded.numPages } : item)),
      )
      await updateDocMeta(doc.id, { pageCount: loaded.numPages })
      setStatus('Siap')
    }

    openDoc()
    return () => {
      cancelled = true
    }
  }, [activeDocId])

  useEffect(() => {
    if (!activeDocId) return
    getStrokes(activeDocId, page).then(setStrokes)
    getTextAnnotations(activeDocId, page).then(setTextAnnotations)
    getNote(activeDocId, page).then((row) => setNote(row?.text ?? ''))
    listVocab(activeDocId).then((items) => setVocab(items.sort((a, b) => b.createdAt - a.createdAt)))
    listStudyNotes(activeDocId).then((items) => setStudyNotes(items.sort((a, b) => b.updatedAt - a.updatedAt)))
    updateDocMeta(activeDocId, { lastPage: page })
  }, [activeDocId, page])

  useEffect(() => {
    if (!fitToScreen || !pdfDoc) return

    let cancelled = false
    async function fitPage() {
      const stage = pageStageRef.current
      if (!stage || !pdfDoc) return
      const pdfPage = await pdfDoc.getPage(page)
      if (cancelled) return
      const viewport = pdfPage.getViewport({ scale: 1 })
      const isMobile = window.innerWidth <= 760
      const horizontalPadding = isMobile ? 16 : 56
      const availableWidth = Math.max(280, stage.clientWidth - horizontalPadding)
      const availableHeight = Math.max(360, stage.clientHeight - (isMobile ? 16 : 56))
      const widthFit = availableWidth / viewport.width
      const heightFit = availableHeight / viewport.height
      const nextZoom = Math.max(0.35, Math.min(1.65, isMobile ? Math.min(widthFit, heightFit) : widthFit))
      setZoom((current) => (Math.abs(current - nextZoom) > 0.02 ? nextZoom : current))
    }

    fitPage()
    window.addEventListener('resize', fitPage)
    return () => {
      cancelled = true
      window.removeEventListener('resize', fitPage)
    }
  }, [fitToScreen, page, pdfDoc, showTools])

  useEffect(() => {
    let cancelled = false

    async function renderPage() {
      if (!pdfDoc || !pdfCanvasRef.current || !inkCanvasRef.current) return
      setStatus('Merender halaman')
      const pdfPage = await pdfDoc.getPage(page)
      if (cancelled) return

      const viewport = pdfPage.getViewport({ scale: zoom })
      const ratio = window.devicePixelRatio || 1
      const canvas = pdfCanvasRef.current
      const ink = inkCanvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ink.width = canvas.width
      ink.height = canvas.height
      ink.style.width = canvas.style.width
      ink.style.height = canvas.style.height

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, viewport.width, viewport.height)
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
      if (!cancelled) setStatus('Siap')
    }

    renderPage()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, page, zoom])

  useEffect(() => {
    const canvas = inkCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const ratio = window.devicePixelRatio || 1
    const width = canvas.width / ratio
    const height = canvas.height / ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    for (const stroke of strokes) drawStroke(ctx, stroke, width, height)
    if (draft) drawStroke(ctx, draft, width, height)
  }, [strokes, draft])

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setStatus('Mengimpor PDF')
    const imported: DocRecord[] = []
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) continue
      const data = await file.arrayBuffer()
      const now = currentTimestamp()
      const doc: DocRecord = {
        id: uid('doc'),
        name: file.name,
        size: file.size,
        addedAt: now,
        updatedAt: now,
        lastPage: 1,
      }
      await saveDoc(doc, data)
      imported.push(doc)
    }
    const nextDocs = [...imported, ...docs].sort((a, b) => b.updatedAt - a.updatedAt)
    setDocs(nextDocs)
    setActiveDocId(imported[0]?.id ?? activeDocId)
    setStatus(imported.length ? 'PDF tersimpan offline' : 'Tidak ada PDF')
  }

  async function importBundledPdf(pdf: BundledPdf) {
    setStatus('Mengambil PDF online')
    const url = `${import.meta.env.BASE_URL}pdfs/${pdf.file}`
    const response = await fetch(url)
    if (!response.ok) {
      setStatus('PDF online tidak ditemukan')
      return
    }
    const data = await response.arrayBuffer()
    const now = currentTimestamp()
    const doc: DocRecord = {
      id: uid('doc'),
      name: pdf.title || decodeURIComponent(pdf.file),
      size: pdf.size ?? data.byteLength,
      addedAt: now,
      updatedAt: now,
      lastPage: 1,
    }
    await saveDoc(doc, data)
    setDocs([doc, ...docs].sort((a, b) => b.updatedAt - a.updatedAt))
    setActiveDocId(doc.id)
    setStatus('PDF online tersimpan offline')
  }

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = inkCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }

  function boundedPagePoint(x: number, y: number) {
    return {
      x: Math.max(0.01, Math.min(0.92, x)),
      y: Math.max(0.01, Math.min(0.94, y)),
    }
  }

  async function eraseAt(point: { x: number; y: number }) {
    const filtered = strokes.filter((stroke) => !stroke.points.some((item) => pointDistance(item, point) < 0.025))
    const remainingText = textAnnotations.filter((item) => pointDistance({ x: item.x, y: item.y }, point) > 0.04)
    setStrokes(filtered)
    setTextAnnotations(remainingText)
    if (activeDocId) await saveStrokes(activeDocId, page, filtered)
    if (activeDocId) await saveTextAnnotations(activeDocId, page, remainingText)
  }

  async function addTextAnnotation(point: { x: number; y: number }) {
    if (!activeDocId) return
    const item: TextAnnotation = {
      id: uid('text'),
      page,
      x: point.x,
      y: point.y,
      width: 0.24,
      text: '',
      color,
      fontSize: textSize,
      createdAt: Date.now(),
    }
    const next = [...textAnnotations, item]
    setTextAnnotations(next)
    setActiveTextId(item.id)
    await saveTextAnnotations(activeDocId, page, next)
    window.setTimeout(() => document.getElementById(`text-${item.id}`)?.focus(), 30)
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeDocId) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = canvasPoint(event)
    gestureRef.current = { x: event.clientX, y: event.clientY }
    if (tool === 'cursor') return
    if (tool === 'text') {
      addTextAnnotation(point)
      return
    }
    if (tool === 'eraser') {
      eraseAt(point)
      return
    }
    const baseWidth = tool === 'pen' ? 3 : tool === 'highlighter' ? 18 : 4
    setDraft({
      id: uid('stroke'),
      page,
      tool,
      color,
      width: baseWidth,
      points: [point],
      createdAt: Date.now(),
    })
  }

  function moveStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === 'cursor') return
    if (tool === 'eraser' && event.buttons === 1) {
      eraseAt(canvasPoint(event))
      return
    }
    if (!draft) return
    const point = canvasPoint(event)
    setDraft({ ...draft, points: [...draft.points, point] })
  }

  async function endStroke(event?: React.PointerEvent<HTMLCanvasElement>) {
    if (event && gestureRef.current && tool === 'cursor') {
      const dx = event.clientX - gestureRef.current.x
      const dy = event.clientY - gestureRef.current.y
      const stage = pageStageRef.current?.getBoundingClientRect()
      const isTap = Math.abs(dx) < 16 && Math.abs(dy) < 16
      if (isTap && stage) {
        const x = (event.clientX - stage.left) / stage.width
        if (x < 0.22) setPage((current) => Math.max(1, current - 1))
        if (x > 0.78) setPage((current) => Math.min(pageCount || 1, current + 1))
      }
      return
    }

    if (event && gestureRef.current && navMode !== 'buttons') {
      const dx = event.clientX - gestureRef.current.x
      const dy = event.clientY - gestureRef.current.y
      const horizontal = Math.abs(dx) > 88 && Math.abs(dx) > Math.abs(dy) * 1.25
      const vertical = Math.abs(dy) > 88 && Math.abs(dy) > Math.abs(dx) * 1.25

      if (navMode === 'swipe' && horizontal) {
        setDraft(null)
        setPage((current) => Math.max(1, Math.min(pageCount || 1, current + (dx < 0 ? 1 : -1))))
        return
      }
      if (navMode === 'scroll' && vertical) {
        setDraft(null)
        setPage((current) => Math.max(1, Math.min(pageCount || 1, current + (dy < 0 ? 1 : -1))))
        return
      }
    }
    if (!draft || !activeDocId) return
    const next = [...strokes, draft]
    setStrokes(next)
    setDraft(null)
    await saveStrokes(activeDocId, page, next)
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (navMode !== 'scroll' || Math.abs(event.deltaY) < 45) return
    const now = Date.now()
    if (now - wheelRef.current < 550) return
    wheelRef.current = now
    setPage((current) => Math.max(1, Math.min(pageCount || 1, current + (event.deltaY > 0 ? 1 : -1))))
  }

  async function undo() {
    if (!activeDocId) return
    if (activeTextId) {
      const nextText = textAnnotations.filter((item) => item.id !== activeTextId)
      setTextAnnotations(nextText)
      setActiveTextId('')
      await saveTextAnnotations(activeDocId, page, nextText)
      return
    }
    if (strokes.length === 0) return
    const next = strokes.slice(0, -1)
    setStrokes(next)
    await saveStrokes(activeDocId, page, next)
  }

  async function updateTextAnnotation(id: string, patch: Partial<TextAnnotation>) {
    if (!activeDocId) return
    const next = textAnnotations.map((item) => (item.id === id ? { ...item, ...patch } : item))
    setTextAnnotations(next)
    await saveTextAnnotations(activeDocId, page, next)
  }

  async function removeTextAnnotation(id: string) {
    if (!activeDocId) return
    const next = textAnnotations.filter((item) => item.id !== id)
    setTextAnnotations(next)
    setActiveTextId('')
    await saveTextAnnotations(activeDocId, page, next)
  }

  function startTextDrag(event: React.PointerEvent<HTMLButtonElement>, item: TextAnnotation) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveTextId(item.id)
    textDragRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: item.x,
      originalY: item.y,
      latestX: item.x,
      latestY: item.y,
    }
  }

  function moveTextDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = textDragRef.current
    const stack = pdfCanvasRef.current?.getBoundingClientRect()
    if (!drag || !stack) return
    const next = boundedPagePoint(
      drag.originalX + (event.clientX - drag.startX) / stack.width,
      drag.originalY + (event.clientY - drag.startY) / stack.height,
    )
    drag.latestX = next.x
    drag.latestY = next.y
    setTextAnnotations((items) => items.map((item) => (item.id === drag.id ? { ...item, ...next } : item)))
  }

  async function endTextDrag() {
    const drag = textDragRef.current
    if (!drag || !activeDocId) return
    const next = textAnnotations.map((item) => (item.id === drag.id ? { ...item, x: drag.latestX, y: drag.latestY } : item))
    setTextAnnotations(next)
    textDragRef.current = null
    await saveTextAnnotations(activeDocId, page, next)
  }

  async function persistNote(text: string) {
    setNote(text)
    if (!activeDocId) return
    const row: NoteRecord = {
      id: `${activeDocId}:${page}`,
      docId: activeDocId,
      page,
      text,
      updatedAt: Date.now(),
    }
    await saveNote(row)
  }

  async function addVocab() {
    if (!activeDocId || !term.trim()) return
    const item: VocabRecord = {
      id: uid('vocab'),
      docId: activeDocId,
      page,
      term: term.trim(),
      meaning: meaning.trim(),
      example: example.trim(),
      color,
      createdAt: Date.now(),
    }
    await saveVocab(item)
    setVocab([item, ...vocab])
    setTerm('')
    setMeaning('')
    setExample('')
  }

  async function removeVocab(id: string) {
    await deleteVocab(id)
    setVocab(vocab.filter((item) => item.id !== id))
  }

  async function addStudyNote() {
    if (!activeDocId || (!noteTitle.trim() && !noteBody.trim())) return
    const kind = studyNoteKinds.find((item) => item.id === noteKind)
    const now = Date.now()
    const item: StudyNoteRecord = {
      id: uid('study-note'),
      docId: activeDocId,
      page,
      kind: noteKind,
      title: noteTitle.trim() || kind?.label || 'Catatan',
      body: noteBody.trim(),
      createdAt: now,
      updatedAt: now,
    }
    await saveStudyNote(item)
    setStudyNotes([item, ...studyNotes])
    setNoteTitle('')
    setNoteBody('')
  }

  async function removeStudyNote(id: string) {
    await deleteStudyNote(id)
    setStudyNotes(studyNotes.filter((item) => item.id !== id))
  }

  async function searchDoc() {
    if (!pdfDoc || !query.trim()) return
    setIsIndexing(true)
    setStatus('Mencari teks')
    const needle = query.toLowerCase()
    const results: SearchHit[] = []
    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      const text = await extractPageText(pdfDoc, pageNumber)
      const lower = text.toLowerCase()
      const index = lower.indexOf(needle)
      if (index >= 0) {
        const start = Math.max(0, index - 70)
        results.push({ page: pageNumber, snippet: text.slice(start, index + query.length + 120) })
      }
      if (results.length >= 20) break
    }
    setHits(results)
    setIsIndexing(false)
    setStatus(results.length ? `${results.length} hasil` : 'Tidak ada hasil')
  }

  function exportBackup() {
    const payload = {
      app: 'Deutsch PDF Study',
      exportedAt: new Date().toISOString(),
      activeDoc: activeDoc ? { id: activeDoc.id, name: activeDoc.name, page } : null,
      pageStrokes: strokes,
      pageTextAnnotations: textAnnotations,
      pageNote: note,
      studyNotes,
      vocab,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `deutsch-pdf-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importBackup(files: FileList | null) {
    if (!activeDocId || !files?.[0]) return
    const raw = await files[0].text()
    const backup = JSON.parse(raw) as {
      activeDoc?: { page?: number }
      pageStrokes?: Stroke[]
      pageTextAnnotations?: TextAnnotation[]
      pageNote?: string
      studyNotes?: StudyNoteRecord[]
      vocab?: VocabRecord[]
    }
    const targetPage = backup.activeDoc?.page || page
    const now = currentTimestamp()

    if (backup.pageStrokes) {
      await saveStrokes(activeDocId, targetPage, backup.pageStrokes.map((item) => ({ ...item, page: targetPage })))
      if (targetPage === page) setStrokes(backup.pageStrokes.map((item) => ({ ...item, page: targetPage })))
    }
    if (backup.pageTextAnnotations) {
      const restoredText = backup.pageTextAnnotations.map((item) => ({ ...item, page: targetPage }))
      await saveTextAnnotations(activeDocId, targetPage, restoredText)
      if (targetPage === page) setTextAnnotations(restoredText)
    }
    if (typeof backup.pageNote === 'string') {
      await saveNote({ id: `${activeDocId}:${targetPage}`, docId: activeDocId, page: targetPage, text: backup.pageNote, updatedAt: now })
      if (targetPage === page) setNote(backup.pageNote)
    }
    if (backup.studyNotes?.length) {
      const restored = backup.studyNotes.map((item) => ({ ...item, id: uid('study-note'), docId: activeDocId, updatedAt: now }))
      await Promise.all(restored.map(saveStudyNote))
      setStudyNotes((items) => [...restored, ...items].sort((a, b) => b.updatedAt - a.updatedAt))
    }
    if (backup.vocab?.length) {
      const restored = backup.vocab.map((item) => ({ ...item, id: uid('vocab'), docId: activeDocId, createdAt: now }))
      await Promise.all(restored.map(saveVocab))
      setVocab((items) => [...restored, ...items].sort((a, b) => b.createdAt - a.createdAt))
    }
    setStatus('Backup berhasil di-import')
  }

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'cursor', icon: <MousePointer2 size={20} />, label: 'Cursor' },
    { id: 'pen', icon: <PenLine size={20} />, label: 'Pen' },
    { id: 'highlighter', icon: <Highlighter size={20} />, label: 'Highlight' },
    { id: 'line', icon: <Minus size={20} />, label: 'Garis' },
    { id: 'text', icon: <Type size={20} />, label: 'Text' },
    { id: 'eraser', icon: <Eraser size={20} />, label: 'Eraser' },
  ]

  return (
    <main
      className={`app-shell reader-fullscreen ${showLibrary ? 'show-library' : ''} ${showTools ? 'show-tools' : ''} ${showStudy ? 'show-study' : ''}`}
    >
      {(showLibrary || showStudy) && (
        <button
          className="mobile-scrim"
          type="button"
          aria-label="Tutup panel"
          onClick={() => {
            setShowLibrary(false)
            setShowStudy(false)
          }}
        />
      )}
      <aside className="library-panel">
        <div className="brand-row">
          <BookOpen size={24} />
          <div>
            <h1>Deutsch PDF</h1>
            <span>{status}</span>
          </div>
          <button className="panel-close" type="button" onClick={() => setShowLibrary(false)}>
            Tutup
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/pdf"
          multiple
          onChange={(event) => handleFiles(event.target.files)}
        />
        <button className="primary-action" type="button" onClick={() => fileInputRef.current?.click()}>
          <FileUp size={20} />
          Import PDF
        </button>
        <input
          ref={backupInputRef}
          className="sr-only"
          type="file"
          accept="application/json"
          onChange={(event) => importBackup(event.target.files)}
        />
        <button className="secondary-action" type="button" onClick={() => backupInputRef.current?.click()}>
          <Download size={20} />
          Import backup
        </button>

        <div className="hint-list">
          {suggestedFiles.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>

        {bundledPdfs.length > 0 ? (
          <div className="doc-list online-list">
            {bundledPdfs.map((pdf) => (
              <button className="doc-item" key={pdf.file} type="button" onClick={() => importBundledPdf(pdf)}>
                <span>{pdf.title}</span>
                <small>PDF online</small>
              </button>
            ))}
          </div>
        ) : null}

        <div className="doc-list">
          {docs.map((doc) => (
            <button
              className={`doc-item ${doc.id === activeDocId ? 'active' : ''}`}
              key={doc.id}
              type="button"
              onClick={() => setActiveDocId(doc.id)}
            >
              <span>{doc.name}</span>
              <small>
                {formatSize(doc.size)} {doc.pageCount ? `- ${doc.pageCount} hlm` : ''}
              </small>
            </button>
          ))}
        </div>
      </aside>

      <section className="reader-panel">
        <header className="reader-toolbar">
          <div className="page-controls">
            <button type="button" title="Halaman sebelumnya" onClick={() => setPage(Math.max(1, page - 1))}>
              <Minus size={18} />
            </button>
            <span>
              {page} / {pageCount || '-'}
            </span>
            <button type="button" title="Halaman berikutnya" onClick={() => setPage(Math.min(pageCount || 1, page + 1))}>
              <Plus size={18} />
            </button>
          </div>

          <div className="tool-group" role="toolbar" aria-label="Annotation tools">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                className={tool === item.id ? 'selected' : ''}
                onClick={() => setTool(item.id)}
              >
                {item.icon}
              </button>
            ))}
            <button type="button" title="Undo" onClick={undo}>
              <Undo2 size={20} />
            </button>
          </div>

          <div className="zoom-controls">
            <button
              type="button"
              title="Zoom out"
              onClick={() => {
                setFitToScreen(false)
                setZoom(Math.max(0.45, zoom - 0.1))
              }}
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              title="Fit"
              className={fitToScreen ? 'selected' : ''}
              onClick={() => setFitToScreen(true)}
            >
              <Maximize2 size={18} />
            </button>
            <button
              type="button"
              title="Zoom in"
              onClick={() => {
                setFitToScreen(false)
                setZoom(Math.min(2.2, zoom + 0.1))
              }}
            >
              <ZoomIn size={18} />
            </button>
          </div>
        </header>

        <div className="color-row">
          <div className="mode-switch" role="group" aria-label="Mode halaman">
            {(['buttons', 'swipe', 'scroll'] as NavMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={navMode === mode ? 'selected' : ''}
                onClick={() => setNavMode(mode)}
              >
                {mode === 'buttons' ? '+/-' : mode === 'swipe' ? 'Swipe' : 'Scroll'}
              </button>
            ))}
          </div>
          {colors.map((item) => (
            <button
              key={item}
              className={`color-dot ${color === item ? 'selected' : ''}`}
              style={{ background: item }}
              type="button"
              title={item}
              onClick={() => setColor(item)}
            />
          ))}
          {tool === 'text' ? (
            <div className="text-size-controls">
              <button type="button" title="Kecilkan teks" onClick={() => setTextSize(Math.max(12, textSize - 1))}>
                <Minus size={16} />
              </button>
              <span>{textSize}</span>
              <button type="button" title="Besarkan teks" onClick={() => setTextSize(Math.min(30, textSize + 1))}>
                <Plus size={16} />
              </button>
            </div>
          ) : null}
        </div>

        <div ref={pageStageRef} className={`page-stage ${navMode}-mode tool-${tool}`} onWheel={handleWheel}>
          {activeDoc ? (
            <div className="canvas-stack">
              <canvas ref={pdfCanvasRef} className="pdf-canvas" />
              <canvas
                ref={inkCanvasRef}
                className="ink-canvas"
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerCancel={() => setDraft(null)}
              />
              <div className="text-layer" aria-label="Text answers">
                {textAnnotations.map((item) => (
                  <div
                    className={`text-annotation ${activeTextId === item.id ? 'active' : ''}`}
                    key={item.id}
                    style={{
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: `${(item.width ?? 0.24) * 100}%`,
                      color: item.color,
                    }}
                  >
                    <textarea
                      id={`text-${item.id}`}
                      value={item.text}
                      style={{ color: item.color, fontSize: `${item.fontSize * zoom}px` }}
                      placeholder="Jawaban"
                      onFocus={() => setActiveTextId(item.id)}
                      onChange={(event) => updateTextAnnotation(item.id, { text: event.target.value })}
                    />
                    <button
                      className="drag-handle"
                      type="button"
                      title="Geser jawaban"
                      onPointerDown={(event) => startTextDrag(event, item)}
                      onPointerMove={moveTextDrag}
                      onPointerUp={endTextDrag}
                      onPointerCancel={endTextDrag}
                    >
                      <MousePointer2 size={14} />
                    </button>
                    <button type="button" title="Hapus teks" onClick={() => removeTextAnnotation(item.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <BookOpen size={40} />
              <h2>Import PDF dulu</h2>
            </div>
          )}
        </div>
        <nav className="mobile-reader-dock" aria-label="Mobile reader controls">
          <button
            type="button"
            onClick={() => {
              setShowLibrary(true)
              setShowTools(false)
              setShowStudy(false)
            }}
          >
            <FolderOpen size={20} />
            File
          </button>
          <button type="button" onClick={() => setPage(Math.max(1, page - 1))}>
            <Minus size={20} />
            Prev
          </button>
          <button type="button" onClick={() => setShowTools((value) => !value)}>
            <SlidersHorizontal size={20} />
            Tools
          </button>
          <button type="button" onClick={() => setPage(Math.min(pageCount || 1, page + 1))}>
            <Plus size={20} />
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              setShowStudy(true)
              setShowTools(false)
              setShowLibrary(false)
            }}
          >
            <NotebookTabs size={20} />
            Notes
          </button>
        </nav>
      </section>

      <aside className="study-panel">
        <div className="panel-title study-panel-header">
          <NotebookTabs size={18} />
          <h2>Belajar</h2>
          <button className="panel-close" type="button" onClick={() => setShowStudy(false)}>
            Tutup
          </button>
        </div>
        <section>
          <div className="panel-title">
            <Bookmark size={18} />
            <h2>Catatan halaman</h2>
          </div>
          <textarea value={note} onChange={(event) => persistNote(event.target.value)} />
        </section>

        <section>
          <div className="panel-title">
            <ClipboardList size={18} />
            <h2>Study Cards</h2>
          </div>
          <div className="kind-row" role="tablist" aria-label="Jenis catatan">
            {studyNoteKinds.map((item) => (
              <button
                key={item.id}
                type="button"
                className={noteKind === item.id ? 'selected' : ''}
                onClick={() => setNoteKind(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input value={noteTitle} placeholder="Judul singkat" onChange={(event) => setNoteTitle(event.target.value)} />
          <textarea
            className="compact-textarea"
            value={noteBody}
            placeholder={studyNoteKinds.find((item) => item.id === noteKind)?.prompt}
            onChange={(event) => setNoteBody(event.target.value)}
          />
          <button className="secondary-action" type="button" onClick={addStudyNote}>
            <Plus size={18} />
            Simpan card
          </button>
          <div className="study-note-list">
            {studyNotes.map((item) => (
              <article key={item.id} className={`study-card ${item.kind}`}>
                <button type="button" title="Hapus" onClick={() => removeStudyNote(item.id)}>
                  <Trash2 size={16} />
                </button>
                <small>
                  {studyNoteKinds.find((kind) => kind.id === item.kind)?.label} - hlm {item.page}
                </small>
                <strong>{item.title}</strong>
                {item.body ? <span>{item.body}</span> : null}
                <button className="page-link" type="button" onClick={() => setPage(item.page)}>
                  Buka halaman
                </button>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="panel-title">
            <Star size={18} />
            <h2>Vocab</h2>
          </div>
          <input value={term} placeholder="Wort" onChange={(event) => setTerm(event.target.value)} />
          <input value={meaning} placeholder="Arti" onChange={(event) => setMeaning(event.target.value)} />
          <input value={example} placeholder="Beispiel" onChange={(event) => setExample(event.target.value)} />
          <button className="secondary-action" type="button" onClick={addVocab}>
            <Plus size={18} />
            Tambah
          </button>
          <div className="vocab-list">
            {vocab.map((item) => (
              <article key={item.id} style={{ borderLeftColor: item.color }}>
                <button type="button" title="Hapus" onClick={() => removeVocab(item.id)}>
                  <Trash2 size={16} />
                </button>
                <strong>{item.term}</strong>
                <span>{item.meaning || '-'}</span>
                <small>hlm {item.page}</small>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="panel-title">
            <Search size={18} />
            <h2>Search</h2>
          </div>
          <div className="search-row">
            <input value={query} placeholder="Cari teks" onChange={(event) => setQuery(event.target.value)} />
            <button type="button" title="Cari" onClick={searchDoc} disabled={isIndexing}>
              <Search size={18} />
            </button>
          </div>
          <div className="hit-list">
            {hits.map((hit) => (
              <button key={`${hit.page}-${hit.snippet}`} type="button" onClick={() => setPage(hit.page)}>
                <strong>hlm {hit.page}</strong>
                <span>{hit.snippet || 'Teks ditemukan'}</span>
              </button>
            ))}
          </div>
        </section>

        <button className="secondary-action" type="button" onClick={exportBackup}>
          <Download size={18} />
          Export backup
        </button>
        <button className="secondary-action" type="button" onClick={() => backupInputRef.current?.click()}>
          <Download size={18} />
          Import backup
        </button>
        <div className="mini-stats">
          <ListChecks size={18} />
          <span>{strokes.length} tanda halaman ini</span>
        </div>
      </aside>
    </main>
  )
}

export default App

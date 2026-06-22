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
  Minus,
  MousePointer2,
  NotebookTabs,
  Palette,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
} from 'lucide-react'
import './App.css'
import {
  deleteDoc,
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
    const last = stroke.points[stroke.points.length - 1] ?? first
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
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
  const textResizeRef = useRef<{
    id: string
    startX: number
    startY: number
    originalWidth: number
    originalFontSize: number
    latestWidth: number
    latestFontSize: number
  } | null>(null)
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>
    startDistance: number
    startZoom: number
  }>({ pointers: new Map(), startDistance: 0, startZoom: 1 })
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
  const [showColors, setShowColors] = useState(false)
  const [zoomMode, setZoomMode] = useState(false)
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
      try {
        const loaded = await loadPdf(doc.data, doc.renderMode === 'compatibility')
        if (cancelled) return
        setPdfDoc(loaded)
        setPageCount(loaded.numPages)
        setPage(Math.min(doc.lastPage || 1, loaded.numPages))
        setDocs((items) =>
          items.map((item) => (item.id === doc.id ? { ...item, pageCount: loaded.numPages } : item)),
        )
        await updateDocMeta(doc.id, { pageCount: loaded.numPages })
        setStatus(doc.renderMode === 'compatibility' ? 'Siap - mode kompatibilitas' : 'Siap')
      } catch (error) {
        if (cancelled) return
        console.error(error)
        setPdfDoc(null)
        setPageCount(0)
        setStatus('PDF gagal dibuka')
      }
    }

    openDoc()
    return () => {
      cancelled = true
    }
  }, [activeDocId, activeDoc?.renderMode])

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
      try {
        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) {
          setStatus(activeDoc?.renderMode === 'compatibility' ? 'Siap - mode kompatibilitas' : 'Siap')
        }
      } catch (error) {
        if (cancelled) return
        console.error(error)
        setStatus('Halaman gagal dirender')
      }
    }

    renderPage()
    return () => {
      cancelled = true
    }
  }, [activeDoc?.renderMode, pdfDoc, page, zoom])

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

  async function removePdf(id: string) {
    const doc = docs.find((item) => item.id === id)
    if (!doc) return
    const confirmed = window.confirm(
      `Hapus "${doc.name}" dari perangkat ini? Semua coretan, teks, catatan, dan study card PDF ini juga akan dihapus.`,
    )
    if (!confirmed) return

    setStatus('Menghapus PDF')
    await deleteDoc(id)
    const remaining = docs.filter((item) => item.id !== id)
    setDocs(remaining)
    if (activeDocId === id) {
      setPdfDoc(null)
      setPage(1)
      setPageCount(0)
      setStrokes([])
      setTextAnnotations([])
      setNote('')
      setVocab([])
      setStudyNotes([])
      setActiveDocId(remaining[0]?.id ?? '')
    }
    setStatus('PDF dihapus')
  }

  async function toggleRenderMode(id: string) {
    const doc = docs.find((item) => item.id === id)
    if (!doc) return
    const renderMode = doc.renderMode === 'compatibility' ? 'default' : 'compatibility'
    setStatus('Memuat ulang tampilan PDF')
    await updateDocMeta(id, { renderMode })
    setDocs((items) => items.map((item) => (item.id === id ? { ...item, renderMode } : item)))
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
      x: clamp(x, 0.01, 0.92),
      y: clamp(y, 0.01, 0.94),
    }
  }

  function applyZoom(nextZoom: number) {
    setFitToScreen(false)
    setZoom(clamp(nextZoom, 0.45, 2.4))
  }

  function toggleZoomMode() {
    setShowColors(false)
    setZoomMode((current) => {
      if (current) {
        setFitToScreen(true)
        return false
      }
      setTool('cursor')
      setFitToScreen(false)
      return true
    })
  }

  function trackPinchStart(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!zoomMode) return
    const pinch = pinchRef.current
    pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.pointers.size === 2) {
      const [first, second] = Array.from(pinch.pointers.values())
      pinch.startDistance = pointDistance(first, second)
      pinch.startZoom = zoom
    }
  }

  function trackPinchMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!zoomMode) return false
    const pinch = pinchRef.current
    if (!pinch.pointers.has(event.pointerId)) return true
    pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.pointers.size !== 2 || pinch.startDistance <= 0) return true
    const [first, second] = Array.from(pinch.pointers.values())
    const nextDistance = pointDistance(first, second)
    applyZoom(pinch.startZoom * (nextDistance / pinch.startDistance))
    return true
  }

  function trackPinchEnd(pointerId: number) {
    const pinch = pinchRef.current
    pinch.pointers.delete(pointerId)
    if (pinch.pointers.size < 2) {
      pinch.startDistance = 0
      pinch.startZoom = zoom
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
    trackPinchStart(event)
    if (zoomMode) return
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
    if (zoomMode) {
      trackPinchMove(event)
      return
    }
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
    if (event && zoomMode) {
      trackPinchEnd(event.pointerId)
      return
    }
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
    if (zoomMode) {
      event.preventDefault()
      const direction = event.deltaY > 0 ? -1 : 1
      applyZoom(zoom + direction * 0.08)
      return
    }
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

  async function changeTextSize(delta: number) {
    const nextSize = clamp((textAnnotations.find((item) => item.id === activeTextId)?.fontSize ?? textSize) + delta, 11, 38)
    setTextSize(nextSize)
    if (activeTextId) {
      await updateTextAnnotation(activeTextId, { fontSize: nextSize })
    }
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

  function startTextResize(event: React.PointerEvent<HTMLButtonElement>, item: TextAnnotation) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveTextId(item.id)
    textResizeRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      originalWidth: item.width ?? 0.24,
      originalFontSize: item.fontSize,
      latestWidth: item.width ?? 0.24,
      latestFontSize: item.fontSize,
    }
  }

  function moveTextResize(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = textResizeRef.current
    const stack = pdfCanvasRef.current?.getBoundingClientRect()
    if (!resize || !stack) return
    const deltaX = (event.clientX - resize.startX) / stack.width
    const deltaY = (event.clientY - resize.startY) / stack.height
    const nextWidth = clamp(resize.originalWidth + deltaX, 0.12, 0.78)
    const nextFontSize = Math.round(clamp(resize.originalFontSize + deltaY * 95, 11, 38))
    resize.latestWidth = nextWidth
    resize.latestFontSize = nextFontSize
    setTextAnnotations((items) =>
      items.map((item) =>
        item.id === resize.id ? { ...item, width: nextWidth, fontSize: nextFontSize } : item,
      ),
    )
  }

  async function endTextResize() {
    const resize = textResizeRef.current
    if (!resize || !activeDocId) return
    const next = textAnnotations.map((item) =>
      item.id === resize.id
        ? { ...item, width: resize.latestWidth, fontSize: resize.latestFontSize }
        : item,
    )
    setTextAnnotations(next)
    textResizeRef.current = null
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
      className={`app-shell reader-fullscreen ${showLibrary ? 'show-library' : ''} ${showTools ? 'show-tools' : ''} ${showStudy ? 'show-study' : ''} ${showColors || tool === 'text' ? 'show-tools-extra' : ''}`}
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
          onChange={(event) => {
            handleFiles(event.target.files)
            event.currentTarget.value = ''
          }}
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

        <div className="library-scroll">
          {bundledPdfs.length > 0 ? (
            <section className="library-group online-list">
              <h2>PDF online</h2>
              <div className="doc-list">
                {bundledPdfs.map((pdf) => (
                  <button className="doc-item" key={pdf.file} type="button" onClick={() => importBundledPdf(pdf)}>
                    <span>{pdf.title}</span>
                    <small>Simpan ke perangkat</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="library-group saved-library">
            <h2>PDF tersimpan</h2>
            <div className="doc-list">
              {docs.map((doc) => (
                <div className={`doc-row ${doc.id === activeDocId ? 'active' : ''}`} key={doc.id}>
                  <button className="doc-item" type="button" onClick={() => setActiveDocId(doc.id)}>
                    <span>{doc.name}</span>
                    <small>
                      {formatSize(doc.size)} {doc.pageCount ? `- ${doc.pageCount} hlm` : ''}
                    </small>
                  </button>
                  <button
                    className="doc-delete"
                    type="button"
                    title={`Hapus ${doc.name}`}
                    aria-label={`Hapus ${doc.name}`}
                    onClick={() => removePdf(doc.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              {docs.length === 0 ? <p className="library-empty">Belum ada PDF tersimpan.</p> : null}
            </div>
          </section>
        </div>

        {activeDoc ? (
          <button className="compatibility-action" type="button" onClick={() => toggleRenderMode(activeDoc.id)}>
            <RefreshCw size={18} />
            {activeDoc.renderMode === 'compatibility' ? 'Tampilan PDF normal' : 'Perbaiki teks PDF'}
          </button>
        ) : null}
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
                onClick={() => {
                  setTool(item.id)
                  setZoomMode(false)
                }}
              >
                {item.icon}
              </button>
            ))}
          </div>

          <div className="zoom-controls">
            <button
              type="button"
              title={zoomMode ? 'Fit halaman' : 'Zoom'}
              className={zoomMode ? 'selected' : ''}
              onClick={toggleZoomMode}
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              title="Warna"
              className={showColors ? 'selected color-menu-trigger' : 'color-menu-trigger'}
              onClick={() => setShowColors((value) => !value)}
              style={{ color }}
            >
              <Palette size={18} />
            </button>
            <button type="button" title="Undo" onClick={undo}>
              <Undo2 size={20} />
            </button>
          </div>
        </header>

        <div className={`color-row ${showColors || tool === 'text' ? '' : 'empty-tools-row'}`}>
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
          {showColors ? (
            <div className="color-popover" aria-label="Pilihan warna">
              {colors.map((item) => (
                <button
                  key={item}
                  className={`color-dot ${color === item ? 'selected' : ''}`}
                  style={{ background: item }}
                  type="button"
                  title={item}
                  onClick={() => {
                    setColor(item)
                    if (activeTextId) updateTextAnnotation(activeTextId, { color: item })
                    setShowColors(false)
                  }}
                />
              ))}
            </div>
          ) : null}
          {tool === 'text' ? (
            <div className="text-size-controls">
              <button type="button" title="Kecilkan teks" onClick={() => changeTextSize(-1)}>
                <Minus size={16} />
              </button>
              <span>{activeTextId ? (textAnnotations.find((item) => item.id === activeTextId)?.fontSize ?? textSize) : textSize}</span>
              <button type="button" title="Besarkan teks" onClick={() => changeTextSize(1)}>
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
                onPointerCancel={(event) => {
                  trackPinchEnd(event.pointerId)
                  setDraft(null)
                }}
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
                    <button
                      className="resize-handle"
                      type="button"
                      title="Ubah ukuran teks"
                      onPointerDown={(event) => startTextResize(event, item)}
                      onPointerMove={moveTextResize}
                      onPointerUp={endTextResize}
                      onPointerCancel={endTextResize}
                    >
                      <Plus size={14} />
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

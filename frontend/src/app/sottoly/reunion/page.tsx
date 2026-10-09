'use client'

// Detalle de una Reunión con su transcripción (PLAN.md, tareas 12 y 27; canvas «5»): título que se cambia con un
// clic, Decisiones por revisar y las Sugerencias de la junta en su momento. `?id=`: la exportación estática de
// Next no admite rutas dinámicas sin generarlas al compilar.
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LoadError } from '@/components/sottoly/PanelShell'
import { DecisionsReview, type CandidateDecision } from '@/components/sottoly/DecisionsReview'

interface TranscriptLine {
  id: string
  text: string
  timestamp: string
  audio_start_time?: number
  speaker?: string | null
}

interface MeetingDetails {
  id: string
  title: string
  created_at: string
  transcripts: TranscriptLine[]
}

/** Quién habló, si la Reunión lo guardó: micrófono = el Usuario, audio del sistema = la Contraparte. */
function speakerLabel(speaker?: string | null): string | null {
  if (speaker === 'mic' || speaker === 'user') return 'Tú'
  if (speaker === 'system' || speaker === 'counterpart') return 'Contraparte'
  return null
}

function clock(line: TranscriptLine): string {
  if (typeof line.audio_start_time === 'number') {
    const s = Math.max(0, Math.floor(line.audio_start_time))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }
  return line.timestamp
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; meeting: MeetingDetails }

/** Una Sugerencia guardada con la Reunión (sottoly_suggestions.rs). */
interface SavedSuggestion {
  id: string
  role: string
  persona: string
  role_label: string
  text: string
  reason: string
  at: number | null
  useful: boolean | null
}

type Item = { kind: 'line'; line: TranscriptLine } | { kind: 'card'; s: SavedSuggestion }

/** La transcripción con cada Sugerencia en su momento (después de lo que se dijo antes de ella). */
function interleave(lines: TranscriptLine[], suggestions: SavedSuggestion[]): Item[] {
  const items: Item[] = []
  const pending = [...suggestions].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
  for (const line of lines) {
    const t = line.audio_start_time
    while (pending.length && typeof t === 'number' && (pending[0]!.at ?? Infinity) < t) items.push({ kind: 'card', s: pending.shift()! })
    items.push({ kind: 'line', line })
  }
  for (const s of pending) items.push({ kind: 'card', s })
  return items
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B]'

interface DecisionsFile {
  reviewed: boolean
  decisions: CandidateDecision[]
}

function Reunion() {
  const id = useSearchParams()?.get('id') ?? ''
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [decisions, setDecisions] = useState<DecisionsFile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SavedSuggestion[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [proposed, setProposed] = useState(false)

  const fetchMeeting = useCallback(async () => {
    setLoad({ state: 'loading' })
    try {
      const meeting = await invoke<MeetingDetails | null>('api_get_meeting', { meetingId: id })
      // El título que propuso el modelo al cerrar (tarea 28) reemplaza al automático, una sola vez.
      const title = meeting ? await invoke<string | null>('sottoly_apply_title', { meetingId: id }).catch(() => null) : null
      if (title) setProposed(true)
      setLoad(meeting ? { state: 'ready', meeting: title ? { ...meeting, title } : meeting } : { state: 'error' })
      // Las Decisiones del cierre (tarea 17): si no hay, o no se pueden leer, la Reunión se ve igual.
      setDecisions(await invoke<DecisionsFile | null>('sottoly_get_decisions', { meetingId: id }).catch(() => null))
      // Las Sugerencias de la junta (tarea 27): si no hay, la transcripción se ve igual.
      setSuggestions((await invoke<SavedSuggestion[] | null>('sottoly_get_suggestions', { meetingId: id }).catch(() => null)) ?? [])
    } catch {
      setLoad({ state: 'error' })
    }
  }, [id])

  useEffect(() => {
    if (id) void fetchMeeting()
  }, [id, fetchMeeting])

  // Las Decisiones llegan cuando el Motor termina de proponerlas, a veces después de abrir la Reunión (tarea 21).
  useEffect(() => {
    if (!id) return
    const off = listen('summary', async () => {
      setDecisions(await invoke<DecisionsFile | null>('sottoly_get_decisions', { meetingId: id }).catch(() => null))
      const title = await invoke<string | null>('sottoly_apply_title', { meetingId: id }).catch(() => null)
      if (title) {
        setProposed(true)
        setLoad((l) => (l.state === 'ready' ? { state: 'ready', meeting: { ...l.meeting, title } } : l))
      }
    })
    return () => {
      off.then((f) => f())
    }
  }, [id])

  if (load.state === 'loading') return <p className="m-0 text-[15px] text-[#5C5C63]">Cargando…</p>
  if (load.state === 'error') return <LoadError message="No se pudo abrir esta Reunión." onRetry={fetchMeeting} />

  const { meeting } = load
  const saveTitle = async () => {
    const title = (editing ?? '').trim()
    if (!title || title === meeting.title) {
      setEditing(null)
      return
    }
    try {
      await invoke('api_save_meeting_title', { meetingId: meeting.id, title })
      // El título que pusiste manda: el que proponga el modelo después ya no lo pisa (tarea 28).
      await invoke('sottoly_title_settled', { meetingId: meeting.id }).catch(() => {})
      setProposed(false)
      setLoad({ state: 'ready', meeting: { ...meeting, title } })
      setEditing(null)
      setTitleError(null)
    } catch {
      setTitleError('No se pudo cambiar el título.')
    }
  }
  const count = suggestions.length
  const meta = [dateLabel(meeting.created_at), proposed ? 'Título propuesto por Sottoly' : null, count ? `${count} ${count === 1 ? 'Sugerencia' : 'Sugerencias'} de tu junta` : null].filter(Boolean).join(' · ')
  return (
    <>
      <header className="flex flex-col gap-1.5">
        {editing === null ? (
          <div className="flex items-center gap-1.5">
            <h1 className="m-0 text-[26px] font-semibold tracking-tight">{meeting.title}</h1>
            <button
              type="button"
              aria-label="Cambiar el título"
              title="Cambiar el título"
              onClick={() => setEditing(meeting.title)}
              className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[#4A4A4F] hover:bg-[#EFEFEC] ${focus}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(ev) => {
              ev.preventDefault()
              void saveTitle()
            }}
          >
            <input
              autoFocus
              aria-label="Título de la Reunión"
              value={editing}
              onChange={(ev) => setEditing(ev.target.value)}
              onKeyDown={(ev) => ev.key === 'Escape' && setEditing(null)}
              className={`min-w-0 flex-1 rounded-lg border border-[#D4D4D0] bg-white px-3 py-1.5 text-[22px] font-semibold tracking-tight ${focus}`}
            />
            <button type="submit" className={`h-9 rounded-full bg-[#18181A] px-4 text-sm font-semibold text-white ${focus}`}>
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(null)} className={`h-9 rounded-full border border-[#D4D4D0] bg-white px-4 text-sm ${focus}`}>
              Cancelar
            </button>
          </form>
        )}
        {meta && <p className="m-0 text-[13px] text-[#5C5C63]">{meta}</p>}
        {titleError && (
          <p role="alert" className="m-0 text-sm text-[#8A1C12]">
            {titleError}
          </p>
        )}
      </header>
      {notice && (
        <p role="status" className="m-0 text-[15px] text-[#2F4A6B]">
          {notice}
        </p>
      )}
      {!notice && decisions?.reviewed && decisions.decisions.length > 0 && (
        <p className="m-0 text-[15px] text-[#4A4A4F]">Ya revisaste las Decisiones de esta Reunión.</p>
      )}
      {!notice && decisions && !decisions.reviewed && decisions.decisions.length > 0 && (
        <DecisionsReview
          meetingId={meeting.id}
          decisions={decisions.decisions}
          onDone={(saved) => {
            setDecisions({ ...decisions, reviewed: true })
            setNotice(
              saved === 0
                ? 'No se guardó nada de esta Reunión.'
                : saved === 1
                  ? '1 Decisión guardada en tu Memoria.'
                  : `${saved} Decisiones guardadas en tu Memoria.`,
            )
          }}
        />
      )}
      <section className="flex max-w-[880px] flex-col gap-3">
        <h2 className="m-0 text-[13px] font-semibold text-[#5C5C63]">Transcripción</h2>
        {meeting.transcripts.length === 0 ? (
          <p className="m-0 text-[15px] text-[#4A4A4F]">Esta Reunión no tiene transcripción guardada.</p>
        ) : (
          <ol aria-label="Transcripción" className="m-0 flex list-none flex-col gap-4 p-0">
            {interleave(meeting.transcripts, suggestions).map((item) => {
              if (item.kind === 'card') {
                const c = item.s
                return (
                  <li key={`s-${c.id}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4">
                    <span className="pt-3 font-mono text-xs text-[#6B6B72]">{typeof c.at === 'number' ? clock({ id: '', text: '', timestamp: '', audio_start_time: c.at }) : ''}</span>
                    <article aria-label={`Sugerencia de ${c.persona}`} className="flex max-w-[68ch] flex-col gap-1 rounded-[10px] border border-[#C9D4E2] bg-[#F5F7FA] px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-semibold text-[#2F4A6B]">{`${c.persona} · ${c.role_label}`}</span>
                        {c.useful !== null && (
                          <span className={`text-xs font-semibold ${c.useful ? 'text-[#2E6B3F]' : 'text-[#6B6B72]'}`}>{c.useful ? 'Marcaste: Útil' : 'Marcaste: No útil'}</span>
                        )}
                      </div>
                      <span className="text-[15px] font-semibold leading-snug">{c.text}</span>
                      {c.reason && <span className="text-[13px] text-[#4A4A4F]">{c.reason}</span>}
                    </article>
                  </li>
                )
              }
              const line = item.line
              const who = speakerLabel(line.speaker)
              return (
                <li key={line.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 text-base leading-relaxed">
                  <span className="pt-1 font-mono text-xs text-[#6B6B72]">{clock(line)}</span>
                  <span className="min-w-0">
                    {who && <span className="block text-[13px] font-semibold text-[#5C5C63]">{who}</span>}
                    {line.text}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </>
  )
}

export default function ReunionPage() {
  return (
    <Suspense fallback={<p className="m-0 text-[15px] text-[#5C5C63]">Cargando…</p>}>
      <Reunion />
    </Suspense>
  )
}

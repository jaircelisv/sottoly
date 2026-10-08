'use client'

// Detalle de una Reunión con su transcripción (PLAN.md, tarea 12). `?id=`: la exportación estática
// de Next no admite rutas dinámicas sin generarlas al compilar.
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { invoke } from '@tauri-apps/api/core'
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

interface DecisionsFile {
  reviewed: boolean
  decisions: CandidateDecision[]
}

function Reunion() {
  const id = useSearchParams()?.get('id') ?? ''
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [decisions, setDecisions] = useState<DecisionsFile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fetchMeeting = useCallback(async () => {
    setLoad({ state: 'loading' })
    try {
      const meeting = await invoke<MeetingDetails | null>('api_get_meeting', { meetingId: id })
      setLoad(meeting ? { state: 'ready', meeting } : { state: 'error' })
      // Las Decisiones del cierre (tarea 17): si no hay, o no se pueden leer, la Reunión se ve igual.
      setDecisions(await invoke<DecisionsFile | null>('sottoly_get_decisions', { meetingId: id }).catch(() => null))
    } catch {
      setLoad({ state: 'error' })
    }
  }, [id])

  useEffect(() => {
    if (id) void fetchMeeting()
  }, [id, fetchMeeting])

  if (load.state === 'loading') return <p className="m-0 text-[15px] text-[#5C5C63]">Cargando…</p>
  if (load.state === 'error') return <LoadError message="No se pudo abrir esta Reunión." onRetry={fetchMeeting} />

  const { meeting } = load
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">{meeting.title}</h1>
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
            {meeting.transcripts.map((line) => {
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

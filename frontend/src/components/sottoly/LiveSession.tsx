'use client'

// La sesión en vivo del panel (PLAN.md, tarea 23): la transcripción, las Sugerencias, el chat y la grabación viven
// en el layout de /sottoly y no en la pantalla «En vivo», así no se pierden al cambiar de pestaña, y lo que llega
// mientras ves Reuniones o Roles también queda. Todo llega por eventos del puente con el Motor (engine_bridge.rs).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { appDataDir } from '@tauri-apps/api/path'
import { useRouter } from 'next/navigation'
import { ECHO_LOOKBACK, isEcho } from '@/lib/sottoly/echo'

export interface RoleSummary {
  id: string
  role: string
  persona: string
  status: string
}

/** Lo que se guarda de cada frase con la Reunión (api::TranscriptSegment). */
export interface SavedLine {
  id: string
  text: string
  timestamp: string
  audio_start_time?: number
  audio_end_time?: number
  duration?: number
  speaker?: string
}

export interface Line {
  kind: 'line'
  key: string
  text: string
  who: 'Tú' | 'Contraparte' | null
  t: number | null
  /** Frase del Usuario que repite lo que dijo la Contraparte: se oculta y no se guarda. */
  echo: boolean
  saved: SavedLine
}

export interface Card {
  kind: 'card'
  key: string
  id: string
  role: string
  persona: string
  roleLabel: string
  text: string
  reason: string
  at: number | null
}

export interface ChatEntry {
  key: string
  from: 'user' | 'role'
  text: string
  roleId: string
  quote?: string
  at: number
  /** Respuesta del Rol: el id que manda el puente, y si sigue llegando. */
  id?: string
  pending?: boolean
  failed?: boolean
}

export type CardMode = 'open' | 'collapsed' | 'ignored'
export interface CardState {
  mode: CardMode
  why: boolean
  mark: boolean | null
}

function who(speaker?: string): Line['who'] {
  if (speaker === 'user' || speaker === 'mic') return 'Tú'
  if (speaker === 'counterpart' || speaker === 'system') return 'Contraparte'
  return null
}

/** Marca como eco la frase nueva o, si el eco llegó antes que el original, la del Usuario ya mostrada. */
function withEcho(feed: (Line | Card)[], line: Line): (Line | Card)[] {
  const recent = feed.filter((i): i is Line => i.kind === 'line' && !i.echo)
  if (line.who === 'Tú') {
    const others = recent.filter((l) => l.who === 'Contraparte').slice(-ECHO_LOOKBACK)
    return [...feed, { ...line, echo: others.some((l) => isEcho(line.text, l.text)) }]
  }
  if (line.who === 'Contraparte') {
    const mine = new Set(
      recent
        .filter((l) => l.who === 'Tú')
        .slice(-ECHO_LOOKBACK)
        .filter((l) => isEcho(l.text, line.text))
        .map((l) => l.key),
    )
    if (mine.size) return [...feed.map((i) => (mine.has(i.key) ? { ...(i as Line), echo: true } : i)), line]
  }
  return [...feed, line]
}

interface LiveSession {
  roles: RoleSummary[]
  roleId: string | null
  setRoleId: (id: string) => void
  feed: (Line | Card)[]
  chat: ChatEntry[]
  cards: Record<string, CardState>
  setCard: (id: string, patch: Partial<CardState>) => void
  markCard: (card: Card, useful: boolean) => void
  ignoreCard: (card: Card) => void
  draft: string
  setDraft: (text: string) => void
  replyTo: Card | null
  setReplyTo: (card: Card | null) => void
  notice: string | null
  send: (text?: string) => Promise<void>
  recording: boolean
  stopping: boolean
  recError: string | null
  /** Segundos desde que empezó la grabación, o null si no hay. */
  elapsed: number | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
}

const Ctx = createContext<LiveSession | null>(null)

export function useLiveSession(): LiveSession {
  const s = useContext(Ctx)
  if (!s) throw new Error('useLiveSession fuera de LiveSessionProvider')
  return s
}

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [roleId, setRoleId] = useState<string | null>(null)
  const [feed, setFeed] = useState<(Line | Card)[]>([])
  const feedRef = useRef<(Line | Card)[]>([])
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [cards, setCards] = useState<Record<string, CardState>>({})
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Card | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const recordingRef = useRef(false)
  const lastT = useRef<number | null>(null)
  const seq = useRef(0)
  const key = () => `k${++seq.current}`

  const updateFeed = (f: (prev: (Line | Card)[]) => (Line | Card)[]) => {
    setFeed((prev) => {
      const next = f(prev)
      feedRef.current = next
      return next
    })
  }

  useEffect(() => {
    invoke<RoleSummary[] | null>('sottoly_list_roles')
      .then((all) => {
        const active = (all ?? []).filter((r) => r.status === 'active')
        setRoles(active)
        setRoleId((cur) => cur ?? active[0]?.id ?? null)
      })
      .catch(() => setRoles([]))
    invoke<{ is_recording: boolean; recording_duration?: number | null } | null>('get_recording_state')
      .then((st) => {
        recordingRef.current = Boolean(st?.is_recording)
        setRecording(recordingRef.current)
        if (recordingRef.current) setStartedAt(Date.now() - (st?.recording_duration ?? 0) * 1000)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  useEffect(() => {
    const offs = [
      listen('recording-started', () => {
        recordingRef.current = true
        setRecording(true)
        setRecError(null)
        setStartedAt(Date.now())
        setNow(Date.now())
      }),
      // Al detenerse, la Reunión se guarda con lo que vio el panel, sin el eco, y se abre su detalle.
      listen<{ folder_path?: string; meeting_name?: string }>('recording-stopped', async ({ payload }) => {
        if (!recordingRef.current) return
        recordingRef.current = false
        setRecording(false)
        setStartedAt(null)
        const transcripts = feedRef.current.filter((i): i is Line => i.kind === 'line' && !i.echo).map((l) => l.saved)
        try {
          const res = await invoke<{ meeting_id: string }>('api_save_transcript', {
            meetingTitle: payload.meeting_name ?? 'Reunión',
            transcripts,
            folderPath: payload.folder_path ?? null,
          })
          updateFeed(() => [])
          setChat([])
          setCards({})
          setStopping(false)
          router.push(`/sottoly/reunion?id=${encodeURIComponent(res.meeting_id)}`)
        } catch {
          setStopping(false)
          setRecError('La grabación se detuvo, pero no se pudo guardar la Reunión.')
        }
      }),
      listen<{ text: string; is_partial: boolean; speaker?: string; audio_start_time?: number; audio_end_time?: number; duration?: number; timestamp?: string }>(
        'transcript-update',
        ({ payload }) => {
          if (payload.is_partial || !payload.text?.trim()) return
          const t = payload.audio_start_time ?? null
          if (t !== null) lastT.current = t
          const line: Line = {
            kind: 'line',
            key: key(),
            text: payload.text,
            who: who(payload.speaker),
            t,
            echo: false,
            saved: {
              id: `${Date.now()}-${seq.current}`,
              text: payload.text,
              timestamp: payload.timestamp ?? new Date().toISOString(),
              audio_start_time: payload.audio_start_time,
              audio_end_time: payload.audio_end_time,
              duration: payload.duration,
              speaker: payload.speaker,
            },
          }
          updateFeed((f) => withEcho(f, line))
        },
      ),
      listen<{ id: string; role: string; persona: string; role_label: string; text: string; reason: string }>('suggestion', ({ payload }) => {
        updateFeed((f) => [
          ...f,
          {
            kind: 'card',
            key: key(),
            id: payload.id,
            role: payload.role,
            persona: payload.persona,
            roleLabel: payload.role_label,
            text: payload.text,
            reason: payload.reason,
            at: lastT.current,
          },
        ])
      }),
      listen<{ id: string; text: string }>('chat_delta', ({ payload }) => {
        setChat((c) => c.map((e) => (e.id === payload.id ? { ...e, text: payload.text } : e)))
      }),
      listen<{ id: string; text: string }>('chat_reply', ({ payload }) => {
        setChat((c) => c.map((e) => (e.id === payload.id ? { ...e, text: payload.text, pending: false } : e)))
      }),
      listen<{ id: string }>('chat_error', ({ payload }) => {
        setChat((c) => c.map((e) => (e.id === payload.id ? { ...e, pending: false, failed: true } : e)))
      }),
    ]
    return () => {
      offs.forEach((p) => p.then((off) => off()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCard = useCallback(
    (id: string, patch: Partial<CardState>) =>
      setCards((c) => ({ ...c, [id]: { ...(c[id] ?? { mode: 'open', why: false, mark: null }), ...patch } })),
    [],
  )
  // La misma marca que manda el overlay: así la junta aprende qué te sirve.
  const markCard = (card: Card, useful: boolean) => {
    setCard(card.id, { mark: useful })
    void emit('suggestion-feedback', { id: card.id, role: card.role, useful })
  }
  const ignoreCard = (card: Card) => {
    setCard(card.id, { mode: 'ignored' })
    if ((cards[card.id]?.mark ?? null) === null) void emit('suggestion-feedback', { id: card.id, role: card.role, useful: false })
  }

  const startRecording = async () => {
    setRecError(null)
    try {
      const d = new Date()
      const name = `Reunión ${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
      await invoke('start_recording_with_devices_and_meeting', { micDeviceName: null, systemDeviceName: null, meetingName: name })
    } catch (e) {
      setRecError(`No se pudo iniciar la grabación${typeof e === 'string' && e ? `: ${e}` : '.'}`)
    }
  }

  const stopRecording = async () => {
    setStopping(true)
    try {
      const dir = await appDataDir().catch(() => '')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await invoke('stop_recording', { args: { save_path: `${dir}/recording-${stamp}.wav` } })
    } catch {
      setStopping(false)
      setRecError('No se pudo detener la grabación.')
    }
  }

  const send = async (preset?: string) => {
    const text = (preset ?? draft).trim()
    const current = roles.find((r) => r.id === roleId)
    if (!text || !current) return
    setNotice(null)
    const quote = replyTo && replyTo.role === current.id ? replyTo : null
    try {
      const id = await invoke<string>('sottoly_chat_send', { role: current.id, text, replyTo: quote?.id ?? null })
      const at = Date.now()
      setChat((c) => [
        ...c,
        { key: key(), from: 'user', text, roleId: current.id, quote: quote?.text, at },
        { key: key(), from: 'role', text: '', roleId: current.id, id, pending: true, at },
      ])
      if (preset === undefined) setDraft('')
      setReplyTo(null)
    } catch {
      setNotice('No hay una Reunión en curso. Inicia la grabación para hablar con tu junta.')
    }
  }

  const value: LiveSession = {
    roles,
    roleId,
    setRoleId,
    feed,
    chat,
    cards,
    setCard,
    markCard,
    ignoreCard,
    draft,
    setDraft,
    replyTo,
    setReplyTo,
    notice,
    send,
    recording,
    stopping,
    recError,
    elapsed: recording && startedAt !== null ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null,
    startRecording,
    stopRecording,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

'use client'

// En vivo (PLAN.md, tarea 13; pantalla 1 del diseño aprobado): durante la Reunión, la transcripción, las
// Sugerencias y el chat con la junta. Todo llega por eventos del puente con el Motor (engine_bridge.rs).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { appDataDir } from '@tauri-apps/api/path'
import { useRouter } from 'next/navigation'

interface RoleSummary {
  id: string
  role: string
  persona: string
  status: string
}

interface Line {
  kind: 'line'
  key: string
  text: string
  who: string | null
  t: number | null
}

interface Card {
  kind: 'card'
  key: string
  id: string
  role: string
  persona: string
  roleLabel: string
  text: string
  reason: string
}

/** Lo que se guarda de cada frase con la Reunión (api::TranscriptSegment). */
interface SavedLine {
  id: string
  text: string
  timestamp: string
  audio_start_time?: number
  audio_end_time?: number
  duration?: number
  speaker?: string
}

interface ChatEntry {
  key: string
  from: 'user' | 'role'
  text: string
  roleId: string
  quote?: string
  /** Respuesta del Rol: el id que manda el puente, y si sigue llegando. */
  id?: string
  pending?: boolean
  failed?: boolean
}

function who(speaker?: string): string | null {
  if (speaker === 'user' || speaker === 'mic') return 'Tú'
  if (speaker === 'counterpart' || speaker === 'system') return 'Contraparte'
  return null
}

function clock(t: number | null): string {
  if (t === null) return ''
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const pill = 'h-9 rounded-full border px-3.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]'

export default function EnVivoPage() {
  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [roleId, setRoleId] = useState<string | null>(null)
  const [feed, setFeed] = useState<(Line | Card)[]>([])
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Card | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Grabación desde el panel (tarea 21): estado, error al iniciar y la transcripción que se guarda al detener.
  const router = useRouter()
  const [recording, setRecording] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const recordingRef = useRef(false)
  const transcriptRef = useRef<SavedLine[]>([])
  // En vivo v2 (tarea 22): cada tarjeta se contrae o se ignora, el motivo va detrás de «Por qué», Útil / No útil,
  // filtro «Solo Sugerencias» y scroll propio con «Ir a lo último».
  const [cards, setCards] = useState<Record<string, { mode: 'open' | 'collapsed' | 'ignored'; why: boolean; mark: boolean | null }>>({})
  const [onlyCards, setOnlyCards] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)
  const seq = useRef(0)
  const key = () => `k${++seq.current}`

  useEffect(() => {
    invoke<RoleSummary[] | null>('sottoly_list_roles')
      .then((all) => {
        const active = (all ?? []).filter((r) => r.status === 'active')
        setRoles(active)
        setRoleId((cur) => cur ?? active[0]?.id ?? null)
      })
      .catch(() => setRoles([]))
  }, [])

  useEffect(() => {
    invoke<{ is_recording: boolean } | null>('get_recording_state')
      .then((st) => {
        recordingRef.current = Boolean(st?.is_recording)
        setRecording(recordingRef.current)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const offs = [
      listen('recording-started', () => {
        recordingRef.current = true
        setRecording(true)
        setRecError(null)
      }),
      // Al detenerse, la Reunión se guarda con lo que vio el panel (la pantalla de Meetily no está montada).
      listen<{ folder_path?: string; meeting_name?: string }>('recording-stopped', async ({ payload }) => {
        if (!recordingRef.current) return
        recordingRef.current = false
        setRecording(false)
        try {
          const res = await invoke<{ meeting_id: string }>('api_save_transcript', {
            meetingTitle: payload.meeting_name ?? 'Reunión',
            transcripts: transcriptRef.current,
            folderPath: payload.folder_path ?? null,
          })
          transcriptRef.current = []
          router.push(`/sottoly/reunion?id=${encodeURIComponent(res.meeting_id)}`)
        } catch {
          setStopping(false)
          setRecError('La grabación se detuvo, pero no se pudo guardar la Reunión.')
        }
      }),
      listen<{ text: string; is_partial: boolean; speaker?: string; audio_start_time?: number; audio_end_time?: number; duration?: number; timestamp?: string }>('transcript-update', ({ payload }) => {
        if (payload.is_partial || !payload.text?.trim()) return
        transcriptRef.current.push({
          id: `${Date.now()}-${transcriptRef.current.length}`,
          text: payload.text,
          timestamp: payload.timestamp ?? new Date().toISOString(),
          audio_start_time: payload.audio_start_time,
          audio_end_time: payload.audio_end_time,
          duration: payload.duration,
          speaker: payload.speaker,
        })
        setFeed((f) => [...f, { kind: 'line', key: key(), text: payload.text, who: who(payload.speaker), t: payload.audio_start_time ?? null }])
      }),
      listen<{ id: string; role: string; persona: string; role_label: string; text: string; reason: string }>('suggestion', ({ payload }) => {
        setFeed((f) => [
          ...f,
          { kind: 'card', key: key(), id: payload.id, role: payload.role, persona: payload.persona, roleLabel: payload.role_label, text: payload.text, reason: payload.reason },
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
  }, [])

  const cardOf = (id: string) => cards[id] ?? { mode: 'open' as const, why: false, mark: null }
  const setCard = (id: string, patch: Partial<{ mode: 'open' | 'collapsed' | 'ignored'; why: boolean; mark: boolean | null }>) =>
    setCards((c) => ({ ...c, [id]: { ...(c[id] ?? { mode: 'open', why: false, mark: null }), ...patch } }))
  // La misma marca que manda el overlay: así la junta aprende qué te sirve.
  const markCard = (card: Card, useful: boolean) => {
    setCard(card.id, { mark: useful })
    void emit('suggestion-feedback', { id: card.id, role: card.role, useful })
  }
  const ignoreCard = (card: Card) => {
    setCard(card.id, { mode: 'ignored' })
    if (cardOf(card.id).mark === null) void emit('suggestion-feedback', { id: card.id, role: card.role, useful: false })
  }

  // Si estás abajo, lo nuevo te sigue; si subiste a leer, no te mueve y aparece «Ir a lo último».
  useEffect(() => {
    const el = listRef.current
    if (el && atBottom) el.scrollTop = el.scrollHeight
  }, [feed, onlyCards, atBottom])
  const onScroll = () => {
    const el = listRef.current
    if (el) setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }
  const goBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    setAtBottom(true)
  }

  const allCards = feed.filter((i): i is Card => i.kind === 'card')
  const ignoredCount = allCards.filter((c) => cardOf(c.id).mode === 'ignored').length
  const counter = `${allCards.length} ${allCards.length === 1 ? 'Sugerencia' : 'Sugerencias'}${ignoredCount ? ` · ${ignoredCount} ${ignoredCount === 1 ? 'ignorada' : 'ignoradas'}` : ''}`
  const visible = onlyCards ? allCards : feed

  const startRecording = async () => {
    setRecError(null)
    try {
      const now = new Date()
      const name = `Reunión ${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`
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

  const current = useMemo(() => roles.find((r) => r.id === roleId) ?? null, [roles, roleId])
  const persona = (id: string) => roles.find((r) => r.id === id)?.persona ?? 'El Rol'

  const answerCard = (card: Card) => {
    if (roles.some((r) => r.id === card.role)) setRoleId(card.role)
    setReplyTo(card)
  }

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || !current) return
    setNotice(null)
    const quote = replyTo && replyTo.role === current.id ? replyTo : null
    try {
      const id = await invoke<string>('sottoly_chat_send', { role: current.id, text, replyTo: quote?.id ?? null })
      setChat((c) => [
        ...c,
        { key: key(), from: 'user', text, roleId: current.id, quote: quote?.text },
        { key: key(), from: 'role', text: '', roleId: current.id, id, pending: true },
      ])
      setDraft('')
      setReplyTo(null)
    } catch {
      setNotice('No hay una Reunión en curso. Inicia la grabación para hablar con tu junta.')
    }
  }, [draft, current, replyTo])

  return (
    <>
      <header className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <h1 className="m-0 text-[26px] font-semibold tracking-tight">En vivo</h1>
          <p className="m-0 text-sm text-[#5C5C63]">Lo que se dice en la Reunión, lo que sugiere tu junta y tu conversación con ella.</p>
        </div>
        {recording ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-[#5C5C63]">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#B42318]" />
              <span>Grabando</span>
            </span>
            <button
              type="button"
              onClick={stopRecording}
              disabled={stopping}
              className="h-11 rounded-full border border-[#D4D4D0] bg-white px-[18px] text-[15px] font-semibold text-[#18181A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B] disabled:opacity-50"
            >
              {stopping ? 'Guardando la Reunión…' : 'Detener y revisar Decisiones'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="h-11 rounded-full border border-[#18181A] bg-[#18181A] px-5 text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B]"
          >
            Iniciar grabación
          </button>
        )}
      </header>
      {recError && (
        <p role="alert" className="m-0 rounded-lg bg-[#FBF3F2] px-3 py-2 text-sm text-[#5A1A12]">
          {recError}
        </p>
      )}

      <div className="flex min-h-[560px] flex-wrap gap-6">
        <section aria-label="Transcripción" className="flex min-w-0 flex-[999_1_420px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#EDEDEA] pb-3">
            <div role="group" aria-label="Qué ver" className="inline-flex rounded-full bg-[#EFEFEC] p-[3px]">
              {[
                { label: 'Todo', on: !onlyCards, set: false },
                { label: 'Solo Sugerencias', on: onlyCards, set: true },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  aria-pressed={b.on}
                  onClick={() => setOnlyCards(b.set)}
                  className={`h-[30px] rounded-full px-3.5 text-[13px] font-semibold text-[#18181A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B] ${b.on ? 'bg-white shadow-sm' : 'bg-transparent'}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <span className="text-[13px] text-[#5C5C63]">{counter}</span>
          </div>
          <div className="relative min-h-0">
            {feed.length === 0 && <p className="m-0 pt-4 text-[15px] text-[#4A4A4F]">Cuando empiece la grabación, aquí aparece lo que se dice.</p>}
            <ol
              ref={listRef}
              onScroll={onScroll}
              aria-label="Transcripción en vivo"
              className="m-0 flex h-[calc(100vh-260px)] min-h-[320px] list-none flex-col gap-3 overflow-y-auto p-0 pb-16 pt-4"
            >
              {visible.map((item) => {
                if (item.kind === 'line')
                  return (
                    <li key={item.key} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 text-[15px] leading-normal">
                      <span className="pt-[3px] font-mono text-[11px] text-[#6B6B72]">{clock(item.t)}</span>
                      <span className="min-w-0">
                        {item.who && <span className="mr-1.5 text-xs font-semibold text-[#5C5C63]">{item.who}</span>}
                        {item.text}
                      </span>
                    </li>
                  )
                const st = cardOf(item.id)
                if (st.mode === 'ignored')
                  return (
                    <li key={item.key} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3">
                      <span />
                      <span className="flex items-center gap-2 text-[13px] text-[#6B6B72]">
                        {`Ignoraste una Sugerencia de ${item.persona}.`}
                        <button type="button" onClick={() => setCard(item.id, { mode: 'open' })} className="p-1 text-[13px] font-semibold text-[#2F4A6B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]">
                          Deshacer
                        </button>
                      </span>
                    </li>
                  )
                if (st.mode === 'collapsed')
                  return (
                    <li key={item.key} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3">
                      <span />
                      <button
                        type="button"
                        aria-label={`Abrir la Sugerencia de ${item.persona}`}
                        onClick={() => setCard(item.id, { mode: 'open' })}
                        className="flex h-[34px] min-w-0 items-center gap-2 rounded-lg border border-[#DCE3EC] bg-[#F8F9FB] pl-3 pr-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]"
                      >
                        <span className="flex-none text-xs font-semibold text-[#2F4A6B]">{item.persona}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{item.text}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A4A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                    </li>
                  )
                const small = 'h-7 rounded-md px-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]'
                const icon = 'flex h-7 w-7 items-center justify-center rounded-md text-[#4A4A4F] hover:bg-[#E9EEF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]'
                return (
                  <li key={item.key} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3">
                    <span />
                    <article aria-label={`Sugerencia de ${item.persona}`} className="flex flex-col gap-1.5 rounded-[10px] border border-[#C9D4E2] bg-[#F5F7FA] py-2.5 pl-3.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-semibold text-[#2F4A6B]">{`${item.persona} · ${item.roleLabel}`}</span>
                        <button type="button" aria-label="Contraer" onClick={() => setCard(item.id, { mode: 'collapsed' })} className={icon}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                        </button>
                        <button type="button" aria-label="Ignorar" onClick={() => ignoreCard(item)} className={icon}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                        </button>
                      </div>
                      <span className="text-base font-semibold leading-snug">{item.text}</span>
                      {st.why && <span className="text-[13px] text-[#4A4A4F]">{item.reason}</span>}
                      <div className="-ml-2 flex flex-wrap items-center gap-1">
                        <button type="button" aria-label={`Responder a ${item.persona}`} onClick={() => answerCard(item)} className={`${small} font-semibold text-[#2F4A6B]`}>
                          Responder
                        </button>
                        <button type="button" onClick={() => setCard(item.id, { why: !st.why })} className={`${small} text-[#4A4A4F]`}>
                          {st.why ? 'Ocultar por qué' : 'Por qué'}
                        </button>
                        <span className="flex-1" />
                        <button type="button" aria-pressed={st.mark === true} onClick={() => markCard(item, true)} className={`${small} ${st.mark === true ? 'bg-[#E3EAF3] font-semibold text-[#2F4A6B]' : 'text-[#4A4A4F]'}`}>
                          Útil
                        </button>
                        <button type="button" aria-pressed={st.mark === false} onClick={() => markCard(item, false)} className={`${small} ${st.mark === false ? 'bg-[#E3EAF3] font-semibold text-[#2F4A6B]' : 'text-[#4A4A4F]'}`}>
                          No útil
                        </button>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ol>
            {!atBottom && (
              <button
                type="button"
                onClick={goBottom}
                className="absolute bottom-4 left-1/2 h-[34px] -translate-x-1/2 rounded-full border border-[#D4D4D0] bg-white px-3.5 text-[13px] font-semibold text-[#18181A] shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]"
              >
                Ir a lo último ↓
              </button>
            )}
          </div>
        </section>

        <aside aria-label="Chat con la junta" className="box-border flex h-[calc(100vh-200px)] min-h-[380px] max-w-[420px] flex-[1_1_360px] flex-col rounded-xl border border-[#E4E4E1] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#E4E4E1] px-[22px] pb-3.5 pt-5">
            <h2 className="m-0 text-base font-semibold">Conversa con tu junta</h2>
            <div role="group" aria-label="Con quién hablas" className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const on = r.id === roleId
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRoleId(r.id)}
                    className={`${pill} ${on ? 'border-[#2F4A6B] bg-[#2F4A6B] font-semibold text-white' : 'border-[#D4D4D0] bg-white text-[#18181A]'}`}
                  >
                    {`${r.persona} · ${r.role}`}
                  </button>
                )
              })}
            </div>
          </div>

          <ol aria-label="Conversación" className="m-0 flex min-h-0 flex-1 list-none flex-col gap-4 overflow-y-auto px-[22px] py-5 text-[15px] leading-normal">
            {chat.map((e) =>
              e.from === 'user' ? (
                <li key={e.key} className="flex max-w-[88%] flex-col gap-1.5 self-end">
                  {e.quote && <span className="border-l-2 border-[#C9D4E2] pl-2.5 text-[13px] text-[#5C5C63]">{`Sobre: «${e.quote}»`}</span>}
                  <span className="rounded-xl bg-[#F2F2F0] px-3.5 py-2.5">{e.text}</span>
                </li>
              ) : (
                <li key={e.key} className="flex max-w-[92%] flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-[#2F4A6B]">{persona(e.roleId)}</span>
                  {e.text && <span>{e.text}</span>}
                  {e.pending && <span className="text-xs text-[#6B6B72]">Escribiendo…</span>}
                  {e.failed && <span className="text-sm text-[#8A1C12]">{`${persona(e.roleId)} no pudo responder. Inténtalo de nuevo.`}</span>}
                </li>
              ),
            )}
          </ol>

          <form
            className="flex flex-col gap-2 border-t border-[#E4E4E1] px-[22px] pb-[22px] pt-3.5"
            onSubmit={(ev) => {
              ev.preventDefault()
              void send()
            }}
          >
            {notice && (
              <p role="alert" className="m-0 rounded-lg bg-[#FBF3F2] px-3 py-2 text-sm text-[#5A1A12]">
                {notice}
              </p>
            )}
            {replyTo && (
              <div className="flex items-start justify-between gap-2 border-l-2 border-[#C9D4E2] pl-2.5 text-[13px] text-[#5C5C63]">
                <span>{`Sobre: «${replyTo.text}»`}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-[13px] text-[#2F4A6B] underline">
                  Quitar
                </button>
              </div>
            )}
            <label htmlFor="pregunta" className="text-[13px] font-semibold text-[#4A4A4F]">
              {current ? `Pregúntale a ${current.persona} por lo que se está diciendo` : 'Activa un Rol para conversar'}
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="pregunta"
                rows={2}
                value={draft}
                disabled={!current}
                onChange={(ev) => setDraft(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault()
                    void send()
                  }
                }}
                placeholder="Ej.: ¿me conviene aceptar el anticipo?"
                className="min-w-0 flex-1 resize-none rounded-[10px] border border-[#D4D4D0] px-3 py-2.5 text-[15px] text-[#18181A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]"
              />
              <button
                type="submit"
                aria-label="Enviar"
                disabled={!current}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#18181A] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B] disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <span className="text-xs text-[#6B6B72]">Enter envía · Shift+Enter, otra línea</span>
          </form>
        </aside>
      </div>
    </>
  )
}

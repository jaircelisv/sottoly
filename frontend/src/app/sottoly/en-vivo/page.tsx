'use client'

// En vivo (PLAN.md, tarea 13; pantalla 1 del diseño aprobado): durante la Reunión, la transcripción, las
// Sugerencias y el chat con la junta. Todo llega por eventos del puente con el Motor (engine_bridge.rs).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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
    const offs = [
      listen<{ text: string; is_partial: boolean; speaker?: string; audio_start_time?: number }>('transcript-update', ({ payload }) => {
        if (payload.is_partial || !payload.text?.trim()) return
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
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">En vivo</h1>
        <p className="m-0 text-sm text-[#5C5C63]">Lo que se dice en la Reunión, lo que sugiere tu junta y tu conversación con ella.</p>
      </header>

      <div className="flex min-h-[560px] flex-wrap gap-6">
        <section aria-label="Transcripción" className="flex min-w-0 flex-[999_1_420px] flex-col gap-4">
          {feed.length === 0 && <p className="m-0 text-[15px] text-[#4A4A4F]">Cuando empiece la grabación, aquí aparece lo que se dice.</p>}
          <ol aria-label="Transcripción en vivo" className="m-0 flex list-none flex-col gap-4 p-0">
            {feed.map((item) =>
              item.kind === 'line' ? (
                <li key={item.key} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 text-base leading-relaxed">
                  <span className="pt-1 font-mono text-xs text-[#6B6B72]">{clock(item.t)}</span>
                  <span className="min-w-0">
                    {item.who && <span className="block text-[13px] font-semibold text-[#5C5C63]">{item.who}</span>}
                    {item.text}
                  </span>
                </li>
              ) : (
                <li key={item.key} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4">
                  <span />
                  <article aria-label={`Sugerencia de ${item.persona}`} className="flex flex-col gap-2 rounded-[10px] border border-[#C9D4E2] bg-[#F2F5F9] px-[18px] py-4">
                    <span className="text-[13px] font-semibold text-[#2F4A6B]">{`${item.persona} · ${item.roleLabel}`}</span>
                    <span className="text-[17px] font-semibold leading-snug">{item.text}</span>
                    <span className="text-sm text-[#4A4A4F]">{item.reason}</span>
                    <span className="flex flex-wrap gap-2 pt-1">
                      <button type="button" onClick={() => answerCard(item)} className={`${pill} border-[#2F4A6B] bg-[#2F4A6B] font-semibold text-white`}>
                        {`Responder a ${item.persona}`}
                      </button>
                    </span>
                  </article>
                </li>
              ),
            )}
          </ol>
        </section>

        <aside aria-label="Chat con la junta" className="box-border flex max-w-[420px] flex-[1_1_360px] flex-col rounded-xl border border-[#E4E4E1] bg-white">
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

          <ol aria-label="Conversación" className="m-0 flex flex-1 list-none flex-col gap-4 px-[22px] py-5 text-[15px] leading-normal">
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

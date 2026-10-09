'use client'

// El chat con la junta (PLAN.md, tareas 13, 23, 24 y 29): el mismo en «En vivo» y en el detalle de una Reunión
// terminada. Quien lo usa le da los Roles, la conversación y cómo enviar; aquí se dibuja: «Todos» primero, un
// avatar y un tono por Rol, las respuestas con formato, preguntas de ejemplo y scroll pegado a lo último.
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

/** El «Rol» que es toda la junta: una pregunta a cada Rol activo (tarea 24). */
export const ALL_ROLES = 'all'

export interface ChatRole {
  id: string
  role: string
  persona: string
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

// Un tono por Rol, en el orden de la junta: el avatar y el nombre dicen quién habla sin leer.
export const TONES = [
  { solid: '#2F4A6B', soft: '#F5F7FA' },
  { solid: '#5B4A6B', soft: '#F6F4F8' },
  { solid: '#3F5B4A', soft: '#F4F7F5' },
  { solid: '#6B4F3A', soft: '#F8F5F2' },
]

export const toneOf = (roles: ChatRole[], roleId: string) => TONES[Math.max(0, roles.findIndex((r) => r.id === roleId)) % TONES.length]

export const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B]'

function hour(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 5)
}

export function Avatar({ name, tone, size = 26 }: { name: string; tone: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: tone, fontSize: size * 0.45 }}
      className="inline-flex flex-none items-center justify-center rounded-full font-bold text-white"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Respuesta del Rol con su formato (negritas, listas); sin enlaces, imágenes ni títulos. */
function Formatted({ text }: { text: string }) {
  return (
    <ReactMarkdown
      allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'code']}
      unwrapDisallowed
      components={{
        p: ({ children }) => <p className="m-0 [&+*]:mt-1.5">{children}</p>,
        ul: ({ children }) => <ul className="m-0 mt-1.5 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="m-0 mt-1.5 list-decimal pl-5">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

/**
 * Mantiene una lista con scroll propio pegada al final mientras `active`: baja cuando cambian `deps` y cuando
 * cambia el tamaño de cualquiera de sus elementos (ResizeObserver), así nada la deja a medio camino.
 */
export function useStickToBottom(ref: React.RefObject<HTMLElement>, active: boolean, deps: unknown[]) {
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const stick = () => {
      if (activeRef.current) el.scrollTop = el.scrollHeight
    }
    const sizes = new ResizeObserver(stick)
    const watch = () => Array.from(el.children).forEach((child) => sizes.observe(child))
    watch()
    const added = new MutationObserver(() => {
      watch()
      stick()
    })
    added.observe(el, { childList: true })
    return () => {
      sizes.disconnect()
      added.disconnect()
    }
  }, [ref])
  useEffect(() => {
    const el = ref.current
    if (el && active) el.scrollTop = el.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps])
}

export function JuntaChat({
  roles,
  roleId,
  setRoleId,
  chat,
  draft,
  setDraft,
  notice,
  replyTo,
  onClearReply,
  send,
  examples,
  emptyText,
  className = '',
}: {
  roles: ChatRole[]
  roleId: string | null
  setRoleId: (id: string) => void
  chat: ChatEntry[]
  draft: string
  setDraft: (text: string) => void
  notice: string | null
  replyTo?: { text: string } | null
  onClearReply?: () => void
  send: (preset?: string) => void
  examples: string[]
  /** Qué decir con el chat vacío, según a quién le preguntas. */
  emptyText: (current: { all: boolean; persona: string }) => string
  className?: string
}) {
  const [atBottom, setAtBottom] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)
  useStickToBottom(listRef, atBottom, [chat])

  const tone = (id: string) => toneOf(roles, id)
  const persona = (id: string) => roles.find((r) => r.id === id)?.persona ?? 'El Rol'
  // A quién le preguntas: un Rol, o «Todos» (tarea 24), que es toda la junta activa.
  const current = useMemo(() => {
    if (roleId === ALL_ROLES) return roles.length ? { all: true, persona: 'toda tu junta' } : null
    const r = roles.find((x) => x.id === roleId)
    return r ? { all: false, persona: r.persona } : null
  }, [roles, roleId])
  const submit = (preset?: string) => {
    setAtBottom(true)
    send(preset)
  }

  return (
    <aside aria-label="Chat con la junta" className={`box-border flex flex-col rounded-xl border border-[#E4E4E1] bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EDEDEA] px-4 py-3">
        <h2 className="m-0 flex-1 text-sm font-semibold">Tu junta</h2>
        <div role="group" aria-label="Con quién hablas" className="inline-flex flex-wrap gap-0.5 rounded-full bg-[#EFEFEC] p-[3px]">
          {roles.length > 1 && (
            <button
              type="button"
              aria-pressed={roleId === ALL_ROLES}
              aria-label="Todos · toda tu junta"
              title="Pregúntale a toda tu junta a la vez"
              onClick={() => setRoleId(ALL_ROLES)}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] transition-colors ${focus} ${roleId === ALL_ROLES ? 'bg-white font-semibold text-[#18181A] shadow-sm' : 'bg-transparent text-[#4A4A4F]'}`}
            >
              <span aria-hidden="true" className="flex -space-x-2">
                {roles.slice(0, 3).map((r) => (
                  <span key={r.id} className="rounded-full ring-2 ring-[#EFEFEC]">
                    <Avatar name={r.persona} tone={tone(r.id).solid} size={18} />
                  </span>
                ))}
              </span>
              Todos
            </button>
          )}
          {roles.map((r) => {
            const on = r.id === roleId
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                aria-label={`${r.persona} · ${r.role}`}
                title={r.role}
                onClick={() => setRoleId(r.id)}
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] transition-colors ${focus} ${on ? 'bg-white font-semibold text-[#18181A] shadow-sm' : 'bg-transparent text-[#4A4A4F]'}`}
              >
                <Avatar name={r.persona} tone={tone(r.id).solid} size={22} />
                {r.persona}
              </button>
            )
          })}
        </div>
      </div>

      <ol
        ref={listRef}
        onScroll={() => {
          const el = listRef.current
          if (el) setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
        }}
        aria-label="Conversación"
        className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3.5 overflow-y-auto p-4 text-sm leading-normal"
      >
        {chat.length === 0 && (
          <li className="m-auto max-w-[280px] text-center text-[13px] text-[#5C5C63]">
            {current ? emptyText(current) : 'Activa un Rol en «Roles» para conversar con tu junta.'}
          </li>
        )}
        {chat.map((e) => {
          if (e.from === 'user')
            return (
              <li key={e.key} className="sottoly-in flex max-w-[85%] flex-col items-end gap-1 self-end">
                {e.quote && <span className="border-r-2 border-[#C9D4E2] pr-2 text-right text-xs text-[#5C5C63]">{`Sobre: «${e.quote}»`}</span>}
                <span className="rounded-[14px_14px_4px_14px] bg-[#18181A] px-3 py-2 text-white">{e.text}</span>
              </li>
            )
          const tn = tone(e.roleId)
          const name = persona(e.roleId)
          return (
            <li key={e.key} className="sottoly-in grid grid-cols-[26px_minmax(0,1fr)] gap-x-2">
              <Avatar name={name} tone={tn.solid} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-[#5C5C63]">
                  <span className="font-semibold" style={{ color: tn.solid }}>
                    {name}
                  </span>
                  {e.pending ? ' · Escribiendo…' : ` · ${hour(e.at)}`}
                </span>
                {(e.text || e.pending) && (
                  <div className="w-fit max-w-full rounded-[4px_14px_14px_14px] px-3 py-2" style={{ background: tn.soft }}>
                    {e.text ? (
                      <Formatted text={e.text} />
                    ) : (
                      <span className="inline-flex gap-1 py-1" aria-hidden="true">
                        {[0, 0.2, 0.4].map((d) => (
                          <span key={d} className="sottoly-dot h-1.5 w-1.5 rounded-full" style={{ background: tn.solid, animationDelay: `${d}s` }} />
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {e.failed && <span className="text-[13px] text-[#8A1C12]">{`${name} no pudo responder. Inténtalo de nuevo.`}</span>}
              </div>
            </li>
          )
        })}
      </ol>

      <form
        className="flex flex-col gap-2 border-t border-[#EDEDEA] px-4 pb-3.5 pt-2.5"
        onSubmit={(ev) => {
          ev.preventDefault()
          submit()
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
            <button type="button" onClick={onClearReply} className={`text-[13px] text-[#2F4A6B] underline ${focus}`}>
              Quitar
            </button>
          </div>
        )}
        {current && (
          <div className="flex flex-wrap gap-1.5">
            {examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                className={`h-7 whitespace-nowrap rounded-full border border-[#DCE3EC] bg-[#F8F9FB] px-2.5 text-xs text-[#2F4A6B] hover:bg-[#EEF2F7] ${focus}`}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <label htmlFor="pregunta" className="sr-only">
          {current ? `Pregúntale a ${current.persona}` : 'Activa un Rol para conversar'}
        </label>
        <div className="flex items-end gap-1.5 rounded-[14px] border border-[#D4D4D0] bg-white py-1.5 pl-3 pr-1.5 focus-within:border-[#2F4A6B]">
          <textarea
            id="pregunta"
            rows={1}
            value={draft}
            disabled={!current}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault()
                submit()
              }
            }}
            placeholder={current ? `Pregúntale a ${current.persona}…` : 'Activa un Rol para conversar'}
            className="max-h-32 min-w-0 flex-1 resize-none border-none bg-transparent py-1.5 text-sm text-[#18181A] outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            aria-label="Enviar"
            title="Enter envía · Shift+Enter, otra línea"
            disabled={!current}
            className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[#18181A] text-white disabled:opacity-40 ${focus}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
    </aside>
  )
}

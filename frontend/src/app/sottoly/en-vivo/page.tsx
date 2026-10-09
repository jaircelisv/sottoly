'use client'

// En vivo (PLAN.md, tareas 13, 21, 22 y 23; diseño aprobado, canvas «1c»): durante la Reunión, la transcripción
// en bloques por hablante, las Sugerencias en su momento y el chat con la junta. El estado vive en
// LiveSessionProvider (layout de /sottoly): esta pantalla solo lo muestra.
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ALL_ROLES, useLiveSession, type Card, type Line } from '@/components/sottoly/LiveSession'

function clock(t: number | null): string {
  if (t === null) return ''
  const s = Math.max(0, Math.floor(t))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function hour(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 5)
}

// Un tono por Rol, en el orden de la junta: el avatar y el nombre dicen quién habla sin leer.
const TONES = [
  { solid: '#2F4A6B', soft: '#F5F7FA' },
  { solid: '#5B4A6B', soft: '#F6F4F8' },
  { solid: '#3F5B4A', soft: '#F4F7F5' },
  { solid: '#6B4F3A', soft: '#F8F5F2' },
]

// Preguntas de ejemplo: lo que más se pregunta en medio de una Reunión.
const EXAMPLES = ['¿Qué no debería aceptar?', 'Resume lo último', '¿Qué preguntar ahora?']

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B]'

function Avatar({ name, tone, size = 26 }: { name: string; tone: string; size?: number }) {
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
function useStickToBottom(ref: React.RefObject<HTMLElement>, active: boolean, deps: unknown[]) {
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

export default function EnVivoPage() {
  const s = useLiveSession()
  const [onlyCards, setOnlyCards] = useState(false)
  const [showEcho, setShowEcho] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [chatAtBottom, setChatAtBottom] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)
  const chatRef = useRef<HTMLOListElement>(null)

  const tone = (roleId: string) => TONES[Math.max(0, s.roles.findIndex((r) => r.id === roleId)) % TONES.length]
  const persona = (id: string) => s.roles.find((r) => r.id === id)?.persona ?? 'El Rol'
  // A quién le preguntas: un Rol, o «Todos» (tarea 24), que es toda la junta activa.
  const current = useMemo(() => {
    if (s.roleId === ALL_ROLES) return s.roles.length ? { all: true, persona: 'toda tu junta' } : null
    const r = s.roles.find((x) => x.id === s.roleId)
    return r ? { all: false, persona: r.persona } : null
  }, [s.roles, s.roleId])
  const cardOf = (id: string) => s.cards[id] ?? { mode: 'open' as const, why: false, mark: null }

  const allCards = s.feed.filter((i): i is Card => i.kind === 'card')
  const ignoredCount = allCards.filter((c) => cardOf(c.id).mode === 'ignored').length
  const echoes = s.feed.filter((i): i is Line => i.kind === 'line' && i.echo).length
  const counter = `${allCards.length} ${allCards.length === 1 ? 'Sugerencia' : 'Sugerencias'}${ignoredCount ? ` · ${ignoredCount} ${ignoredCount === 1 ? 'ignorada' : 'ignoradas'}` : ''}`
  const visible = (onlyCards ? allCards : s.feed).filter((i) => i.kind === 'card' || !i.echo || showEcho)

  // Si estás abajo, lo nuevo te sigue; si subiste a leer, no te mueve y aparece «Ir a lo último».
  // Si estás abajo, lo nuevo te sigue: también cuando una frase crece después de dibujarse (llega la tipografía,
  // cambia el ancho), no solo cuando llega una nueva.
  useStickToBottom(listRef, atBottom, [s.feed, onlyCards, showEcho])
  useStickToBottom(chatRef, chatAtBottom, [s.chat])
  const onScroll = () => {
    const el = listRef.current
    if (el) setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }
  const onChatScroll = () => {
    const el = chatRef.current
    if (el) setChatAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }
  const goBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    setAtBottom(true)
  }
  const send = (preset?: string) => {
    setChatAtBottom(true)
    void s.send(preset)
  }

  const answerCard = (card: Card) => {
    if (s.roles.some((r) => r.id === card.role)) s.setRoleId(card.role)
    s.setReplyTo(card)
  }

  // Bloques por hablante: el nombre y la hora solo cuando cambia quién habla.
  let prevWho: string | null | undefined

  return (
    <>
      <style>{`
        @keyframes sottoly-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sottoly-dot { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }
        .sottoly-in { animation: sottoly-in 180ms ease-out both }
        .sottoly-dot { animation: sottoly-dot 1.2s infinite }
        @media (prefers-reduced-motion: reduce) { .sottoly-in, .sottoly-dot { animation: none } }
      `}</style>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight">En vivo</h1>
        {s.recording && (
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-[#FBF3F2] px-3 text-[13px] font-semibold text-[#8A1C12]">
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#B42318]" />
            <span>Grabando</span>
            {s.elapsed !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span role="timer" aria-label="Tiempo de grabación" className="font-mono font-medium tabular-nums">
                  {clock(s.elapsed)}
                </span>
              </>
            )}
          </span>
        )}
        <span className="flex-1" />
        {s.recording ? (
          <button
            type="button"
            onClick={s.stopRecording}
            disabled={s.stopping}
            className={`h-10 whitespace-nowrap rounded-full border border-[#18181A] bg-[#18181A] px-[18px] text-sm font-semibold text-white disabled:opacity-50 ${focus}`}
          >
            {s.stopping ? 'Guardando la Reunión…' : 'Detener y revisar Decisiones'}
          </button>
        ) : (
          <button type="button" onClick={s.startRecording} className={`h-10 whitespace-nowrap rounded-full border border-[#18181A] bg-[#18181A] px-5 text-sm font-semibold text-white ${focus}`}>
            Iniciar grabación
          </button>
        )}
      </header>
      {s.recError && (
        <p role="alert" className="m-0 rounded-lg bg-[#FBF3F2] px-3 py-2 text-sm text-[#5A1A12]">
          {s.recError}
        </p>
      )}

      <div className="flex min-h-[560px] flex-wrap gap-6">
        <section aria-label="Transcripción" className="flex min-w-0 flex-[999_1_420px] flex-col">
          <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-2.5 border-b border-[#EDEDEA] pb-3">
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
                  className={`h-7 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold text-[#18181A] transition-colors ${focus} ${b.on ? 'bg-white shadow-sm' : 'bg-transparent'}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {allCards.length > 0 && <span className="text-[13px] text-[#5C5C63]">{counter}</span>}
          </div>

          {echoes > 0 && (
            <div role="status" className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-[#F1DFBA] bg-[#FFF8EB] px-3 py-2 text-[13px] text-[#6A4300]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                <path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
                <path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
              </svg>
              <span className="min-w-0 flex-1">
                {`Ocultamos ${echoes} ${echoes === 1 ? 'frase repetida' : 'frases repetidas'}: tu micrófono está captando el audio de la reunión. `}
                <strong>Usa audífonos</strong> para que tu junta sepa qué dijiste tú.
              </span>
              <button type="button" onClick={() => setShowEcho((v) => !v)} className={`rounded px-1 font-semibold underline ${focus}`}>
                {showEcho ? 'Ocultar repetidas' : 'Ver ocultas'}
              </button>
            </div>
          )}

          <div className="relative min-h-0">
            {s.feed.length === 0 && (
              <p className="m-0 pt-4 text-[15px] text-[#4A4A4F]">
                {s.recording ? 'Escuchando… aquí aparece lo que se dice.' : 'Inicia la grabación y aquí aparece lo que se dice.'}
              </p>
            )}
            <ol
              ref={listRef}
              onScroll={onScroll}
              aria-label="Transcripción en vivo"
              className="m-0 flex h-[calc(100vh-250px)] min-h-[320px] list-none flex-col gap-3.5 overflow-y-auto p-0 pb-16 pt-4"
            >
              {visible.map((item) => {
                if (item.kind === 'line') {
                  const head = item.who !== prevWho
                  prevWho = item.who
                  return (
                    <li key={item.key} className={`sottoly-in grid grid-cols-[88px_minmax(0,68ch)] gap-x-3.5 ${head ? '' : '-mt-2'}`}>
                      <span className="flex flex-col gap-0.5 pt-0.5">
                        {head && item.who && <span className="text-xs font-semibold text-[#5C5C63]">{item.who}</span>}
                        <span className="font-mono text-[11px] text-[#6B6B72]">{clock(item.t)}</span>
                      </span>
                      <p className={`m-0 text-[15px] leading-relaxed ${item.echo ? 'text-[#8A8A90] line-through decoration-[#C9C9C4]' : ''}`}>
                        {item.echo && <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide no-underline">Eco</span>}
                        {item.text}
                      </p>
                    </li>
                  )
                }
                prevWho = undefined
                const st = cardOf(item.id)
                const tn = tone(item.role)
                if (st.mode === 'ignored')
                  return (
                    <li key={item.key} className="grid grid-cols-[88px_minmax(0,68ch)] gap-x-3.5">
                      <span />
                      <span className="flex items-center gap-2 text-[13px] text-[#6B6B72]">
                        {`Ignoraste una Sugerencia de ${item.persona}.`}
                        <button type="button" onClick={() => s.setCard(item.id, { mode: 'open' })} className={`p-1 text-[13px] font-semibold text-[#2F4A6B] ${focus}`}>
                          Deshacer
                        </button>
                      </span>
                    </li>
                  )
                if (st.mode === 'collapsed')
                  return (
                    <li key={item.key} className="grid grid-cols-[88px_minmax(0,68ch)] gap-x-3.5">
                      <span />
                      <button
                        type="button"
                        aria-label={`Abrir la Sugerencia de ${item.persona}`}
                        onClick={() => s.setCard(item.id, { mode: 'open' })}
                        className={`flex h-[34px] min-w-0 items-center gap-2 rounded-lg border border-[#DCE3EC] bg-[#F8F9FB] pl-2 pr-2.5 text-left ${focus}`}
                      >
                        <Avatar name={item.persona} tone={tn.solid} size={20} />
                        <span className="flex-none text-xs font-semibold" style={{ color: tn.solid }}>
                          {item.persona}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{item.text}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A4A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </li>
                  )
                const small = `h-7 rounded-md px-2 text-[13px] ${focus}`
                const icon = `flex h-7 w-7 items-center justify-center rounded-md text-[#4A4A4F] hover:bg-[#E9EEF5] ${focus}`
                return (
                  <li key={item.key} className="sottoly-in grid grid-cols-[88px_minmax(0,68ch)] gap-x-3.5">
                    <span className="pt-3 font-mono text-[11px] text-[#6B6B72]">{clock(item.at)}</span>
                    <article aria-label={`Sugerencia de ${item.persona}`} className="flex flex-col gap-1.5 rounded-[10px] border border-[#C9D4E2] bg-[#F5F7FA] py-2.5 pl-3 pr-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.persona} tone={tn.solid} size={20} />
                        <span className="flex-1 text-xs font-semibold" style={{ color: tn.solid }}>{`${item.persona} · ${item.roleLabel}`}</span>
                        <button type="button" aria-label="Contraer" onClick={() => s.setCard(item.id, { mode: 'collapsed' })} className={icon}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 15l6-6 6 6" />
                          </svg>
                        </button>
                        <button type="button" aria-label="Ignorar" onClick={() => s.ignoreCard(item)} className={icon}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 6l12 12" />
                            <path d="M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                      <span className="text-[15px] font-semibold leading-snug">{item.text}</span>
                      {st.why && <span className="text-[13px] text-[#4A4A4F]">{item.reason}</span>}
                      <div className="-ml-2 flex flex-wrap items-center gap-1">
                        <button type="button" aria-label={`Responder a ${item.persona}`} onClick={() => answerCard(item)} className={`${small} font-semibold text-[#2F4A6B]`}>
                          Responder
                        </button>
                        <button type="button" onClick={() => s.setCard(item.id, { why: !st.why })} className={`${small} text-[#4A4A4F]`}>
                          {st.why ? 'Ocultar por qué' : 'Por qué'}
                        </button>
                        <span className="flex-1" />
                        <button type="button" aria-pressed={st.mark === true} onClick={() => s.markCard(item, true)} className={`${small} ${st.mark === true ? 'bg-[#E3EAF3] font-semibold text-[#2F4A6B]' : 'text-[#4A4A4F]'}`}>
                          Útil
                        </button>
                        <button type="button" aria-pressed={st.mark === false} onClick={() => s.markCard(item, false)} className={`${small} ${st.mark === false ? 'bg-[#E3EAF3] font-semibold text-[#2F4A6B]' : 'text-[#4A4A4F]'}`}>
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
                className={`absolute bottom-4 left-1/2 h-[34px] -translate-x-1/2 rounded-full border border-[#D4D4D0] bg-white px-3.5 text-[13px] font-semibold text-[#18181A] shadow-md ${focus}`}
              >
                Ir a lo último ↓
              </button>
            )}
          </div>
        </section>

        <aside aria-label="Chat con la junta" className="box-border flex h-[calc(100vh-150px)] min-h-[420px] max-w-[440px] flex-[1_1_360px] flex-col rounded-xl border border-[#E4E4E1] bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EDEDEA] px-4 py-3">
            <h2 className="m-0 flex-1 text-sm font-semibold">Tu junta</h2>
            <div role="group" aria-label="Con quién hablas" className="inline-flex flex-wrap gap-0.5 rounded-full bg-[#EFEFEC] p-[3px]">
              {s.roles.length > 1 && (
                <button
                  type="button"
                  aria-pressed={s.roleId === ALL_ROLES}
                  aria-label="Todos · toda tu junta"
                  title="Pregúntale a toda tu junta a la vez"
                  onClick={() => s.setRoleId(ALL_ROLES)}
                  className={`inline-flex h-[30px] items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] transition-colors ${focus} ${s.roleId === ALL_ROLES ? 'bg-white font-semibold text-[#18181A] shadow-sm' : 'bg-transparent text-[#4A4A4F]'}`}
                >
                  <span aria-hidden="true" className="flex -space-x-2">
                    {s.roles.slice(0, 3).map((r) => (
                      <span key={r.id} className="rounded-full ring-2 ring-[#EFEFEC]">
                        <Avatar name={r.persona} tone={tone(r.id).solid} size={18} />
                      </span>
                    ))}
                  </span>
                  Todos
                </button>
              )}
              {s.roles.map((r) => {
                const on = r.id === s.roleId
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${r.persona} · ${r.role}`}
                    title={r.role}
                    onClick={() => s.setRoleId(r.id)}
                    className={`inline-flex h-[30px] items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] transition-colors ${focus} ${on ? 'bg-white font-semibold text-[#18181A] shadow-sm' : 'bg-transparent text-[#4A4A4F]'}`}
                  >
                    <Avatar name={r.persona} tone={tone(r.id).solid} size={22} />
                    {r.persona}
                  </button>
                )
              })}
            </div>
          </div>

          <ol ref={chatRef} onScroll={onChatScroll} aria-label="Conversación" className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3.5 overflow-y-auto p-4 text-sm leading-normal">
            {s.chat.length === 0 && (
              <li className="m-auto max-w-[280px] text-center text-[13px] text-[#5C5C63]">
                {current
                  ? current.all
                    ? 'Pregúntale a toda tu junta por lo que se está diciendo: cada Rol te responde aparte.'
                    : `Pregúntale a ${current.persona} por lo que se está diciendo, o responde a una de sus Sugerencias.`
                  : 'Activa un Rol en «Roles» para conversar con tu junta.'}
              </li>
            )}
            {s.chat.map((e) => {
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
                      <span className="font-semibold" style={{ color: tn.solid }}>{name}</span>
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
              send()
            }}
          >
            {s.notice && (
              <p role="alert" className="m-0 rounded-lg bg-[#FBF3F2] px-3 py-2 text-sm text-[#5A1A12]">
                {s.notice}
              </p>
            )}
            {s.replyTo && (
              <div className="flex items-start justify-between gap-2 border-l-2 border-[#C9D4E2] pl-2.5 text-[13px] text-[#5C5C63]">
                <span>{`Sobre: «${s.replyTo.text}»`}</span>
                <button type="button" onClick={() => s.setReplyTo(null)} className={`text-[13px] text-[#2F4A6B] underline ${focus}`}>
                  Quitar
                </button>
              </div>
            )}
            {current && (
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
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
                value={s.draft}
                disabled={!current}
                onChange={(ev) => s.setDraft(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault()
                    send()
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
      </div>
    </>
  )
}

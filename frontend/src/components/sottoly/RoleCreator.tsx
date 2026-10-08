'use client'

// Creador de Roles (PLAN.md, tarea 14; pantalla 3 del diseño aprobado): una entrevista de cinco pasos.
// El Rol se crea con `sottoly_create_role` y nace sin calibrar (umbral alto, ejemplos para calibrarlo).
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

const PASOS = ['Función', 'Persona', 'Cuándo habla', 'Límites', 'Nombre'] as const

const LIMITES = [
  { id: 'legal opinions', label: 'Opiniones legales' },
  { id: 'personal topics', label: 'Temas personales o familiares' },
  { id: 'personal attacks', label: 'Ataques o juicios sobre la persona' },
]

interface Draft {
  name: string
  persona: string
  function: string
  tone: string
  when: string
  example_speak: string
  example_silent: string
  limits: string[]
}

const EMPTY: Draft = { name: '', persona: '', function: '', tone: '', when: '', example_speak: '', example_silent: '', limits: [] }

const field =
  'w-full rounded-[10px] border border-[#D4D4D0] px-3 py-2.5 text-[15px] leading-normal text-[#18181A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]'
const label = 'text-sm font-semibold text-[#4A4A4F]'
const btn = 'h-11 rounded-full border px-5 text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B]'

export function RoleCreator({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [paso, setPaso] = useState(0)
  const [d, setD] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Draft) => (ev: { target: { value: string } }) => setD((x) => ({ ...x, [k]: ev.target.value }))

  const listo = [d.function, d.persona, d.when, 'ok', d.name][paso].trim().length > 0
  const ultimo = paso === PASOS.length - 1

  const crear = async () => {
    setSaving(true)
    setError(null)
    try {
      await invoke('sottoly_create_role', { draft: d })
      onCreated()
    } catch (e) {
      setError(typeof e === 'string' ? e : 'No se pudo crear el Rol.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      role="dialog"
      aria-label={`Nuevo Rol · paso ${paso + 1} de ${PASOS.length}`}
      className="box-border flex max-w-[440px] flex-[1_1_360px] flex-col gap-[18px] rounded-xl border border-[#C9D4E2] bg-white p-[22px]"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-[#2F4A6B]">{`Nuevo Rol · Paso ${paso + 1} de ${PASOS.length}`}</span>
        <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[13px]">
          {PASOS.map((p, i) => (
            <li
              key={p}
              aria-current={i === paso ? 'step' : undefined}
              className={i === paso ? 'rounded-full bg-[#2F4A6B] px-2.5 py-1 font-semibold text-white' : 'rounded-full border border-[#D4D4D0] px-2.5 py-1 text-[#4A4A4F]'}
            >
              {p}
            </li>
          ))}
        </ol>
      </div>

      {paso === 0 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="rc-funcion" className={label}>¿Qué va a cuidar este Rol?</label>
          <textarea id="rc-funcion" rows={4} value={d.function} onChange={set('function')} className={field} placeholder="Ej.: que me avise cuando un cliente pida descuentos sin dar nada a cambio" />
          <p className="m-0 text-[13px] leading-normal text-[#5C5C63]">
            Un Rol nuevo empieza sin calibrar: habla menos hasta que lo pruebes con ejemplos de cuándo debe intervenir y cuándo no.
          </p>
        </div>
      )}
      {paso === 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="rc-persona" className={label}>¿Cómo se llama la persona?</label>
            <input id="rc-persona" value={d.persona} onChange={set('persona')} className={field} placeholder="Ej.: Nora" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="rc-tono" className={label}>¿Cómo habla?</label>
            <textarea id="rc-tono" rows={2} value={d.tone} onChange={set('tone')} className={field} placeholder="Ej.: directa y tranquila, sin jerga" />
          </div>
        </div>
      )}
      {paso === 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="rc-cuando" className={label}>¿Cuándo debe intervenir?</label>
            <textarea id="rc-cuando" rows={3} value={d.when} onChange={set('when')} className={field} placeholder="Ej.: cuando piden un descuento sin ofrecer nada a cambio" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="rc-si" className={label}>Un ejemplo de cuándo sí</label>
            <input id="rc-si" value={d.example_speak} onChange={set('example_speak')} className={field} placeholder="Algo que alguien diría en la Reunión" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="rc-no" className={label}>Un ejemplo de cuándo no</label>
            <input id="rc-no" value={d.example_silent} onChange={set('example_silent')} className={field} placeholder="Algo en lo que debe quedarse callado" />
          </div>
        </div>
      )}
      {paso === 3 && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={`${label} mb-2`}>¿De qué no debe opinar?</legend>
          {LIMITES.map((l) => (
            <label key={l.id} className="flex min-h-11 items-center gap-2.5 text-[15px] text-[#18181A]">
              <input
                type="checkbox"
                checked={d.limits.includes(l.id)}
                onChange={(ev) =>
                  setD((x) => ({ ...x, limits: ev.target.checked ? LIMITES.map((o) => o.id).filter((id) => id === l.id || x.limits.includes(id)) : x.limits.filter((id) => id !== l.id) }))
                }
                className="h-[18px] w-[18px] accent-[#2F4A6B]"
              />
              {l.label}
            </label>
          ))}
        </fieldset>
      )}
      {paso === 4 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="rc-nombre" className={label}>¿Cómo se llama el Rol?</label>
          <input id="rc-nombre" value={d.name} onChange={set('name')} className={field} placeholder="Ej.: Negociador" />
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 rounded-lg bg-[#FBF3F2] px-3 py-2 text-sm text-[#5A1A12]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={`${btn} border-[#D4D4D0] bg-white text-[#18181A]`}>Cancelar</button>
        {paso > 0 && (
          <button type="button" onClick={() => setPaso((p) => p - 1)} className={`${btn} border-[#D4D4D0] bg-white text-[#18181A]`}>Atrás</button>
        )}
        {ultimo ? (
          <button type="button" disabled={!listo || saving} onClick={crear} className={`${btn} border-[#18181A] bg-[#18181A] font-semibold text-white disabled:opacity-40`}>
            {saving ? 'Creando…' : 'Crear el Rol'}
          </button>
        ) : (
          <button type="button" disabled={!listo} onClick={() => setPaso((p) => p + 1)} className={`${btn} border-[#18181A] bg-[#18181A] font-semibold text-white disabled:opacity-40`}>
            Siguiente
          </button>
        )}
      </div>
    </section>
  )
}

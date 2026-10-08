'use client'

// Revisión de las Decisiones del cierre (PLAN.md, tarea 17; pantalla 2 del diseño aprobado). Cada una se
// aprueba, edita o descarta; «Guardar en mi Memoria» manda lo elegido. Solo lo aprobado va a la Memoria.
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface CandidateDecision {
  id: string
  kind: 'decision' | 'commitment'
  owner: 'user' | 'counterpart'
  text: string
  due: string | null
}

type Choice = 'approved' | 'discarded' | null

interface Row {
  d: CandidateDecision
  text: string
  choice: Choice
  editing: boolean
}

const btn =
  'h-10 rounded-full border px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B]'

function label(d: CandidateDecision): string {
  const kind = d.kind === 'commitment' ? 'Compromiso' : 'Decisión'
  const who = d.owner === 'user' ? 'Tú' : 'Contraparte'
  return [kind, who, d.due ? `para el ${d.due}` : null].filter(Boolean).join(' · ')
}

export function DecisionsReview({ meetingId, decisions, onDone }: { meetingId: string; decisions: CandidateDecision[]; onDone: (saved: number) => void }) {
  const [rows, setRows] = useState<Row[]>(decisions.map((d) => ({ d, text: d.text, choice: null, editing: false })))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const send = async (items: { id: string; approved: boolean; text: string }[]) => {
    setSaving(true)
    setError(null)
    try {
      const res = await invoke<{ saved: number }>('sottoly_save_decisions', { meetingId, items })
      onDone(res?.saved ?? items.filter((i) => i.approved).length)
    } catch (e) {
      setError(typeof e === 'string' ? e : 'No se pudieron guardar las Decisiones.')
    } finally {
      setSaving(false)
    }
  }

  const allChosen = rows.every((r) => r.choice !== null)

  return (
    <section aria-label="Decisiones por revisar" className="flex max-w-[880px] flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold">Decisiones por revisar</h2>
        <p className="m-0 max-w-[60ch] text-[15px] text-[#4A4A4F]">Sottoly propone lo que entendió. Solo se guarda en tu Memoria lo que apruebes.</p>
      </div>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-[#E4E4E1] bg-white p-0">
        {rows.map((r, i) => (
          <li key={r.d.id} className="flex flex-wrap items-center gap-4 border-b border-[#E4E4E1] px-5 py-[18px] last:border-b-0">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
              <span className="text-xs font-semibold text-[#5C5C63]">{label(r.d)}</span>
              <span className={`text-base leading-snug ${r.choice === 'discarded' ? 'text-[#6B6B72] line-through' : ''}`}>{r.text}</span>
              {r.editing && (
                <>
                  <label htmlFor={`edit-${r.d.id}`} className="sr-only">Texto de la Decisión</label>
                  <textarea
                    id={`edit-${r.d.id}`}
                    rows={2}
                    value={r.text}
                    onChange={(e) => update(i, { text: e.target.value })}
                    className="mt-1 rounded-[10px] border border-[#D4D4D0] px-3 py-2 text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]"
                  />
                </>
              )}
              {r.choice && <span className="text-[13px] text-[#2F4A6B]">{r.choice === 'approved' ? 'Aprobada' : 'Descartada'}</span>}
            </div>
            <div className="flex gap-2">
              <button type="button" aria-pressed={r.choice === 'approved'} onClick={() => update(i, { choice: 'approved', editing: false })} className={`${btn} border-[#18181A] bg-[#18181A] font-semibold text-white`}>
                Aprobar
              </button>
              <button type="button" onClick={() => update(i, { editing: true, choice: null })} className={`${btn} border-[#D4D4D0] bg-white text-[#18181A]`}>
                Editar
              </button>
              <button type="button" aria-pressed={r.choice === 'discarded'} onClick={() => update(i, { choice: 'discarded', editing: false })} className={`${btn} border-[#D4D4D0] bg-white text-[#18181A]`}>
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="m-0 rounded-lg bg-[#FBF3F2] px-3 py-2 text-sm text-[#5A1A12]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!allChosen || saving}
          onClick={() => send(rows.map((r) => ({ id: r.d.id, approved: r.choice === 'approved', text: r.text })))}
          className={`${btn} h-11 border-[#18181A] bg-[#18181A] px-5 text-[15px] font-semibold text-white disabled:opacity-40`}
        >
          Guardar en mi Memoria
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => send(rows.map((r) => ({ id: r.d.id, approved: false, text: r.d.text })))}
          className={`${btn} h-11 border-[#D4D4D0] bg-white px-5 text-[15px] text-[#18181A]`}
        >
          No guardar nada de esta Reunión
        </button>
      </div>
    </section>
  )
}

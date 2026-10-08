'use client'

// La junta: los Roles de roles/ (PLAN.md, tarea 12) y el creador de Roles (tarea 14).
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { LoadError } from '@/components/sottoly/PanelShell'
import { RoleCreator } from '@/components/sottoly/RoleCreator'

interface RoleSummary {
  id: string
  role: string
  persona: string
  gate_definition: string
  calibrated: boolean
  status: string
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; roles: RoleSummary[] }

const STATUS_LABEL: Record<string, string> = { active: 'Activo', experimental: 'Experimental' }

export default function RolesPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [creating, setCreating] = useState(false)

  const fetchRoles = useCallback(async () => {
    setLoad({ state: 'loading' })
    try {
      const roles = (await invoke<RoleSummary[] | null>('sottoly_list_roles')) ?? []
      setLoad({ state: 'ready', roles })
    } catch {
      setLoad({ state: 'error' })
    }
  }, [])

  useEffect(() => {
    void fetchRoles()
  }, [fetchRoles])

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[26px] font-semibold tracking-tight">Tu junta</h1>
          <p className="m-0 max-w-[62ch] text-[15px] text-[#4A4A4F]">
            Cada Rol escucha la Reunión y habla solo cuando le toca.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={creating}
          className="h-11 rounded-full border border-[#18181A] bg-[#18181A] px-5 text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B] disabled:opacity-40"
        >
          Crear un Rol
        </button>
      </header>
      {load.state === 'loading' && <p className="m-0 text-[15px] text-[#5C5C63]">Cargando…</p>}
      {load.state === 'error' && <LoadError message="No se pudieron leer los Roles." onRetry={fetchRoles} />}
      <div className="flex flex-wrap items-start gap-6">
      {load.state === 'ready' && (
        <ul aria-label="Roles" className="m-0 flex min-w-0 max-w-[880px] flex-[999_1_460px] list-none flex-col overflow-hidden rounded-xl border border-[#E4E4E1] bg-white p-0">
          {load.roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-4 border-b border-[#E4E4E1] px-5 py-[18px] last:border-b-0">
              <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
                <span className="text-base font-semibold">{`${r.persona} · ${r.role}`}</span>
                <span className="text-sm leading-snug text-[#4A4A4F]">{r.gate_definition}</span>
              </div>
              {!r.calibrated && (
                <span className="rounded-full border border-[#F1D9B5] bg-[#FFF4E5] px-2.5 py-1 text-[13px] text-[#7A4A00]">Sin calibrar</span>
              )}
              <span className="text-sm text-[#4A4A4F]">{STATUS_LABEL[r.status] ?? r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <RoleCreator
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            void fetchRoles()
          }}
        />
      )}
      </div>
    </>
  )
}

'use client'

// Reuniones guardadas (PLAN.md, tarea 12). Los datos vienen de Meetily (`api_get_meetings`).
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { LoadError } from '@/components/sottoly/PanelShell'

interface MeetingItem {
  id: string
  title: string
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; meetings: MeetingItem[] }

export default function ReunionesPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  const fetchMeetings = useCallback(async () => {
    setLoad({ state: 'loading' })
    try {
      const meetings = (await invoke<MeetingItem[] | null>('api_get_meetings')) ?? []
      setLoad({ state: 'ready', meetings })
    } catch {
      setLoad({ state: 'error' })
    }
  }, [])

  useEffect(() => {
    void fetchMeetings()
  }, [fetchMeetings])

  return (
    <>
      <h1 className="m-0 text-[26px] font-semibold tracking-tight">Reuniones</h1>
      {load.state === 'loading' && <p className="m-0 text-[15px] text-[#5C5C63]">Cargando…</p>}
      {load.state === 'error' && (
        <LoadError message="No se pudieron cargar las Reuniones. Revisa que la App tenga acceso a sus datos." onRetry={fetchMeetings} />
      )}
      {load.state === 'ready' && load.meetings.length === 0 && (
        <p className="m-0 max-w-[60ch] text-[15px] text-[#4A4A4F]">Todavía no hay Reuniones guardadas.</p>
      )}
      {load.state === 'ready' && load.meetings.length > 0 && (
        <ul aria-label="Reuniones guardadas" className="m-0 flex max-w-[720px] list-none flex-col gap-1.5 p-0">
          {load.meetings.map((m) => (
            <li key={m.id}>
              <Link
                href={`/sottoly/reunion?id=${encodeURIComponent(m.id)}`}
                className="block rounded-[10px] border border-[#E4E4E1] bg-white px-4 py-3.5 text-base font-semibold text-[#18181A] no-underline hover:border-[#C9D4E2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]"
              >
                {m.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

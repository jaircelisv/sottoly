'use client'

// Panel de Sottoly (PLAN.md, tarea 12): menú lateral propio y área de contenido.
// Diseño aprobado por Jair el 2026-10-07: austero, Source Sans 3, un acento azul tinta.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

const SECCIONES = [
  { href: '/sottoly/en-vivo', label: 'En vivo', live: true, match: (p: string) => p.startsWith('/sottoly/en-vivo') },
  { href: '/sottoly', label: 'Reuniones', match: (p: string) => p === '/sottoly' || p.startsWith('/sottoly/reunion') },
  { href: '/sottoly/roles', label: 'Roles', match: (p: string) => p.startsWith('/sottoly/roles') },
]

export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return (
    <div className="flex min-h-screen flex-wrap bg-[#FAFAF9] font-sans text-[#18181A]">
      <nav
        aria-label="Secciones"
        className="box-border flex max-w-[240px] flex-[1_1_220px] flex-col gap-8 border-r border-[#E4E4E1] bg-[#F2F2F0] px-5 py-7"
      >
        <div className="text-xl font-bold tracking-tight">Sottoly</div>
        <div className="flex flex-col gap-1">
          {SECCIONES.map((s) => {
            const current = s.match?.(pathname) ?? false
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={current ? 'page' : undefined}
                className={
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B] ' +
                  (current
                    ? 'border border-[#E4E4E1] bg-white font-semibold text-[#18181A]'
                    : 'border border-transparent text-[#4A4A4F] hover:bg-white/60')
                }
              >
                {s.live && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#B42318]" />}
                {s.label}
              </Link>
            )
          })}
        </div>
        <DemoSwitch />
      </nav>
      <main className="box-border flex min-w-0 flex-[999_1_520px] flex-col gap-6 px-9 pb-10 pt-7">{children}</main>
    </div>
  )
}

/** Estado de carga común: cargando, error con Reintentar, o el contenido. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl border border-[#E4C7C3] bg-[#FBF3F2] px-5 py-4 text-[15px] text-[#5A1A12]">
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="h-10 rounded-full border border-[#D4D4D0] bg-white px-4 text-sm text-[#18181A] hover:bg-[#F2F2F0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4A6B]"
      >
        Reintentar
      </button>
    </div>
  )
}

/**
 * Tarjetas de demostración (tarea 22, pedido de Jair): solo en desarrollo, se prenden o apagan sin reiniciar.
 * En producción el comando dice que no existen y el interruptor no aparece.
 */
function DemoSwitch() {
  const [status, setStatus] = useState<{ available: boolean; on: boolean } | null>(null)
  useEffect(() => {
    invoke<{ available: boolean; on: boolean } | null>('sottoly_demo_status')
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])
  if (!status?.available) return null
  const toggle = async () => {
    try {
      setStatus(await invoke<{ available: boolean; on: boolean }>('sottoly_set_demo', { on: !status.on }))
    } catch {
      // si falla, el interruptor se queda como estaba
    }
  }
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#E4E4E1] pt-4 text-[13px] text-[#4A4A4F]">
      <span id="demo-label">Tarjetas de demostración</span>
      <button
        type="button"
        role="switch"
        aria-checked={status.on}
        aria-labelledby="demo-label"
        onClick={toggle}
        className={`relative h-6 w-10 flex-none rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4A6B] ${status.on ? 'bg-[#2F4A6B]' : 'bg-[#D4D4D0]'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${status.on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

import { LiveSessionProvider } from '@/components/sottoly/LiveSession'
import { PanelShell } from '@/components/sottoly/PanelShell'

// Panel de Sottoly: pantallas nuevas junto a las de Meetily (ADR-0001), con su propio menú.
// La sesión en vivo vive aquí para que no se pierda al cambiar de pestaña (tarea 23).
export default function SottolyLayout({ children }: { children: React.ReactNode }) {
  return (
    <LiveSessionProvider>
      <PanelShell>{children}</PanelShell>
    </LiveSessionProvider>
  )
}

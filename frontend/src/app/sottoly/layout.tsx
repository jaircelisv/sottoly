import { PanelShell } from '@/components/sottoly/PanelShell'

// Panel de Sottoly: pantallas nuevas junto a las de Meetily (ADR-0001), con su propio menú.
export default function SottolyLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>
}

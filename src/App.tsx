import { useEffect, useMemo, useState } from 'react'
import { AppHeader, type AppView } from './components/AppHeader'
import { CompetitionView, type ServerInviteCode } from './components/CompetitionView'
import { GarageView } from './components/GarageView'
import { MarketView } from './components/MarketView'
import { Notifications } from './components/Notifications'
import { RealEstateView } from './components/RealEstateView'
import { ReturnSummary } from './components/ReturnSummary'
import { SettingsView } from './components/SettingsView'
import { useGame } from './context/GameContext'
import { getGarageActionCount, getPropertyActionCount } from './game/returnSummary'

const viewTitles: Record<AppView, string> = {
  garage: 'Garage',
  market: 'Marché',
  'real-estate': 'Immobilier',
  competition: 'Compétition',
  settings: 'Réglages',
}

function App() {
  const [view, setView] = useState<AppView>('garage')
  const [serverInviteCode, setServerInviteCode] = useState<ServerInviteCode | null>(null)
  const { state, returnSummary, dismissReturnSummary } = useGame()
  const attention = useMemo(() => ({
    garage: getGarageActionCount(state),
    'real-estate': getPropertyActionCount(state),
  }), [state])

  useEffect(() => {
    document.title = `${viewTitles[view]} · AUTYCO`
    window.scrollTo({ top: 0, behavior: 'auto' })
    window.requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
    })
  }, [view])

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <AppHeader view={view} onViewChange={setView} attention={attention} state={state} />
      {returnSummary && (
        <ReturnSummary
          summary={returnSummary}
          onDismiss={dismissReturnSummary}
          onOpenGarage={() => setView('garage')}
        />
      )}
      {view === 'garage' ? (
        <GarageView onOpenMarket={() => setView('market')} />
      ) : view === 'market' ? (
        <MarketView />
      ) : view === 'real-estate' ? (
        <RealEstateView />
      ) : view === 'competition' ? (
        <CompetitionView inviteCode={serverInviteCode} onInviteCodeChange={setServerInviteCode} />
      ) : (
        <SettingsView />
      )}
      <Notifications />
    </div>
  )
}

export default App

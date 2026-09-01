import { useState } from 'react'
import { AppHeader, type AppView } from './components/AppHeader'
import { ConnectionStatus } from './components/ConnectionStatus'
import { GarageView } from './components/GarageView'
import { MarketView } from './components/MarketView'
import { Notifications } from './components/Notifications'
import { RealEstateView } from './components/RealEstateView'
import { SettingsView } from './components/SettingsView'
import { SummaryStrip } from './components/SummaryStrip'
import { useGame } from './context/GameContext'

function App() {
  const [view, setView] = useState<AppView>('garage')
  const { state } = useGame()

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <AppHeader view={view} onViewChange={setView} />
      <ConnectionStatus />
      <SummaryStrip state={state} />
      {view === 'garage' ? (
        <GarageView onOpenMarket={() => setView('market')} />
      ) : view === 'market' ? (
        <MarketView onPurchase={() => setView('garage')} />
      ) : view === 'real-estate' ? (
        <RealEstateView />
      ) : (
        <SettingsView />
      )}
      <Notifications />
    </div>
  )
}

export default App

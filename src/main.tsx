import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider, useAuth } from './backend/AuthContext'
import { AuthScreen } from './components/AuthScreen'
import { BackendLoading } from './components/BackendLoading'
import { RecoveryCodeScreen } from './components/RecoveryCodeScreen'
import { GameProvider } from './context/GameContext'
import { AccentThemeProvider } from './theme/AccentTheme'
import './index.css'

const Application = () => {
  const { status } = useAuth()
  if (status === 'initializing') return <BackendLoading />
  if (status === 'signed-out') return <AuthScreen />
  if (status === 'recovery-code') return <RecoveryCodeScreen />
  return (
    <GameProvider>
      <App />
    </GameProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AccentThemeProvider>
        <Application />
      </AccentThemeProvider>
    </AuthProvider>
  </StrictMode>,
)

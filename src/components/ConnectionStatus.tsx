import { useAuth } from '../backend/AuthContext'
import { useGame } from '../context/GameContext'

export const ConnectionStatus = () => {
  const auth = useAuth()
  const { syncStatus, syncMessage, retrySync } = useGame()
  const connected = auth.status === 'authenticated'
  const warning = syncStatus === 'error' || !connected

  return (
    <div className={`border-b-2 ${warning ? 'border-warning bg-[#fff0d6]' : 'border-ink bg-surface'}`} role="status" aria-live="polite">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="flex min-w-0 items-start gap-2 leading-5 sm:items-center">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 border border-ink sm:mt-0 ${warning ? 'bg-warning' : 'bg-success'}`} aria-hidden="true" />
          <span>
            <strong className="font-bold">
              {connected
                ? syncStatus === 'synced'
                  ? 'Serveur synchronisé'
                  : syncStatus === 'syncing' || syncStatus === 'loading'
                    ? 'Synchronisation en cours'
                    : 'Connexion dégradée'
                : 'Mode local'}
            </strong>
            <span className="text-muted">
              {' · '}
              {connected
                ? syncMessage ?? `${auth.identity?.playerName ?? 'Joueur'} · sauvegarde active`
                : auth.notice ?? 'Progression enregistrée uniquement sur cet appareil.'}
            </span>
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {connected && syncStatus === 'error' && (
            <button type="button" className="min-h-11 border-b-2 border-ink px-2 font-bold" onClick={() => void retrySync()}>
              Recharger le serveur
            </button>
          )}
          {!connected && auth.configured && (
            <button type="button" className="min-h-11 border-b-2 border-ink px-2 font-bold" onClick={auth.showEntry}>
              Sauvegarder en ligne
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

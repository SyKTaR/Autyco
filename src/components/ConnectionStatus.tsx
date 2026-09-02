import { useAuth } from '../backend/AuthContext'
import { useGame } from '../context/GameContext'

export const ConnectionStatus = () => {
  const auth = useAuth()
  const { syncStatus, syncMessage, retrySync } = useGame()
  const connected = auth.status === 'authenticated'
  const warning = syncStatus === 'error' || !connected
  const statusLabel = connected
    ? syncStatus === 'synced'
      ? 'Serveur synchronisé'
      : syncStatus === 'syncing' || syncStatus === 'loading'
        ? 'Synchronisation en cours'
        : 'Connexion dégradée'
    : 'Mode local'
  const statusMessage = connected
    ? syncMessage ?? `${auth.identity?.playerName ?? 'Joueur'} · sauvegarde active`
    : auth.notice ?? 'Progression enregistrée uniquement sur cet appareil.'

  return (
    <section className="panel mt-8 overflow-hidden" aria-labelledby="sync-title">
      <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
        <div>
          <p className="text-sm font-semibold text-signal-hover">Sauvegarde</p>
          <h2 id="sync-title" className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Synchronisation
          </h2>
        </div>
        <p className="max-w-[42ch] text-sm leading-6 text-muted">
          Consulte l’état du serveur et relance la sauvegarde si nécessaire.
        </p>
      </div>

      <div className={`flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${warning ? 'bg-warning/10' : 'bg-soft/35'}`}>
        <div className="flex min-w-0 items-start gap-3" role="status" aria-live="polite" aria-atomic="true">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0 ${warning ? 'bg-warning' : 'bg-success'}`} aria-hidden="true" />
          <p className="text-sm leading-6">
            <strong className="block font-bold sm:inline">{statusLabel}</strong>
            <span className="text-muted sm:before:content-['·_']">{statusMessage}</span>
          </p>
        </div>
        <div className="-ml-3 flex flex-wrap gap-2 sm:ml-0 sm:shrink-0 sm:justify-end">
          {connected && syncStatus === 'error' && (
            <button type="button" className="text-action text-warning" onClick={() => void retrySync()}>
              Recharger le serveur
            </button>
          )}
          {!connected && auth.configured && (
            <button type="button" className="text-action" onClick={auth.showEntry}>
              Sauvegarder en ligne
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

import { useAuth } from '../backend/AuthContext'
import { RecoveryCodeDisplay } from './RecoveryCodeDisplay'

export const RecoveryCodeScreen = () => {
  const { completeSetup, identity, recoveryCode, setupKind } = useAuth()

  if (!identity || !recoveryCode) return null

  const restored = setupKind === 'restored'

  return (
    <main className="entry-main">
      <section className="panel w-full max-w-[36rem] p-5 sm:p-8">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm font-semibold text-signal-hover">AUTYCO</p>
          <p className="min-w-0 break-words text-sm text-muted sm:truncate">{identity.playerName} · {identity.garageName}</p>
        </div>
        <p className="eyebrow mt-8">{restored ? 'Partie restaurée' : 'Garage créé'}</p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
          Note ce code
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          {restored ? 'Il remplace ton ancien code.' : 'Il permet de retrouver ta partie sur un autre appareil.'}
        </p>

        <div className="mt-7" aria-labelledby="code-instructions">
          <RecoveryCodeDisplay code={recoveryCode} />
          <p id="code-instructions" className="mt-4 text-sm leading-6 text-muted">
            Garde-le privé : il donne accès à ta partie.
          </p>
          <button type="button" className="button-primary mt-6 w-full" onClick={completeSetup}>
            Entrer dans le garage
          </button>
        </div>
      </section>
    </main>
  )
}

import { useAuth } from '../backend/AuthContext'
import { RecoveryCodeDisplay } from './RecoveryCodeDisplay'

export const RecoveryCodeScreen = () => {
  const { completeSetup, identity, recoveryCode, setupKind } = useAuth()

  if (!identity || !recoveryCode) return null

  const restored = setupKind === 'restored'

  return (
    <main className="min-h-dvh bg-paper px-5 py-6 text-ink sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[74rem] flex-col border-2 border-ink bg-surface sm:min-h-[calc(100dvh-5rem)]">
        <header className="flex flex-col gap-2 border-b-4 border-signal bg-ink px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-signal">AUTYCO · Dossier 01</p>
          <p className="truncate text-sm text-white/60">{identity.playerName} · {identity.garageName}</p>
        </header>

        <div className="grid flex-1 gap-10 p-5 sm:p-8 lg:grid-cols-[1fr_0.95fr] lg:items-end lg:gap-16 lg:p-12">
          <section>
            <p className="eyebrow">{restored ? 'Partie restaurée' : 'Garage créé'}</p>
            <h1 className="mt-4 max-w-[9ch] font-display text-[clamp(3.5rem,8vw,7rem)] font-extrabold uppercase leading-[0.82] tracking-[-0.045em]">
              Garde cette clé au sec.
            </h1>
            <p className="mt-7 max-w-[42ch] border-l-4 border-signal pl-5 text-lg leading-8 text-muted">
              {restored
                ? 'L’ancien code vient d’être invalidé. Celui-ci est désormais le seul qui puisse déplacer ta partie vers un autre appareil.'
                : 'Elle est la seule façon de retrouver ta progression sur un autre appareil. Tu pourras toujours en obtenir une nouvelle dans Réglages.'}
            </p>
          </section>

          <section aria-labelledby="code-instructions">
            <RecoveryCodeDisplay code={recoveryCode} />
            <p id="code-instructions" className="mt-5 text-sm font-semibold leading-6 text-muted">
              Ne partage pas ce code. Il donne accès à toute la partie et n’est jamais envoyé par email.
            </p>
            <button type="button" className="button-primary mt-7 w-full" onClick={completeSetup}>
              J’ai noté mon code · Entrer dans le garage
            </button>
          </section>
        </div>

        <p className="border-t-2 border-ink bg-paper px-5 py-4 font-mono text-sm text-muted sm:px-8">
          128 bits aléatoires · code conservé uniquement sous forme hachée sur le serveur
        </p>
      </div>
    </main>
  )
}

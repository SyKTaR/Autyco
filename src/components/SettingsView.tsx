import { useEffect, useState } from 'react'
import { readableError, useAuth } from '../backend/AuthContext'
import { accentPresets, useAccentTheme } from '../theme/AccentTheme'
import { RecoveryCodeDisplay } from './RecoveryCodeDisplay'

export const SettingsView = () => {
  const auth = useAuth()
  const { accentId, setAccentId } = useAccentTheme()
  const [loadingCode, setLoadingCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRotation, setConfirmRotation] = useState(false)

  useEffect(() => {
    if (auth.status !== 'authenticated' || auth.recoveryCode) return
    let active = true
    setLoadingCode(true)
    auth.getRecoveryCode()
      .catch((loadError) => {
        if (active) setError(readableError(loadError))
      })
      .finally(() => {
        if (active) setLoadingCode(false)
      })
    return () => {
      active = false
    }
  }, [auth.status, auth.recoveryCode, auth.getRecoveryCode])

  const rotate = async () => {
    setError(null)
    setLoadingCode(true)
    try {
      await auth.rotateRecoveryCode()
      setConfirmRotation(false)
    } catch (rotationError) {
      setError(readableError(rotationError))
    } finally {
      setLoadingCode(false)
    }
  }

  const selectedAccent = accentPresets.find((preset) => preset.id === accentId)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-10 outline-none sm:px-6 sm:pt-14 md:pb-16 lg:px-8">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Configuration du garage</p>
          <h1 className="page-title">Réglages</h1>
          <p className="mt-4 max-w-[52ch] text-base leading-7 text-muted">
            Personnalise la signature visuelle de ton atelier et garde la main sur ta sauvegarde.
          </p>
        </div>
        <p className="rounded-2xl bg-signal-soft px-4 py-3 text-sm text-muted shadow-inset">
          Accent actif<br /><span className="mt-0.5 inline-block text-base font-semibold text-signal-hover">{selectedAccent?.label}</span>
        </p>
      </header>

      <section className="panel mt-8 overflow-hidden" aria-labelledby="appearance-title">
        <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
          <div>
            <p className="text-sm font-semibold text-signal-hover">Livrée du garage</p>
            <h2 id="appearance-title" className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
              Couleur d’accent
            </h2>
          </div>
          <p className="max-w-[42ch] text-sm leading-6 text-muted">
            Utilisée pour les actions prioritaires, puis mémorisée sur cet appareil.
          </p>
        </div>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3" role="group" aria-label="Choisir la couleur d’accent">
          {accentPresets.map((preset) => {
            const selected = preset.id === accentId
            return (
              <button
                key={preset.id}
                type="button"
                className={`flex min-h-14 items-center gap-3 rounded-2xl p-3 text-left shadow-inset transition-[background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${selected ? 'bg-signal-soft' : 'bg-soft/70 hover:-translate-y-0.5 hover:bg-soft'}`}
                aria-pressed={selected}
                onClick={() => setAccentId(preset.id)}
              >
                <span className="h-8 w-8 shrink-0 rounded-xl" style={{ backgroundColor: `rgb(${preset.accent})` }} aria-hidden="true" />
                <span className="min-w-0 flex-1 font-semibold">{preset.label}</span>
                <span className={`text-sm font-semibold ${selected ? 'text-signal-hover' : 'text-muted'}`} aria-hidden="true">{selected ? 'Actif' : 'Choisir'}</span>
              </button>
            )
          })}
        </div>
        <p className="sr-only" role="status" aria-live="polite">Couleur active : {selectedAccent?.label}.</p>
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <section aria-labelledby="identity-title">
          <p className="eyebrow">Fiche joueur</p>
          <h2 id="identity-title" className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em]">Identité</h2>
          <dl className="panel mt-5 overflow-hidden shadow-inset">
            <div className="grid grid-cols-[7rem_1fr] gap-4 border-b border-line p-4 sm:grid-cols-[9rem_1fr] sm:p-5">
              <dt className="data-label">Garage</dt>
              <dd className="min-w-0 break-words font-bold">{auth.identity?.garageName ?? 'Garage local'}</dd>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-4 p-4 sm:grid-cols-[9rem_1fr] sm:p-5">
              <dt className="data-label">Joueur</dt>
              <dd className="min-w-0 break-words font-bold">{auth.identity?.playerName ?? 'Sur cet appareil'}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="mt-7 inline-flex min-h-12 items-center rounded-full bg-danger/10 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            onClick={() => void auth.signOut()}
          >
            Retirer cette partie de l’appareil
          </button>
          <p className="mt-2 max-w-[42ch] text-sm leading-6 text-muted">
            La sauvegarde serveur n’est pas supprimée. Il faudra le code pour la récupérer ici.
          </p>
        </section>

        <section aria-labelledby="recovery-title">
          <p className="eyebrow">Clé de transfert</p>
          <h2 id="recovery-title" className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em]">Code de récupération</h2>
          <p className="mt-3 max-w-[54ch] text-sm leading-6 text-muted">
            Le code n’est jamais conservé en clair. Après un rechargement, en ouvrir un nouveau invalide automatiquement l’ancien.
          </p>

          <div className="mt-5" aria-live="polite">
            {auth.recoveryCode ? (
              <RecoveryCodeDisplay code={auth.recoveryCode} compact />
            ) : (
              <div className="flex min-h-44 items-center justify-center rounded-[1.5rem] bg-soft p-6 text-center text-sm text-muted shadow-inset">
                {loadingCode ? 'Génération sécurisée du code…' : 'Le code ne peut pas être affiché.'}
              </div>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm leading-6 text-warning" role="alert" aria-live="assertive">{error}</p>
          )}

          <div className="mt-6 border-t border-line pt-6">
            {confirmRotation ? (
              <div>
                <p className="text-sm font-bold">L’ancien code cessera immédiatement de fonctionner.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className="button-primary" disabled={loadingCode} onClick={() => void rotate()}>
                    {loadingCode ? 'Renouvellement…' : 'Confirmer le renouvellement'}
                  </button>
                  <button type="button" className="button-secondary" onClick={() => setConfirmRotation(false)}>Annuler</button>
                </div>
              </div>
            ) : (
              <button type="button" className="button-secondary" onClick={() => setConfirmRotation(true)}>Générer un nouveau code</button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

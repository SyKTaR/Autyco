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
      <header className="grid gap-6 border-b-2 border-ink pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Configuration du garage</p>
          <h1 className="page-title">Réglages</h1>
          <p className="mt-4 max-w-[52ch] text-base leading-7 text-muted">
            Personnalise la signature visuelle de ton atelier et garde la main sur ta sauvegarde.
          </p>
        </div>
        <p className="border-l-4 border-signal pl-4 font-display text-sm font-bold uppercase tracking-[0.08em] text-muted">
          Accent actif<br /><span className="text-lg text-ink">{selectedAccent?.label}</span>
        </p>
      </header>

      <section className="mt-8 border-2 border-ink bg-surface" aria-labelledby="appearance-title">
        <div className="grid gap-5 border-b-2 border-ink bg-ink p-5 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-[0.1em] text-white/50">Livrée du garage</p>
            <h2 id="appearance-title" className="mt-1 font-display text-3xl font-extrabold uppercase tracking-[-0.025em]">
              Couleur d’accent
            </h2>
          </div>
          <p className="max-w-[42ch] text-sm leading-6 text-white/60">
            Le choix s’applique aux actions et repères de progression, puis reste lié à ce garage sur cet appareil.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3" role="group" aria-label="Choisir la couleur d’accent">
          {accentPresets.map((preset) => {
            const selected = preset.id === accentId
            return (
              <button
                key={preset.id}
                type="button"
                className={`flex min-h-14 items-center gap-3 border-2 p-3 text-left transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${selected ? 'border-ink bg-paper' : 'border-line bg-white hover:border-ink'}`}
                aria-pressed={selected}
                onClick={() => setAccentId(preset.id)}
              >
                <span className="h-8 w-8 shrink-0 border-2 border-ink" style={{ backgroundColor: `rgb(${preset.accent})` }} aria-hidden="true" />
                <span className="min-w-0 flex-1 font-semibold">{preset.label}</span>
                <span className="font-display text-sm font-bold uppercase text-muted" aria-hidden="true">{selected ? 'Actif' : 'Choisir'}</span>
              </button>
            )
          })}
        </div>
        <p className="sr-only" role="status" aria-live="polite">Couleur active : {selectedAccent?.label}.</p>
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <section aria-labelledby="identity-title">
          <p className="eyebrow">Fiche joueur</p>
          <h2 id="identity-title" className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[-0.025em]">Identité</h2>
          <dl className="mt-5 border-2 border-ink bg-surface">
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
            className="mt-7 min-h-12 border-b-2 border-danger text-sm font-bold text-danger transition-colors hover:bg-[#ffe7e9]"
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
          <h2 id="recovery-title" className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[-0.025em]">Code de récupération</h2>
          <p className="mt-3 max-w-[54ch] text-sm leading-6 text-muted">
            Le code n’est jamais conservé en clair. Après un rechargement, en ouvrir un nouveau invalide automatiquement l’ancien.
          </p>

          <div className="mt-5" aria-live="polite">
            {auth.recoveryCode ? (
              <RecoveryCodeDisplay code={auth.recoveryCode} compact />
            ) : (
              <div className="flex min-h-44 items-center justify-center border-2 border-ink bg-soft p-6 text-center text-sm text-muted">
                {loadingCode ? 'Génération sécurisée du code…' : 'Le code ne peut pas être affiché.'}
              </div>
            )}
          </div>

          {error && (
            <p className="mt-4 border-2 border-warning bg-[#fff0d6] px-4 py-3 text-sm leading-6" role="alert" aria-live="assertive">{error}</p>
          )}

          <div className="mt-6 border-t-2 border-ink pt-6">
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

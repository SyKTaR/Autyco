import { useState, type FormEvent } from 'react'
import { readableError, useAuth } from '../backend/AuthContext'

type EntryMode = 'create' | 'restore'

const identityPattern = /^[\p{L}\p{N}][\p{L}\p{N} .&'’-]*$/u

const identityError = (value: string, label: string, maximum: number) => {
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > maximum) {
    return `${label} doit contenir entre 2 et ${maximum} caractères.`
  }
  if (!identityPattern.test(trimmed)) {
    return `${label} contient un caractère non accepté.`
  }
  return null
}

const formatRecoveryInput = (rawValue: string) => {
  const compact = rawValue.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 32)
  const groups = compact.match(/.{1,4}/g) ?? []
  return compact ? `GG-${groups.join('-')}` : ''
}

export const AuthScreen = () => {
  const { createPlayer, restorePlayer, useLocalMode, notice } = useAuth()
  const [mode, setMode] = useState<EntryMode>('create')
  const [garageName, setGarageName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (mode === 'create') {
      const validationError =
        identityError(garageName, 'Le nom du garage', 40)
        ?? identityError(playerName, 'Le pseudo', 30)
      if (validationError) {
        setError(validationError)
        return
      }
    } else if (recoveryCode.replace(/[^0-9A-F]/g, '').length !== 32) {
      setError('Le code doit contenir huit groupes de quatre caractères.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'create') await createPlayer(garageName, playerName)
      else await restorePlayer(recoveryCode)
    } catch (submitError) {
      setError(readableError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const changeMode = (nextMode: EntryMode) => {
    setMode(nextMode)
    setError(null)
  }

  return (
    <main className="grid min-h-dvh bg-paper text-ink lg:grid-cols-[minmax(22rem,0.9fr)_minmax(34rem,1.1fr)]">
      <section className="flex min-h-[22rem] flex-col justify-between border-b-4 border-signal bg-ink px-5 py-6 text-white sm:px-9 sm:py-8 lg:min-h-dvh lg:border-b-0 lg:border-r-4 lg:px-12 lg:py-10 xl:px-16">
        <div className="flex items-center justify-between border-b border-white/20 pb-4">
          <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-signal">AUTYCO · 01</p>
          <span className="font-mono text-xs text-white/40">PLAYER ACCESS</span>
        </div>

        <div className="py-10 lg:py-16">
          <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-white/45">Ton atelier commence ici</p>
          <h1 className="mt-5 max-w-[9ch] font-display text-[clamp(3.5rem,7.5vw,7rem)] font-extrabold uppercase leading-[0.82] tracking-[-0.045em]">
            Trouve. Prépare. Revends.
          </h1>
          <p className="mt-7 max-w-[38ch] border-l-4 border-signal pl-5 text-base leading-7 text-white/65">
            Monte ton parc véhicule affaire après affaire. Pas d’email, pas de mot de passe : deux noms suffisent pour prendre les clés.
          </p>
        </div>

        <div className="grid grid-cols-3 border-2 border-white/20 text-center font-mono text-xs text-white/50">
          <span className="border-r border-white/20 px-2 py-3">ACHAT</span>
          <span className="border-r border-white/20 px-2 py-3">ATELIER</span>
          <span className="px-2 py-3">VENTE</span>
        </div>
      </section>

      <section className="flex items-center px-4 py-8 sm:px-9 sm:py-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-[38rem] border-2 border-ink bg-surface shadow-[6px_6px_0_#11110f]">
          <div className="grid grid-cols-2 border-b-2 border-ink" aria-label="Choix du parcours">
            <button
              type="button"
              className={`min-h-14 border-r border-ink px-3 font-display text-sm font-bold uppercase tracking-[0.055em] transition-colors ${mode === 'create' ? 'bg-signal text-white' : 'bg-paper text-muted hover:bg-signal-soft hover:text-ink'}`}
              aria-pressed={mode === 'create'}
              onClick={() => changeMode('create')}
            >
              Nouveau garage
            </button>
            <button
              type="button"
              className={`min-h-14 border-l border-ink px-3 font-display text-sm font-bold uppercase tracking-[0.055em] transition-colors ${mode === 'restore' ? 'bg-signal text-white' : 'bg-paper text-muted hover:bg-signal-soft hover:text-ink'}`}
              aria-pressed={mode === 'restore'}
              onClick={() => changeMode('restore')}
            >
              Restaurer
            </button>
          </div>

          <div className="p-5 sm:p-8">
            <p className="eyebrow">{mode === 'create' ? 'Ouvrir l’atelier' : 'Changer d’appareil'}</p>
            <h2 className="mt-3 max-w-[12ch] font-display text-4xl font-extrabold uppercase leading-[0.92] tracking-[-0.03em] sm:text-5xl">
              {mode === 'create' ? 'Comment on t’appelle ?' : 'Retrouve ta partie.'}
            </h2>
            <p className="mt-4 max-w-[48ch] text-base leading-7 text-muted">
              {mode === 'create'
                ? 'Ces deux noms restent privés pour le moment. Tu entreras dans le jeu après avoir noté ton code.'
                : 'La restauration déplace la sauvegarde vers cet appareil et renouvelle automatiquement le code secret.'}
            </p>

            <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
              {mode === 'create' ? (
                <>
                  <label className="block">
                    <span className="data-label text-ink">Nom du garage</span>
                    <input
                      required
                      type="text"
                      autoComplete="organization"
                      minLength={2}
                      maxLength={40}
                      value={garageName}
                      onChange={(event) => setGarageName(event.target.value)}
                      className="form-input mt-2 min-h-14 text-lg"
                      placeholder="Garage des Docks"
                    />
                  </label>
                  <label className="block">
                    <span className="data-label text-ink">Ton pseudo</span>
                    <input
                      required
                      type="text"
                      autoComplete="nickname"
                      minLength={2}
                      maxLength={30}
                      value={playerName}
                      onChange={(event) => setPlayerName(event.target.value)}
                      className="form-input mt-2 min-h-14 text-lg"
                      placeholder="Lucas"
                    />
                  </label>
                </>
              ) : (
                <label className="block">
                  <span className="data-label text-ink">Code de récupération</span>
                  <input
                    required
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(formatRecoveryInput(event.target.value))}
                    className="form-input mt-2 min-h-16 font-mono text-base font-bold tracking-[0.025em] sm:text-lg"
                    placeholder="GG-0000-0000-0000-…"
                    aria-describedby="recovery-help"
                  />
                  <span id="recovery-help" className="mt-3 block text-sm leading-6 text-muted">
                    Colle le code complet. Les tirets et les espaces sont remis en forme automatiquement.
                  </span>
                </label>
              )}

              {(error || notice) && (
                <p className={`border-2 border-l-[0.5rem] px-4 py-3 text-sm font-semibold leading-6 ${error ? 'border-warning bg-[#fff0d6]' : 'border-signal bg-signal-soft'}`} role="status" aria-live="polite">
                  {error ?? notice}
                </p>
              )}

              <button type="submit" className="button-primary w-full sm:w-auto" disabled={submitting}>
                {submitting
                  ? mode === 'create' ? 'Création du garage…' : 'Restauration en cours…'
                  : mode === 'create' ? 'Créer mon garage' : 'Restaurer ma partie'}
              </button>
            </form>

            <div className="mt-8 border-t-2 border-ink pt-5">
              <button
                type="button"
                className="min-h-11 border-b-2 border-muted text-sm font-bold text-muted transition-colors hover:border-ink hover:text-ink"
                onClick={() => useLocalMode()}
              >
                Continuer uniquement sur cet appareil
              </button>
              <p className="mt-2 text-sm leading-5 text-muted">Sans compte ni sauvegarde sur le serveur.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

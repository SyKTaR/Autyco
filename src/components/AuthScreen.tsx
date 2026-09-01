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
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8 text-ink sm:px-6">
      <section className="w-full max-w-[34rem]">
        <div className="mb-6 flex items-center justify-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-signal-soft text-signal shadow-inset" aria-hidden="true">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13.5 6 7h12l3 6.5M5 18h14M6.5 18v2m11-2v2M4 13.5h16V18H4z" />
            </svg>
          </span>
          <p className="font-display text-2xl font-semibold tracking-[-0.035em]">AUTYCO</p>
        </div>

        <div className="panel overflow-hidden">
          <div className="m-2 grid grid-cols-2 rounded-full bg-paper/75 p-1" aria-label="Choix du parcours">
            <button
              type="button"
              className={`min-h-12 rounded-full px-3 text-sm font-semibold transition-colors ${mode === 'create' ? 'bg-drive text-paper shadow-card' : 'text-muted hover:bg-soft hover:text-ink'}`}
              aria-pressed={mode === 'create'}
              onClick={() => changeMode('create')}
            >
              Nouveau garage
            </button>
            <button
              type="button"
              className={`min-h-12 rounded-full px-3 text-sm font-semibold transition-colors ${mode === 'restore' ? 'bg-drive text-paper shadow-card' : 'text-muted hover:bg-soft hover:text-ink'}`}
              aria-pressed={mode === 'restore'}
              onClick={() => changeMode('restore')}
            >
              Restaurer
            </button>
          </div>

          <div className="p-5 pt-6 sm:p-8 sm:pt-7">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              {mode === 'create' ? 'Crée ton garage' : 'Retrouve ta partie'}
            </h1>

            <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
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
                <p className={`rounded-2xl px-4 py-3 text-sm font-semibold leading-6 ${error ? 'bg-warning/10 text-warning' : 'bg-signal-soft text-signal-hover'}`} role="status" aria-live="polite">
                  {error ?? notice}
                </p>
              )}

              <button type="submit" className="button-primary w-full sm:w-auto" disabled={submitting}>
                {submitting
                  ? mode === 'create' ? 'Création du garage…' : 'Restauration en cours…'
                  : mode === 'create' ? 'Créer mon garage' : 'Restaurer ma partie'}
              </button>
            </form>

            <div className="mt-6 border-t border-line pt-5 text-center">
              <button
                type="button"
                className="text-action text-muted hover:text-ink"
                onClick={() => useLocalMode()}
              >
                Continuer en mode local
              </button>
            </div>
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-muted">Aucun email ni mot de passe requis.</p>
      </section>
    </main>
  )
}

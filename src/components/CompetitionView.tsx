import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { readableError, useAuth } from '../backend/AuthContext'
import type {
  PrivateServerLeaderboard,
  PrivateServerMutation,
  PrivateServerSummary,
} from '../backend/supabase'
import { formatMoney } from '../game/format'

export interface ServerInviteCode {
  serverId: string
  code: string
}

interface CompetitionViewProps {
  inviteCode: ServerInviteCode | null
  onInviteCodeChange: (inviteCode: ServerInviteCode | null) => void
}

type PendingChange =
  | { kind: 'create'; value: string }
  | { kind: 'join'; value: string }

const normalizeInviteCode = (value: string) =>
  value.toUpperCase().replace(/[^0-9A-Z-]/g, '').slice(0, 43)

const InviteCodePanel = ({
  code,
  loading,
  onRotate,
}: {
  code: string | null
  loading: boolean
  onRotate: () => void
}) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="rounded-[1.5rem] bg-paper/70 p-5 shadow-inset sm:p-6" aria-labelledby="invite-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-signal-hover">Invitation privée</p>
          <h2 id="invite-title" className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em]">
            Code du serveur
          </h2>
        </div>
        <span className="status-pill w-fit bg-success/10 text-success">128 bits · haché</span>
      </div>

      {code ? (
        <output className="mt-6 block break-words font-mono text-lg font-bold leading-relaxed tracking-[0.035em] sm:text-xl">
          {code}
        </output>
      ) : (
        <p className="mt-6 text-sm leading-6 text-muted">
          {loading ? 'Génération sécurisée du code…' : 'Le code en clair n’est pas conservé.'}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {code && (
          <button type="button" className="button-secondary" onClick={() => void copy()}>
            {copied ? 'Code copié' : 'Copier le code'}
          </button>
        )}
        <button type="button" className="text-action" disabled={loading} onClick={onRotate}>
          Générer un nouveau code
        </button>
      </div>
      <p className="mt-4 max-w-[60ch] text-sm leading-6 text-muted">
        Un nouveau code invalide immédiatement le précédent pour tous les membres. Partage-le uniquement avec les personnes que tu veux inviter.
      </p>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Le code d’invitation a été copié.' : ''}
      </span>
    </section>
  )
}

const MembershipForms = ({
  switching,
  busy,
  onCreate,
  onJoin,
  onCancel,
}: {
  switching: boolean
  busy: boolean
  onCreate: (name: string) => void
  onJoin: (code: string) => void
  onCancel?: () => void
}) => {
  const [serverName, setServerName] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    onCreate(serverName)
  }

  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    onJoin(inviteCode)
  }

  return (
    <section className={switching ? 'mt-6' : 'mt-10'} aria-labelledby="membership-actions-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Accès sur invitation</p>
          <h2 id="membership-actions-title" className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em]">
            {switching ? 'Changer de serveur' : 'Ouvre ta dépendance'}
          </h2>
        </div>
        {onCancel && (
          <button type="button" className="button-secondary" onClick={onCancel}>Annuler</button>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <form className="panel p-5 sm:p-6" onSubmit={submitCreate}>
          <p className="text-sm font-semibold text-signal-hover">Créer</p>
          <h3 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em]">Nouveau serveur</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted">
            Donne un nom à ton groupe. Le premier code d’invitation sera affiché juste après.
          </p>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold">Nom du serveur</span>
            <input
              className="form-input"
              value={serverName}
              onChange={(event) => setServerName(event.target.value)}
              minLength={2}
              maxLength={40}
              autoComplete="off"
              placeholder="Les routiers du dimanche"
              required
            />
          </label>
          <button type="submit" className="button-primary mt-5 w-full sm:w-auto" disabled={busy || serverName.trim().length < 2}>
            Créer le serveur
          </button>
        </form>

        <form className="panel p-5 sm:p-6" onSubmit={submitJoin}>
          <p className="text-sm font-semibold text-drive">Rejoindre</p>
          <h3 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em]">Code d’un pote</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted">
            Colle le code reçu. Les serveurs ne sont jamais publics ni découvrables.
          </p>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold">Code d’invitation</span>
            <input
              className="form-input font-mono uppercase"
              value={inviteCode}
              onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="SRV-0000-0000-…"
              required
            />
          </label>
          <button type="submit" className="button-secondary mt-5 w-full sm:w-auto" disabled={busy || inviteCode.length < 32}>
            Rejoindre le serveur
          </button>
        </form>
      </div>
    </section>
  )
}

const Leaderboard = ({
  leaderboard,
  refreshing,
  onRefresh,
}: {
  leaderboard: PrivateServerLeaderboard | null
  refreshing: boolean
  onRefresh: () => void
}) => (
  <section className="mt-10" aria-labelledby="leaderboard-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">Lecture seule</p>
        <h2 id="leaderboard-title" className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em]">
          Classement de la dépendance
        </h2>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-muted">
          Score = trésorerie + valeur de revente estimée du parc actif, calculée par le serveur.
        </p>
      </div>
      <button type="button" className="button-secondary" disabled={refreshing} onClick={onRefresh}>
        {refreshing ? 'Actualisation…' : 'Actualiser'}
      </button>
    </div>

    <div className="panel mt-6 overflow-hidden" aria-live="polite">
      {!leaderboard ? (
        <p className="p-6 text-sm text-muted">Chargement du classement…</p>
      ) : leaderboard.members.length === 0 ? (
        <p className="p-6 text-sm text-muted">Aucun membre à classer pour le moment.</p>
      ) : (
        <ol className="divide-y divide-line">
          {leaderboard.members.map((member) => (
            <li
              key={member.playerId}
              className={`grid gap-5 p-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-6 lg:grid-cols-[3rem_minmax(12rem,1.4fr)_repeat(3,minmax(8rem,0.7fr))] lg:items-center ${member.isCurrentPlayer ? 'bg-signal-soft/45' : ''}`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-soft font-mono text-lg font-bold text-ink shadow-inset" aria-label={`Rang ${member.rank}`}>
                {member.rank}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-bold">{member.playerName}</p>
                  {member.isCurrentPlayer && <span className="status-pill bg-signal-soft text-signal-hover">Toi</span>}
                </div>
                <p className="mt-1 truncate text-sm text-muted">{member.garageName} · {member.vehicleCount} véhicule{member.vehicleCount > 1 ? 's' : ''}</p>
              </div>
              <dl className="contents">
                <div>
                  <dt className="data-label">Trésorerie</dt>
                  <dd className="mt-1 font-mono font-semibold">{formatMoney(member.cash)}</dd>
                </div>
                <div>
                  <dt className="data-label">Valeur du parc</dt>
                  <dd className="mt-1 font-mono font-semibold">{formatMoney(member.fleetValue)}</dd>
                </div>
                <div>
                  <dt className="data-label">Score total</dt>
                  <dd className="mt-1 font-mono text-lg font-bold text-signal-hover">{formatMoney(member.totalValue)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </div>
  </section>
)

export const CompetitionView = ({ inviteCode, onInviteCodeChange }: CompetitionViewProps) => {
  const auth = useAuth()
  const [server, setServer] = useState<PrivateServerSummary | null>(null)
  const [leaderboard, setLeaderboard] = useState<PrivateServerLeaderboard | null>(null)
  const [loading, setLoading] = useState(auth.status === 'authenticated')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showSwitch, setShowSwitch] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inviteRequestRef = useRef<Promise<string> | null>(null)

  const refreshLeaderboard = useCallback(async (silent = false) => {
    if (!server) return
    if (!silent) setRefreshing(true)
    try {
      const nextLeaderboard = await auth.getPrivateServerLeaderboard()
      setLeaderboard(nextLeaderboard)
      setServer(nextLeaderboard.server)
      setError(null)
    } catch (refreshError) {
      if (!silent) setError(readableError(refreshError))
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [auth.getPrivateServerLeaderboard, server])

  const rotateInvite = useCallback(async (serverId: string) => {
    inviteRequestRef.current ??= auth.rotatePrivateServerInvite()
      .finally(() => {
        inviteRequestRef.current = null
      })
    const code = await inviteRequestRef.current
    onInviteCodeChange({ serverId, code })
    return code
  }, [auth.rotatePrivateServerInvite, onInviteCodeChange])

  const load = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const currentServer = await auth.getCurrentPrivateServer()
      setServer(currentServer)
      setLeaderboard(null)
      if (currentServer) {
        const tasks: Promise<unknown>[] = [auth.getPrivateServerLeaderboard().then(setLeaderboard)]
        if (inviteCode?.serverId !== currentServer.id) {
          tasks.push(rotateInvite(currentServer.id))
        }
        await Promise.all(tasks)
      } else {
        onInviteCodeChange(null)
      }
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }, [
    auth.status,
    auth.getCurrentPrivateServer,
    auth.getPrivateServerLeaderboard,
    inviteCode?.serverId,
    onInviteCodeChange,
    rotateInvite,
  ])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!server) return
    const interval = window.setInterval(() => {
      void refreshLeaderboard(true)
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [refreshLeaderboard, server])

  const applyMutation = async (result: PrivateServerMutation) => {
    if (!result.ok || !result.server) {
      if (result.requiresConfirmation) return false
      setError(result.error ?? 'Le serveur a refusé cette opération.')
      return false
    }
    setServer(result.server)
    setShowSwitch(false)
    setPendingChange(null)
    setConfirmLeave(false)
    setError(null)
    if (result.inviteCode) {
      onInviteCodeChange({ serverId: result.server.id, code: result.inviteCode })
    } else {
      onInviteCodeChange(null)
    }
    setLeaderboard(await auth.getPrivateServerLeaderboard())
    return true
  }

  const runChange = async (change: PendingChange, replaceCurrent = false) => {
    setBusy(true)
    setError(null)
    try {
      const result = change.kind === 'create'
        ? await auth.createPrivateServer(change.value, replaceCurrent)
        : await auth.joinPrivateServer(change.value, replaceCurrent)
      if (result.requiresConfirmation && !replaceCurrent) {
        setPendingChange(change)
        return
      }
      await applyMutation(result)
    } catch (changeError) {
      setError(readableError(changeError))
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    setBusy(true)
    setError(null)
    try {
      await auth.leavePrivateServer()
      setServer(null)
      setLeaderboard(null)
      setConfirmLeave(false)
      setShowSwitch(false)
      onInviteCodeChange(null)
    } catch (leaveError) {
      setError(readableError(leaveError))
    } finally {
      setBusy(false)
    }
  }

  const close = async () => {
    if (!server) return
    setBusy(true)
    setError(null)
    try {
      await auth.closePrivateServer(server.id)
      setServer(null)
      setLeaderboard(null)
      setConfirmClose(false)
      setShowSwitch(false)
      onInviteCodeChange(null)
    } catch (closeError) {
      setError(readableError(closeError))
    } finally {
      setBusy(false)
    }
  }

  if (auth.status !== 'authenticated') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-10 outline-none sm:px-6 sm:pt-14 md:pb-16 lg:px-8">
        <p className="eyebrow">Multijoueur privé</p>
        <h1 className="page-title">Compétition</h1>
        <section className="panel mt-8 max-w-2xl p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold">Connexion requise</h2>
          <p className="mt-3 text-base leading-7 text-muted">
            Les serveurs privés et leur classement vivent sur Supabase. Ta partie locale reste intacte, mais elle ne peut pas rejoindre une dépendance.
          </p>
          {auth.configured && <button type="button" className="button-primary mt-6" onClick={auth.showEntry}>Se connecter</button>}
        </section>
      </main>
    )
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-10 outline-none sm:px-6 sm:pt-14 md:pb-16 lg:px-8">
      <header className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Entre potes uniquement</p>
          <h1 className="page-title">Compétition</h1>
          <p className="mt-4 max-w-[58ch] text-base leading-7 text-muted">
            Une dépendance privée, un code d’accès et un classement sans interaction avec le garage des autres.
          </p>
        </div>
        {server && (
          <p className="w-fit rounded-2xl bg-drive-soft px-4 py-3 text-sm text-muted shadow-inset">
            Membres<br /><span className="mt-0.5 inline-block font-mono text-lg font-bold text-drive">{server.memberCount}</span>
          </p>
        )}
      </header>

      {error && (
        <p className="mt-6 rounded-2xl bg-warning/10 px-4 py-3 text-sm leading-6 text-warning" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {pendingChange && (
        <section className="mt-6 rounded-[1.5rem] bg-warning/10 p-5 shadow-inset" aria-labelledby="replace-server-title">
          <h2 id="replace-server-title" className="font-display text-xl font-semibold text-warning">Remplacer ta dépendance actuelle ?</h2>
          <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">
            Tu perdras immédiatement l’accès au classement et au code de <strong className="text-ink">{server?.name}</strong>. Ta progression solo ne change pas.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="button-primary" disabled={busy} onClick={() => void runChange(pendingChange, true)}>
              {busy ? 'Changement…' : 'Confirmer le changement'}
            </button>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setPendingChange(null)}>Garder ce serveur</button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="panel mt-8 flex min-h-52 items-center justify-center p-6 text-sm text-muted" role="status">
          Chargement de la dépendance…
        </div>
      ) : !server ? (
        <MembershipForms
          switching={false}
          busy={busy}
          onCreate={(name) => void runChange({ kind: 'create', value: name })}
          onJoin={(code) => void runChange({ kind: 'join', value: code })}
        />
      ) : (
        <>
          <section className="panel mt-8 overflow-hidden">
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)] lg:p-8">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-drive">Dépendance active</p>
                  {server.isOwner && <span className="status-pill bg-signal-soft text-signal-hover">Toi · créateur</span>}
                </div>
                <h2 className="mt-2 max-w-[22ch] font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{server.name}</h2>
                <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted">
                  Le classement est strictement consultatif. Aucun membre ne peut acheter, modifier ou contacter le garage d’un autre depuis cet écran.
                  {server.isOwner && ' Ce serveur reste ouvert tant que tu ne le fermes pas, même s’il n’a plus aucun membre.'}
                </p>
              </div>
              <InviteCodePanel
                code={inviteCode?.serverId === server.id ? inviteCode.code : null}
                loading={busy || Boolean(inviteRequestRef.current)}
                onRotate={() => {
                  setBusy(true)
                  setError(null)
                  void rotateInvite(server.id)
                    .catch((rotateError) => setError(readableError(rotateError)))
                    .finally(() => setBusy(false))
                }}
              />
            </div>
          </section>

          <Leaderboard leaderboard={leaderboard} refreshing={refreshing} onRefresh={() => void refreshLeaderboard()} />

          {showSwitch && (
            <MembershipForms
              switching
              busy={busy}
              onCreate={(name) => void runChange({ kind: 'create', value: name })}
              onJoin={(code) => void runChange({ kind: 'join', value: code })}
              onCancel={() => setShowSwitch(false)}
            />
          )}

          <section className="mt-10 border-t border-line pt-6" aria-labelledby="server-actions-title">
            <h2 id="server-actions-title" className="text-lg font-semibold">Gestion de l’appartenance</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {!showSwitch && <button type="button" className="button-secondary" onClick={() => setShowSwitch(true)}>Changer de serveur</button>}
              {confirmLeave ? (
                <>
                  <button type="button" className="inline-flex min-h-12 items-center rounded-full bg-danger/10 px-5 text-sm font-bold text-danger" disabled={busy} onClick={() => void leave()}>
                    {busy ? 'Départ…' : 'Confirmer le départ'}
                  </button>
                  <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmLeave(false)}>Annuler</button>
                </>
              ) : (
                <button type="button" className="inline-flex min-h-12 items-center rounded-full px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger" onClick={() => setConfirmLeave(true)}>
                  Quitter le serveur
                </button>
              )}
            </div>
            {confirmLeave && <p className="mt-3 text-sm leading-6 text-muted">Ton garage et ta progression restent intacts. Tu perdras seulement l’accès à cette dépendance.</p>}

            {server.isOwner && (
              <>
                <h3 className="mt-8 text-sm font-semibold text-warning">Zone du créateur</h3>
                <div className="mt-3 flex flex-wrap gap-3">
                  {confirmClose ? (
                    <>
                      <button type="button" className="inline-flex min-h-12 items-center rounded-full bg-danger/10 px-5 text-sm font-bold text-danger" disabled={busy} onClick={() => void close()}>
                        {busy ? 'Fermeture…' : 'Confirmer la fermeture définitive'}
                      </button>
                      <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmClose(false)}>Annuler</button>
                    </>
                  ) : (
                    <button type="button" className="inline-flex min-h-12 items-center rounded-full bg-danger/10 px-5 text-sm font-bold text-danger transition-colors hover:bg-danger/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger" onClick={() => setConfirmClose(true)}>
                      Fermer définitivement le serveur
                    </button>
                  )}
                </div>
                {confirmClose && (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Le serveur, son code et son classement disparaissent pour tous les membres. C’est irréversible ; ce n’est pas ce qui se passe quand des membres partent, le serveur reste ouvert jusqu’à cette action.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}

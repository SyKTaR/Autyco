import { useAuth } from '../backend/AuthContext'

export type AppView = 'garage' | 'market' | 'real-estate' | 'competition' | 'settings'

interface AppHeaderProps {
  view: AppView
  onViewChange: (view: AppView) => void
  attention: Partial<Record<AppView, number>>
}

const NavIcon = ({ view }: { view: AppView }) => {
  const paths: Record<AppView, React.ReactNode> = {
    garage: <path d="M3 11.5 5.5 6h13l2.5 5.5M5 17h14M6.5 17v2m11-2v2M4 12h16v5H4zM7 14.5h.01M17 14.5h.01" />,
    market: <path d="M4 6h16l-1.5 5H5.5L4 6Zm2 5v8m12-8v8M8.5 15h7M7 3v3m10-3v3" />,
    'real-estate': <path d="M4 20V8l8-4 8 4v12M8 20v-7h8v7M9 9h.01M15 9h.01" />,
    competition: <path d="M8 4h8v3.5a4 4 0 0 1-8 0V4Zm0 2H4v1.5A3.5 3.5 0 0 0 7.5 11M16 6h4v1.5a3.5 3.5 0 0 1-3.5 3.5M12 11.5V16m-4 4h8m-6-4h4" />,
    settings: <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm0-11.75v2M12 18.5v2M3.5 12h2M18.5 12h2M5.99 5.99l1.42 1.42m9.18 9.18 1.42 1.42M18.01 5.99l-1.42 1.42m-9.18 9.18-1.42 1.42" />,
  }

  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[view]}
    </svg>
  )
}

const NavButton = ({
  active,
  target,
  label,
  attentionCount = 0,
  onClick,
}: {
  active: boolean
  target: AppView
  label: string
  attentionCount?: number
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 py-1.5 text-sm font-semibold leading-none tracking-[-0.02em] transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal md:min-h-12 md:flex-none md:flex-row md:justify-start md:gap-2 md:rounded-full md:px-4 md:py-2 md:tracking-normal ${
      active
        ? 'bg-drive text-paper shadow-card'
        : 'text-muted hover:bg-soft hover:text-ink'
    }`}
    aria-current={active ? 'page' : undefined}
    aria-label={
      attentionCount > 0
        ? `${label}, ${attentionCount} action${attentionCount > 1 ? 's' : ''} disponible${attentionCount > 1 ? 's' : ''}`
        : label
    }
  >
    <NavIcon view={target} />
    <span className="block max-w-full truncate md:hidden xl:block">{label}</span>
    {attentionCount > 0 && (
      <span className="absolute right-1 top-1 min-w-5 rounded-full bg-signal px-1.5 py-1 font-mono text-[0.6875rem] font-bold leading-none text-paper md:-right-1 md:-top-1" aria-hidden="true">
        {attentionCount > 9 ? '9+' : attentionCount}
      </span>
    )}
  </button>
)

export const AppHeader = ({ view, onViewChange, attention }: AppHeaderProps) => {
  const { identity } = useAuth()

  return (
    <>
      <header className="bg-paper px-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-ink sm:px-5 sm:pt-4">
        <div className="mx-auto flex min-h-[5rem] w-full max-w-[82rem] items-center justify-between gap-5 rounded-[1.75rem] bg-surface px-4 shadow-card shadow-inset sm:px-6">
          <button
            type="button"
            onClick={() => onViewChange('garage')}
            className="group flex min-h-12 min-w-0 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal"
            aria-label="Retour au garage"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-soft text-signal shadow-inset" aria-hidden="true">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 13.5 6 7h12l3 6.5M5 18h14M6.5 18v2m11-2v2M4 13.5h16V18H4z" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block max-w-[13rem] truncate font-display text-xl font-bold leading-none tracking-[-0.035em] sm:max-w-[20rem] sm:text-2xl">
                {identity?.garageName ?? 'AUTYCO'}
              </span>
              <span className="mt-1.5 block max-w-[13rem] truncate text-sm text-muted sm:max-w-[20rem]">
                {identity ? `${identity.playerName} · parc automobile` : 'Achat · préparation · vente'}
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 rounded-full bg-paper/75 p-1 md:flex" aria-label="Navigation principale">
            <NavButton active={view === 'garage'} target="garage" label="Garage" attentionCount={attention.garage} onClick={() => onViewChange('garage')} />
            <NavButton active={view === 'market'} target="market" label="Marché" onClick={() => onViewChange('market')} />
            <NavButton active={view === 'real-estate'} target="real-estate" label="Immobilier" attentionCount={attention['real-estate']} onClick={() => onViewChange('real-estate')} />
            <NavButton active={view === 'competition'} target="competition" label="Compétition" onClick={() => onViewChange('competition')} />
            <NavButton active={view === 'settings'} target="settings" label="Réglages" onClick={() => onViewChange('settings')} />
          </nav>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 rounded-t-[1.75rem] bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-raised shadow-inset md:hidden"
        aria-label="Navigation principale mobile"
      >
        <NavButton active={view === 'garage'} target="garage" label="Garage" attentionCount={attention.garage} onClick={() => onViewChange('garage')} />
        <NavButton active={view === 'market'} target="market" label="Marché" onClick={() => onViewChange('market')} />
        <NavButton active={view === 'real-estate'} target="real-estate" label="Locaux" attentionCount={attention['real-estate']} onClick={() => onViewChange('real-estate')} />
        <NavButton active={view === 'competition'} target="competition" label="Serveur" onClick={() => onViewChange('competition')} />
        <NavButton active={view === 'settings'} target="settings" label="Réglages" onClick={() => onViewChange('settings')} />
      </nav>
    </>
  )
}

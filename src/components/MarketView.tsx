import { useState, type KeyboardEvent } from 'react'
import { useGame } from '../context/GameContext'
import { getGarageCapacity, MARKET_CONFIG, MARKET_TIERS } from '../game/engine'
import { formatMoney, formatNumber, formatRemaining, riskLabel } from '../game/format'
import type { MarketListing, MarketTier, RiskLevel } from '../types/game'
import { StatusBadge, type StatusTone } from './ui/StatusBadge'
import { InventoryCard } from './ui/InventoryCard'
import { VehicleAvatar } from './ui/VehicleAvatar'

const riskTone: Record<RiskLevel, StatusTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
}

const marketMeta: Record<
  MarketTier,
  { label: string; shortLabel: string; description: string; tone: StatusTone }
> = {
  standard: {
    label: 'Occasion courante',
    shortLabel: 'Occasion',
    description: 'Des affaires accessibles qui tournent vite, pour alimenter le garage au quotidien.',
    tone: 'neutral',
  },
  premium: {
    label: 'Import / Premium',
    shortLabel: 'Premium',
    description: 'Des modèles plus valorisés, moins nombreux et renouvelés à un rythme plus posé.',
    tone: 'inverse',
  },
  collector: {
    label: 'Rare / Collection',
    shortLabel: 'Collection',
    description: 'Deux pièces au maximum par rotation. Une opportunité partie ne revient pas immédiatement.',
    tone: 'accent',
  },
}

const MarketRow = ({
  listing,
  now,
  canBuy,
  disabledReason,
  onBuy,
  onIgnore,
}: {
  listing: MarketListing
  now: number
  canBuy: boolean
  disabledReason: string
  onBuy: () => void
  onIgnore: () => void
}) => {
  const discount = Math.round((1 - listing.askingPrice / listing.marketValue) * 100)
  const meta = marketMeta[listing.market]

  return (
    <InventoryCard className="group relative overflow-hidden transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-raised lg:rounded-none lg:border-b lg:border-line lg:bg-transparent lg:shadow-none lg:hover:translate-y-0 lg:hover:bg-soft/60 lg:hover:shadow-none lg:last:border-b-0">
      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(12rem,1.45fr)_minmax(9rem,0.85fr)_minmax(10rem,0.9fr)_auto] lg:items-center lg:gap-6 lg:px-7 lg:py-6">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <VehicleAvatar compact />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-muted">
                    {listing.maker} · {listing.segment}
                  </p>
                  <StatusBadge tone={meta.tone} className="lg:hidden">{meta.shortLabel}</StatusBadge>
                </div>
                <h2 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[1.7rem]">
                  {listing.model}
                </h2>
              </div>
            </div>
            <StatusBadge className="shrink-0 font-mono lg:hidden">{listing.year}</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-muted">
            {listing.year} · {formatNumber(listing.mileage)} km
          </p>
        </div>

        <div className="subtle-card grid grid-cols-2 gap-3 p-4 lg:block lg:bg-transparent lg:p-0 lg:shadow-none">
          <div>
            <p className="data-label">Prix vendeur</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-[-0.05em] text-ink">
              {formatMoney(listing.askingPrice)}
            </p>
          </div>
          <div className="lg:mt-2">
            <p className="data-label">Valeur estimée</p>
            <p className="mt-1 text-sm font-bold text-success">
              {formatMoney(listing.marketValue)} <span className="font-normal">· −{discount}%</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:block">
          <StatusBadge tone={riskTone[listing.risk]}>{riskLabel[listing.risk]}</StatusBadge>
          <StatusBadge tone={meta.tone} className="hidden lg:inline-flex">{meta.shortLabel}</StatusBadge>
          <p className="text-sm text-muted lg:mt-2">{listing.conditionHint}</p>
          <p className="w-full font-mono text-sm text-muted lg:mt-1">
            disparaît dans {formatRemaining(listing.expiresAt, now)}
          </p>
        </div>

        <div className="flex gap-2 lg:justify-end">
          <button type="button" className="button-secondary flex-1 lg:flex-none" onClick={onIgnore}>
            Ignorer
          </button>
          <button
            type="button"
            className="button-primary flex-[1.35] lg:flex-none"
            onClick={onBuy}
            disabled={!canBuy}
            title={!canBuy ? disabledReason : undefined}
          >
            Acheter
          </button>
        </div>
      </div>
    </InventoryCard>
  )
}

export const MarketView = () => {
  const { state, now, dispatch } = useGame()
  const [activeMarket, setActiveMarket] = useState<MarketTier>('standard')
  const garageCapacity = getGarageCapacity(state)
  const garageFull = state.vehicles.length >= garageCapacity
  const listings = state.listings.filter((listing) => listing.market === activeMarket)
  const activeMeta = marketMeta[activeMarket]
  const target = MARKET_CONFIG[activeMarket].target
  const freeSlots = Math.max(0, garageCapacity - state.vehicles.length)
  const moveMarketFocus = (
    market: MarketTier,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const currentIndex = MARKET_TIERS.indexOf(market)
    const targetIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? MARKET_TIERS.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % MARKET_TIERS.length
          : event.key === 'ArrowLeft'
            ? (currentIndex - 1 + MARKET_TIERS.length) % MARKET_TIERS.length
            : null
    if (targetIndex === null) return
    event.preventDefault()
    const nextMarket = MARKET_TIERS[targetIndex]
    setActiveMarket(nextMarket)
    window.requestAnimationFrame(() => document.getElementById(`market-tab-${nextMarket}`)?.focus())
  }

  return (
    <main id="main-content" tabIndex={-1} className="app-main">
      <header className="mb-7 flex flex-col justify-between gap-6 sm:flex-row sm:items-end lg:mb-8">
        <div>
          <p className="eyebrow">Petites annonces en direct</p>
          <h1 className="page-title">Le marché</h1>
          <p className="mt-3 max-w-[52ch] text-base leading-6 text-muted">
            Trois rythmes, trois niveaux d’engagement. Achète plusieurs véhicules sans quitter le marché,
            tant que ta trésorerie et tes places le permettent.
          </p>
        </div>
        <div className="flex items-center justify-between gap-5 rounded-2xl bg-drive-soft px-4 py-3 shadow-inset sm:block sm:min-w-[10rem] sm:text-right">
          <p className="font-mono text-3xl font-bold leading-none text-drive">{freeSlots}</p>
          <p className="text-sm font-semibold text-muted sm:mt-1">
            place{freeSlots > 1 ? 's' : ''} libre{freeSlots > 1 ? 's' : ''}
          </p>
        </div>
      </header>

      {garageFull && (
        <div className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm font-semibold leading-5 text-warning" role="status" aria-live="polite">
          Ton garage est complet. Tu peux encore comparer les annonces, mais pas acheter avant d’avoir libéré une place.
        </div>
      )}

      <div className="mb-5 overflow-x-auto pb-1" role="tablist" aria-label="Gammes du marché">
        <div className="grid min-w-[41rem] grid-cols-3 gap-2 rounded-[1.4rem] bg-soft/55 p-1.5 sm:min-w-0">
          {MARKET_TIERS.map((market) => {
            const meta = marketMeta[market]
            const count = state.listings.filter((listing) => listing.market === market).length
            const selected = activeMarket === market
            return (
              <button
                key={market}
                id={`market-tab-${market}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`market-panel-${market}`}
                tabIndex={selected ? 0 : -1}
                className={`min-h-12 rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                  selected ? 'bg-surface text-ink shadow-card' : 'text-muted hover:bg-surface/55 hover:text-ink'
                }`}
                onClick={() => setActiveMarket(market)}
                onKeyDown={(event) => moveMarketFocus(market, event)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold sm:text-[0.9375rem]">{meta.label}</span>
                  <span className="font-mono text-sm font-bold">{count}/{MARKET_CONFIG[market].target}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <section
        id={`market-panel-${activeMarket}`}
        role="tabpanel"
        aria-labelledby={`market-tab-${activeMarket}`}
      >
        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-soft/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={activeMeta.tone}>{activeMeta.label}</StatusBadge>
              <span className="font-mono text-sm font-semibold text-muted">{listings.length}/{target} disponibles</span>
            </div>
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">{activeMeta.description}</p>
          </div>
          <p className="shrink-0 font-mono text-sm font-semibold text-ink">
            Rotation dans {formatRemaining(state.marketRefreshAt[activeMarket], now)}
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="panel px-5 py-10 text-center sm:px-8 sm:py-14" role="status">
            <StatusBadge tone={activeMeta.tone}>Stock épuisé</StatusBadge>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-ink">
              Rien à saisir pour le moment
            </h2>
            <p className="mx-auto mt-3 max-w-[45ch] text-base leading-6 text-muted">
              Les annonces ignorées ou achetées ne sont pas remplacées à la volée. La prochaine rotation arrive dans{' '}
              <span className="font-mono font-semibold text-ink">
                {formatRemaining(state.marketRefreshAt[activeMarket], now)}
              </span>.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:block lg:overflow-hidden lg:rounded-[1.75rem] lg:bg-surface lg:shadow-card lg:shadow-inset" aria-label={`Annonces · ${activeMeta.label}`}>
            <div className="hidden grid-cols-[minmax(12rem,1.45fr)_minmax(9rem,0.85fr)_minmax(10rem,0.9fr)_auto] gap-6 border-b border-line bg-soft/70 px-7 py-3 text-sm font-semibold uppercase tracking-[0.06em] text-muted lg:grid">
              <span>Véhicule</span>
              <span>Économie</span>
              <span>Lecture rapide</span>
              <span className="text-right">Décision</span>
            </div>
            {listings.map((listing) => {
              const hasCash = state.cash >= listing.askingPrice
              const canBuy = !garageFull && hasCash
              const disabledReason = garageFull
                ? 'Garage complet'
                : !hasCash
                  ? 'Trésorerie insuffisante'
                  : ''
              return (
                <MarketRow
                  key={listing.id}
                  listing={listing}
                  now={now}
                  canBuy={canBuy}
                  disabledReason={disabledReason}
                  onIgnore={() =>
                    dispatch({ type: 'IGNORE_LISTING', listingId: listing.id, now: Date.now() })
                  }
                  onBuy={() =>
                    dispatch({ type: 'BUY_LISTING', listingId: listing.id, now: Date.now() })
                  }
                />
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

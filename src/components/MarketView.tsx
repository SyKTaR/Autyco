import { useGame } from '../context/GameContext'
import { getGarageCapacity } from '../game/engine'
import { formatMoney, formatNumber, formatRemaining, riskLabel } from '../game/format'
import type { MarketListing, RiskLevel } from '../types/game'
import { StatusBadge, type StatusTone } from './ui/StatusBadge'
import { InventoryCard } from './ui/InventoryCard'

interface MarketViewProps {
  onPurchase: () => void
}

const riskTone: Record<RiskLevel, StatusTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
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

  return (
    <InventoryCard className="group relative overflow-hidden shadow-card transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_rgb(var(--accent))] lg:border-0 lg:border-b lg:border-line lg:bg-transparent lg:shadow-none lg:hover:translate-y-0 lg:hover:bg-signal-soft lg:hover:shadow-none lg:last:border-b-0">
      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(12rem,1.45fr)_minmax(9rem,0.85fr)_minmax(10rem,0.9fr)_auto] lg:items-center lg:gap-6 lg:px-7 lg:py-6">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3 lg:block">
            <div>
              <p className="text-sm font-medium text-muted">
                {listing.maker} · {listing.segment}
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[1.7rem]">
                {listing.model}
              </h2>
            </div>
            <StatusBadge className="shrink-0 font-mono lg:hidden">{listing.year}</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-muted">
            {listing.year} · {formatNumber(listing.mileage)} km
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 border border-line bg-paper p-4 lg:block lg:border-0 lg:bg-transparent lg:p-0">
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

export const MarketView = ({ onPurchase }: MarketViewProps) => {
  const { state, now, dispatch } = useGame()
  const garageFull = state.vehicles.length >= getGarageCapacity(state)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-10 outline-none sm:px-6 sm:pt-12 md:pb-14 lg:px-8 lg:pt-16">
      <header className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end lg:mb-10">
        <div>
          <p className="eyebrow">Petites annonces en direct</p>
          <h1 className="page-title">Le marché</h1>
          <p className="mt-3 max-w-[52ch] text-base leading-6 text-muted">
            Repère l’écart entre prix vendeur et valeur estimée. Le risque ne sera réellement connu
            qu’après le diagnostic.
          </p>
        </div>
        <div className="flex items-center justify-between gap-5 border-2 border-ink bg-signal-soft px-4 py-3 sm:block sm:min-w-[9rem] sm:text-right">
          <p className="font-mono text-3xl font-black leading-none text-signal-hover">{state.listings.length}</p>
          <p className="font-display text-sm font-bold uppercase tracking-[0.06em] text-muted sm:mt-1">opportunités</p>
        </div>
      </header>

      {garageFull && (
        <div className="mb-4 border-2 border-warning bg-[#fff0d6] px-4 py-3 text-sm font-semibold leading-5 text-ink" role="status" aria-live="polite">
          Ton garage est complet. Termine une vente ou mets un nouveau local en service.
        </div>
      )}

      <section className="grid gap-4 lg:block lg:overflow-hidden lg:border-2 lg:border-ink lg:bg-surface" aria-label="Annonces automobiles">
        <div className="hidden grid-cols-[minmax(12rem,1.45fr)_minmax(9rem,0.85fr)_minmax(10rem,0.9fr)_auto] gap-6 border-b-2 border-ink bg-ink px-7 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-white/65 lg:grid">
          <span>Véhicule</span>
          <span>Économie</span>
          <span>Lecture rapide</span>
          <span className="text-right">Décision</span>
        </div>
        {state.listings.map((listing) => {
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
              onBuy={() => {
                dispatch({ type: 'BUY_LISTING', listingId: listing.id, now: Date.now() })
                onPurchase()
              }}
            />
          )
        })}
      </section>
    </main>
  )
}

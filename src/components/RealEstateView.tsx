import { useGame } from '../context/GameContext'
import {
  getGarageCapacity,
  getPropertyCycleCost,
  getRecurringPropertyCosts,
} from '../game/engine'
import { formatMoney, formatRemaining } from '../game/format'
import { BASE_GARAGE_CAPACITY, PROPERTY_MARKET } from '../game/properties'
import type { OwnedProperty, PropertyOffer, PropertyStatus } from '../types/game'
import { StatusBadge, type StatusTone } from './ui/StatusBadge'
import { InventoryCard } from './ui/InventoryCard'

const modeLabel = {
  rent: 'Location',
  purchase: 'Achat',
} as const

const statusLabel: Record<PropertyStatus, string> = {
  'works-required': 'Travaux requis',
  renovating: 'En travaux',
  operational: 'Opérationnel',
}

const statusTone: Record<PropertyStatus, StatusTone> = {
  'works-required': 'warning',
  renovating: 'accent',
  operational: 'success',
}

const PropertyFacts = ({ property }: { property: PropertyOffer }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border border-line bg-paper p-4">
    <div>
      <dt className="data-label">Capacité</dt>
      <dd className="mt-1 font-mono text-lg font-semibold">+{property.capacity} places</dd>
    </div>
    <div>
      <dt className="data-label">Charges / jour</dt>
      <dd className="mt-1 font-mono text-lg font-semibold">
        {formatMoney(property.rentPerCycle + property.chargesPerCycle)}
      </dd>
    </div>
    <div>
      <dt className="data-label">{property.acquisitionMode === 'rent' ? 'Caution' : 'Prix d’achat'}</dt>
      <dd className="mt-1 font-mono text-sm font-semibold">
        {formatMoney(property.acquisitionCost)}
      </dd>
    </div>
    <div>
      <dt className="data-label">Mise en service</dt>
      <dd className="mt-1 text-sm font-semibold">
        {property.workCost > 0
          ? `${formatMoney(property.workCost)} · ${property.workDurationSeconds} s`
          : 'Immédiate'}
      </dd>
    </div>
  </dl>
)

const OwnedPropertyCard = ({ property, now }: { property: OwnedProperty; now: number }) => {
  const { state, dispatch } = useGame()
  const canStartWorks = state.cash >= property.workCost
  const totalWorkTime = property.workDurationSeconds * 1_000
  const workProgress =
    property.status === 'renovating' && property.workStartedAt && totalWorkTime > 0
      ? Math.min(100, Math.max(0, ((now - property.workStartedAt) / totalWorkTime) * 100))
      : 0

  return (
    <InventoryCard className="overflow-hidden shadow-card">
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">
              {property.district} · {modeLabel[property.acquisitionMode]}
            </p>
            <h3 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-[-0.035em]">
              {property.name}
            </h3>
          </div>
          <StatusBadge tone={statusTone[property.status]} className="shrink-0">{statusLabel[property.status]}</StatusBadge>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border border-line bg-paper p-4 sm:grid-cols-3">
          <div>
            <p className="data-label">Places</p>
            <p className="mt-1 font-mono text-base font-semibold">+{property.capacity}</p>
          </div>
          <div>
            <p className="data-label">Par jour</p>
            <p className="mt-1 font-mono text-base font-semibold">
              {formatMoney(getPropertyCycleCost(property))}
            </p>
          </div>
          <div>
            <p className="data-label">Échéance</p>
            <p className="mt-1 font-mono text-sm font-semibold">
              {formatRemaining(property.nextChargeAt, now)}
            </p>
          </div>
        </div>
      </div>

      {property.status === 'works-required' && (
        <div className="action-zone">
          <div>
            <p className="action-title">Capacité encore indisponible</p>
            <p className="action-copy">
              Lance la remise aux normes · {property.workDurationSeconds} s de travaux.
            </p>
          </div>
          <button
            type="button"
            className="button-primary shrink-0"
            disabled={!canStartWorks}
            title={!canStartWorks ? 'Trésorerie insuffisante' : undefined}
            onClick={() =>
              dispatch({
                type: 'START_PROPERTY_WORKS',
                propertyId: property.instanceId,
                now: Date.now(),
              })
            }
          >
            Lancer · {formatMoney(property.workCost)}
          </button>
        </div>
      )}

      {property.status === 'renovating' && property.workCompletesAt && (
        <div className="border-t-2 border-ink bg-signal-soft p-4 text-ink sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Remise aux normes en cours</p>
              <p className="mt-1 text-sm text-muted">Les places seront ajoutées à la livraison.</p>
            </div>
            <p className="font-mono text-lg font-semibold">
              {formatRemaining(property.workCompletesAt, now)}
            </p>
          </div>
          <div className="mt-4 h-2 border border-ink bg-white" aria-hidden="true">
            <div
              className="h-full bg-signal transition-[width] duration-700"
              style={{ width: `${workProgress}%` }}
            />
          </div>
        </div>
      )}

      {property.status === 'operational' && (
        <div className="border-t-2 border-ink bg-[#e3f4ec] px-4 py-3 text-sm font-semibold leading-5 text-success sm:px-6">
          Les {property.capacity} places sont intégrées à la capacité partagée.
        </div>
      )}
    </InventoryCard>
  )
}

const MarketPropertyCard = ({ offer, acquired }: { offer: PropertyOffer; acquired: boolean }) => {
  const { state, dispatch } = useGame()
  const canAcquire = !acquired && state.cash >= offer.acquisitionCost

  return (
    <InventoryCard className="flex h-full flex-col overflow-hidden shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_rgb(var(--accent))]">
      <div className="flex-1 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{offer.district}</p>
            <h3 className="mt-2 font-display text-[1.7rem] font-semibold leading-tight tracking-[-0.04em]">
              {offer.name}
            </h3>
          </div>
          <StatusBadge>{modeLabel[offer.acquisitionMode]}</StatusBadge>
        </div>
        <p className="mt-4 text-sm leading-5 text-muted md:min-h-[3.75rem]">{offer.description}</p>
        <div className="mt-5">
          <PropertyFacts property={offer} />
        </div>
        {offer.acquisitionMode === 'rent' && (
          <p className="mt-3 text-sm leading-5 text-muted">
            Dont {formatMoney(offer.rentPerCycle)} de loyer et{' '}
            {formatMoney(offer.chargesPerCycle)} de charges par cycle.
          </p>
        )}
      </div>
      <div className="border-t border-line bg-soft p-4 sm:p-6">
        <button
          type="button"
          className="button-primary w-full"
          disabled={!canAcquire}
          title={!acquired && !canAcquire ? 'Trésorerie insuffisante' : undefined}
          onClick={() =>
            dispatch({ type: 'ACQUIRE_PROPERTY', offerId: offer.id, now: Date.now() })
          }
        >
          {acquired
            ? 'Déjà dans ton parc'
            : `${offer.acquisitionMode === 'rent' ? 'Louer' : 'Acheter'} · ${formatMoney(offer.acquisitionCost)}`}
        </button>
      </div>
    </InventoryCard>
  )
}

export const RealEstateView = () => {
  const { state, now } = useGame()
  const totalCapacity = getGarageCapacity(state)
  const recurringCosts = getRecurringPropertyCosts(state)

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-10 outline-none sm:px-6 sm:pt-12 md:pb-14 lg:px-8 lg:pt-16">
      <header className="mb-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Extension de la flotte</p>
          <h1 className="page-title">Tes locaux</h1>
          <p className="mt-3 max-w-[58ch] text-base leading-6 text-muted">
            Chaque local ajoute des places une fois opérationnel. Loyers et charges sont prélevés
            toutes les 24 heures, même pendant ton absence.
          </p>
        </div>
        <dl className="grid grid-cols-3 overflow-hidden border-2 border-ink bg-surface">
          <div className="min-w-0 border-r border-line px-3 py-3 sm:px-5 sm:py-4">
            <dt className="text-sm font-medium text-muted">Capacité</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">
              {state.vehicles.length}/{totalCapacity}
            </dd>
          </div>
          <div className="min-w-0 border-r border-line px-3 py-3 sm:px-5 sm:py-4">
            <dt className="text-sm font-medium text-muted">Base</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{BASE_GARAGE_CAPACITY}</dd>
          </div>
          <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <dt className="text-sm font-medium text-muted">Par jour</dt>
            <dd className="mt-1 truncate font-mono text-lg font-semibold">{formatMoney(recurringCosts)}</dd>
          </div>
        </dl>
      </header>

      {state.properties.length > 0 && (
        <section className="mb-14" aria-labelledby="owned-properties-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Parc actuel</p>
              <h2
                id="owned-properties-title"
              className="mt-1 font-display text-3xl font-extrabold uppercase tracking-[-0.025em]"
              >
                Tes locaux
              </h2>
            </div>
            <p className="font-mono text-sm text-muted">
              {state.properties.length} / {PROPERTY_MARKET.length}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {state.properties.map((property) => (
              <OwnedPropertyCard key={property.instanceId} property={property} now={now} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="property-market-title">
        <div className="mb-5">
          <p className="eyebrow">Opportunités fixes</p>
          <h2
            id="property-market-title"
            className="mt-1 font-display text-3xl font-extrabold uppercase tracking-[-0.025em]"
          >
            Marché immobilier
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PROPERTY_MARKET.map((offer) => (
            <MarketPropertyCard
              key={offer.id}
              offer={offer}
              acquired={state.properties.some((property) => property.id === offer.id)}
            />
          ))}
        </div>
      </section>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import {
  getRepairCost,
  getRepairDuration,
  getGarageCapacity,
  getSaleChance,
  getVehicleInvestment,
  getVehicleResaleValue,
} from '../game/engine'
import {
  formatMoney,
  formatNumber,
  formatRemaining,
  riskLabel,
  statusLabel,
} from '../game/format'
import type { OwnedVehicle, VehicleStatus } from '../types/game'
import { StatusBadge, type StatusTone } from './ui/StatusBadge'
import { InventoryCard } from './ui/InventoryCard'
import { VehicleAvatar } from './ui/VehicleAvatar'

interface GarageViewProps {
  onOpenMarket: () => void
}

const statusTone: Record<VehicleStatus, StatusTone> = {
  'needs-diagnosis': 'warning',
  'needs-decision': 'warning',
  repairing: 'accent',
  ready: 'neutral',
  listed: 'success',
  'offer-received': 'inverse',
}

const getStage = (status: VehicleStatus) => {
  if (status === 'needs-diagnosis') return 0
  if (status === 'needs-decision' || status === 'repairing' || status === 'ready') return 1
  return 2
}

const VehicleProgress = ({ status }: { status: VehicleStatus }) => {
  const currentStage = getStage(status)
  return (
    <ol className="grid grid-cols-3 gap-1 bg-paper/55 p-2" aria-label="Progression du véhicule">
      {['Diagnostic', 'Préparation', 'Vente'].map((label, index) => (
        <li
          key={label}
          className={`rounded-xl px-1 py-2.5 text-center text-sm font-semibold ${
            index === currentStage
              ? 'bg-drive-soft text-drive'
              : index < currentStage
                ? 'bg-soft text-ink'
                : 'text-muted'
          }`}
        >
          <span className="mr-1 font-mono" aria-hidden="true">
            {index + 1}.
          </span>
          {label}
        </li>
      ))}
    </ol>
  )
}

const VehicleFacts = ({ vehicle }: { vehicle: OwnedVehicle }) => (
  <dl className="subtle-card grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
    <div>
      <dt className="data-label">Achat</dt>
      <dd className="mt-1 font-mono text-base font-semibold">{formatMoney(vehicle.purchasePrice)}</dd>
    </div>
    <div>
      <dt className="data-label">Frais</dt>
      <dd className="mt-1 font-mono text-base font-semibold">{formatMoney(vehicle.repairCosts)}</dd>
    </div>
    <div>
      <dt className="data-label">Valeur actuelle</dt>
      <dd className="mt-1 font-mono text-base font-semibold">
        {vehicle.problems.length > 0 ? formatMoney(getVehicleResaleValue(vehicle)) : 'À définir'}
      </dd>
    </div>
    <div>
      <dt className="data-label">Kilométrage</dt>
      <dd className="mt-1 font-mono text-base font-semibold">{formatNumber(vehicle.mileage)} km</dd>
    </div>
  </dl>
)

const ProblemList = ({ vehicle }: { vehicle: OwnedVehicle }) => (
  <div className="divide-y divide-line rounded-2xl bg-paper/55 px-4 shadow-inset">
    {vehicle.problems.map((problem) => (
      <div key={problem.id} className="grid grid-cols-[1fr_auto] gap-4 py-3.5">
        <div>
          <p className={`text-sm font-semibold ${problem.repaired ? 'text-success' : 'text-ink'}`}>
            {problem.label}
            {problem.repaired && <span className="ml-2 font-normal">· traité</span>}
          </p>
          <p className="mt-0.5 text-sm leading-5 text-muted">{problem.detail}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold">{formatMoney(problem.cost)}</p>
          <p className="mt-0.5 font-mono text-sm text-muted">{problem.durationSeconds} s</p>
        </div>
      </div>
    ))}
  </div>
)

const SaleForm = ({ vehicle }: { vehicle: OwnedVehicle }) => {
  const { dispatch } = useGame()
  const fairValue = getVehicleResaleValue(vehicle)
  const [price, setPrice] = useState(String(Math.round(fairValue / 100) * 100))
  const numericPrice = Number(price)
  const chance = Number.isFinite(numericPrice) ? getSaleChance(vehicle, numericPrice) : 0
  const estimatedMargin = numericPrice - getVehicleInvestment(vehicle)

  useEffect(() => {
    setPrice(String(Math.round(fairValue / 100) * 100))
  }, [fairValue, vehicle.id])

  return (
    <div className="bg-soft/70 p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-ink">Fixe ton prix de vente</p>
          <p className="mt-1 text-sm leading-5 text-muted">
            Valeur actuelle estimée : {formatMoney(fairValue)}
          </p>
        </div>
        {vehicle.repairsSkipped && (
          <StatusBadge tone="warning">En l’état</StatusBadge>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Prix de vente en euros</span>
          <input
            type="number"
            inputMode="numeric"
            min="1000"
            step="100"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="form-input pr-10 font-mono"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
            €
          </span>
        </label>
        <button
          type="button"
          className="button-primary sm:min-w-[10rem]"
          disabled={!Number.isFinite(numericPrice) || numericPrice < 1_000}
          onClick={() =>
            dispatch({
              type: 'LIST_VEHICLE',
              vehicleId: vehicle.id,
              price: numericPrice,
              now: Date.now(),
            })
          }
        >
          Mettre en vente
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
        <span className="text-muted">Chance d’offre : {Math.round(chance * 100)}%</span>
        <span className={estimatedMargin >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
          Marge visée {estimatedMargin >= 0 ? '+' : '−'}{formatMoney(Math.abs(estimatedMargin))}
        </span>
      </div>
    </div>
  )
}

const ContextualAction = ({ vehicle, now }: { vehicle: OwnedVehicle; now: number }) => {
  const { state, dispatch } = useGame()

  if (vehicle.status === 'needs-diagnosis') {
    return (
      <div className="action-zone">
        <div>
          <p className="action-title">Commence par lever le doute</p>
          <p className="action-copy">Le diagnostic révèle les frais réels avant toute décision.</p>
        </div>
        <button
          type="button"
          className="button-primary shrink-0"
          onClick={() => dispatch({ type: 'DIAGNOSE_VEHICLE', vehicleId: vehicle.id })}
        >
          Diagnostiquer
        </button>
      </div>
    )
  }

  if (vehicle.status === 'needs-decision') {
    const repairCost = getRepairCost(vehicle)
    const canRepair = state.cash >= repairCost
    return (
      <div className="bg-soft/70 p-4 sm:p-6">
        <ProblemList vehicle={vehicle} />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="button-secondary sm:order-1"
            onClick={() => dispatch({ type: 'SKIP_REPAIR', vehicleId: vehicle.id })}
          >
            Vendre en l’état
          </button>
          <button
            type="button"
            className="button-primary sm:order-2"
            disabled={!canRepair}
            title={!canRepair ? 'Trésorerie insuffisante' : undefined}
            onClick={() =>
              dispatch({ type: 'START_REPAIR', vehicleId: vehicle.id, now: Date.now() })
            }
          >
            Tout réparer · {formatMoney(repairCost)}
          </button>
        </div>
        <p className="mt-3 text-right text-sm text-muted">
          Durée atelier : environ {getRepairDuration(vehicle)} s
        </p>
      </div>
    )
  }

  if (vehicle.status === 'repairing' && vehicle.repairStartedAt && vehicle.repairCompletesAt) {
    const total = vehicle.repairCompletesAt - vehicle.repairStartedAt
    const progress = Math.min(100, Math.max(0, ((now - vehicle.repairStartedAt) / total) * 100))
    return (
      <div className="bg-signal-soft p-4 text-ink sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Intervention en cours</p>
            <p className="mt-1 text-sm text-muted">Toutes les réparations seront traitées.</p>
          </div>
          <p className="font-mono text-lg font-semibold">
            {formatRemaining(vehicle.repairCompletesAt, now)}
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper/60" aria-hidden="true">
          <div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${progress}%` }} />
        </div>
      </div>
    )
  }

  if (vehicle.status === 'ready' && vehicle.kept) {
    return (
      <div className="action-zone bg-soft">
        <div>
          <p className="action-title">Conservée dans ta collection</p>
          <p className="action-copy">
            Elle occupe une place partagée mais aucune annonce ne peut être publiée tant qu’elle
            reste gardée.
          </p>
        </div>
      </div>
    )
  }

  if (vehicle.status === 'ready') return <SaleForm vehicle={vehicle} />

  if (vehicle.status === 'listed') {
    const fairValue = getVehicleResaleValue(vehicle)
    return (
      <div className="action-zone">
        <div>
          <p className="action-title">Annonce active à {formatMoney(vehicle.askingPrice ?? 0)}</p>
          <p className="action-copy">
            Valeur {formatMoney(fairValue)} · chance d’offre {Math.round((vehicle.saleChance ?? 0) * 100)}%
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="data-label">Prochain contact</p>
          <p className="mt-1 font-mono text-sm font-semibold">
            {vehicle.nextOfferAt ? formatRemaining(vehicle.nextOfferAt, now) : '—'}
          </p>
        </div>
      </div>
    )
  }

  if (vehicle.status === 'offer-received') {
    const offer = vehicle.offerAmount ?? 0
    const margin = offer - getVehicleInvestment(vehicle)
    return (
      <div className="bg-success/10 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="data-label text-success">Offre ferme reçue</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[-0.05em] text-ink">
              {formatMoney(offer)}
            </p>
            <p className={`mt-1 text-sm font-semibold ${margin >= 0 ? 'text-success' : 'text-danger'}`}>
              Marge nette {margin >= 0 ? '+' : '−'}{formatMoney(Math.abs(margin))}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="button-secondary flex-1"
              onClick={() =>
                dispatch({ type: 'REJECT_OFFER', vehicleId: vehicle.id, now: Date.now() })
              }
            >
              Refuser
            </button>
            <button
              type="button"
              className="button-primary flex-[1.2]"
              onClick={() => dispatch({ type: 'ACCEPT_OFFER', vehicleId: vehicle.id })}
            >
              Accepter l’offre
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

const VehicleCard = ({ vehicle, now }: { vehicle: OwnedVehicle; now: number }) => {
  const { dispatch } = useGame()

  return (
    <InventoryCard className={`overflow-hidden ${vehicle.kept ? 'ring-1 ring-signal/40 shadow-raised' : ''}`}>
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <VehicleAvatar />
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted">
                {vehicle.maker} · {vehicle.segment}
              </p>
              <h2 className="mt-1 font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.035em] sm:text-3xl">
                {vehicle.model}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {vehicle.year} · {riskLabel[vehicle.risk]}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {vehicle.kept && <StatusBadge tone="inverse">Collection</StatusBadge>}
            <StatusBadge tone={statusTone[vehicle.status]}>{statusLabel[vehicle.status]}</StatusBadge>
          </div>
        </div>
        <div className="mt-5">
          <VehicleFacts vehicle={vehicle} />
        </div>
        <button
          type="button"
          className="text-action mt-3 -ml-3"
          onClick={() => dispatch({ type: 'TOGGLE_VEHICLE_KEPT', vehicleId: vehicle.id })}
        >
          {vehicle.kept ? 'Retirer de la collection' : 'Garder dans la collection'}
        </button>
      </div>
      <VehicleProgress status={vehicle.status} />
      <ContextualAction vehicle={vehicle} now={now} />
    </InventoryCard>
  )
}

export const GarageView = ({ onOpenMarket }: GarageViewProps) => {
  const { state, now } = useGame()
  const capacity = getGarageCapacity(state)
  const freeSlots = capacity - state.vehicles.length
  const collectionCount = state.vehicles.filter((vehicle) => vehicle.kept).length
  const orderedVehicles = [...state.vehicles].sort(
    (first, second) => Number(first.kept) - Number(second.kept),
  )

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-10 outline-none sm:px-6 sm:pt-12 md:pb-14 lg:px-8 lg:pt-16">
      <header className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end lg:mb-10">
        <div>
          <p className="eyebrow">Inventaire joueur</p>
          <h1 className="page-title">Ton garage</h1>
          <p className="mt-3 max-w-[50ch] text-base leading-6 text-muted">
            {state.vehicles.length > 0
              ? `${state.vehicles.length - collectionCount} en stock · ${collectionCount} en collection · une capacité commune.`
              : 'Chaque véhicule affiche uniquement sa prochaine décision utile.'}
          </p>
        </div>
        <button type="button" className="button-primary w-full sm:w-auto sm:min-w-[11rem]" onClick={onOpenMarket} disabled={freeSlots === 0}>
          {freeSlots > 0 ? 'Chercher un véhicule' : 'Garage complet'}
        </button>
      </header>

      {state.vehicles.length === 0 ? (
        <section className="panel grid min-h-[22rem] place-items-center bg-surface px-5 py-12 text-center shadow-card">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-signal-hover">{capacity} places libres</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
              La première affaire t’attend.
            </h2>
            <p className="mx-auto mt-3 max-w-[38ch] text-base leading-6 text-muted">
              Achète un véhicule sous sa valeur estimée, diagnostique-le puis décide où placer ta marge.
            </p>
            <button type="button" className="button-primary mt-6 min-w-[12rem]" onClick={onOpenMarket}>
              Ouvrir le marché
            </button>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Véhicules du garage">
          {orderedVehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} now={now} />
          ))}
          {freeSlots > 0 && (
            <button
              type="button"
              className="group min-h-[9rem] rounded-[1.75rem] border border-dashed border-control bg-transparent p-5 text-left transition-[border-color,background-color] hover:border-signal hover:bg-signal-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              onClick={onOpenMarket}
            >
              <span className="text-sm font-medium text-muted">
                {freeSlots} place{freeSlots > 1 ? 's' : ''} disponible{freeSlots > 1 ? 's' : ''}
              </span>
              <span className="mt-3 block font-display text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink group-hover:text-signal-hover">
                Trouver une affaire →
              </span>
            </button>
          )}
        </section>
      )}
    </main>
  )
}

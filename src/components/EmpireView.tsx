import { useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import {
  COMMERCIAL_ACTION_DELAY_SECONDS,
  MECHANIC_DIAGNOSIS_SECONDS,
  MECHANIC_REPAIR_TIME_FACTOR,
  SHOWROOM_CAPACITY,
  SHOWROOM_OFFER_DELAY_SECONDS,
  STAFF_CONFIG,
  getStaffCycleCost,
} from '../game/engine'
import { formatMoney, formatRemaining } from '../game/format'
import type { CommercialSettings, StaffRole } from '../types/game'
import { InventoryCard } from './ui/InventoryCard'
import { StatusBadge } from './ui/StatusBadge'
import { VehicleAvatar } from './ui/VehicleAvatar'

type EmpireSection = 'showroom' | 'staff'

const roleCopy: Record<StaffRole, { title: string; description: string }> = {
  mechanic: {
    title: 'Garagiste',
    description: 'Diagnostique, choisit les travaux, répare puis publie le stock hors collection.',
  },
  salesperson: {
    title: 'Commercial',
    description: 'Repère et achète les affaires conformes à ta consigne, hors Rare / Collection.',
  },
}

const StaffHiringCard = ({ role }: { role: StaffRole }) => {
  const { state, dispatch } = useGame()
  const config = STAFF_CONFIG[role]
  const hiredCount = state.staff.filter((employee) => employee.role === role).length
  const canHire = hiredCount < config.limit && state.cash >= config.hireCost

  return (
    <InventoryCard className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Recrutement</p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.035em]">
              {roleCopy[role].title}
            </h3>
          </div>
          <StatusBadge tone={hiredCount >= config.limit ? 'success' : 'neutral'}>
            {hiredCount} / {config.limit}
          </StatusBadge>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">{roleCopy[role].description}</p>
        <dl className="subtle-card mt-5 grid grid-cols-2 gap-4 p-4">
          <div>
            <dt className="data-label">Prime d’embauche</dt>
            <dd className="mt-1 font-mono text-base font-semibold">{formatMoney(config.hireCost)}</dd>
          </div>
          <div>
            <dt className="data-label">Salaire / jour</dt>
            <dd className="mt-1 font-mono text-base font-semibold">
              {formatMoney(config.salaryPerCycle)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="bg-soft/70 p-4 sm:p-6">
        <button
          type="button"
          className="button-primary w-full"
          disabled={!canHire}
          title={
            hiredCount >= config.limit
              ? 'Plafond atteint'
              : state.cash < config.hireCost
                ? 'Trésorerie insuffisante'
                : undefined
          }
          onClick={() => dispatch({ type: 'HIRE_STAFF', role, now: Date.now() })}
        >
          {hiredCount >= config.limit ? 'Équipe au complet' : `Embaucher · ${formatMoney(config.hireCost)}`}
        </button>
      </div>
    </InventoryCard>
  )
}

const StaffRoster = () => {
  const { state, dispatch, now } = useGame()
  if (state.staff.length === 0) return null

  return (
    <section className="mt-8" aria-labelledby="staff-roster-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Équipe en poste</p>
          <h3 id="staff-roster-title" className="mt-1 font-display text-2xl font-semibold">
            Feuille de paie
          </h3>
        </div>
        <p className="font-mono text-sm text-muted">{formatMoney(getStaffCycleCost(state.staff))} / jour</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {state.staff.map((employee, index) => {
          const job = state.mechanicJobs.find((item) => item.employeeId === employee.id)
          const config = STAFF_CONFIG[employee.role]
          const statusLabel = employee.pausedReason === 'payroll'
            ? 'Paie en retard'
            : employee.status === 'active'
              ? job
                ? 'En mission'
                : 'Disponible'
              : 'En pause'
          return (
            <InventoryCard key={employee.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted">
                    {roleCopy[employee.role].title} {index + 1}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{statusLabel}</p>
                  <p className="mt-2 text-sm text-muted">
                    Prochaine paie dans {formatRemaining(employee.nextPayrollAt, now)} · {formatMoney(config.salaryPerCycle)}
                  </p>
                  {job && (
                    <p className="mt-1 text-sm font-medium text-drive">
                      {job.stage === 'diagnosis' ? 'Diagnostic' : job.stage === 'repair' ? 'Atelier' : 'Mise en vente'} · {formatRemaining(job.completesAt, now)}
                    </p>
                  )}
                  {employee.salaryArrears > 0 && (
                    <p className="mt-2 text-sm font-semibold text-danger">
                      Arriéré : {formatMoney(employee.salaryArrears)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <StatusBadge tone={employee.pausedReason === 'payroll' ? 'danger' : employee.status === 'active' ? 'success' : 'warning'}>
                    {employee.status === 'active' ? 'Actif' : 'Suspendu'}
                  </StatusBadge>
                  {employee.salaryArrears > 0 ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={state.cash < employee.salaryArrears}
                      onClick={() => dispatch({ type: 'PAY_STAFF_ARREARS', employeeId: employee.id })}
                    >
                      Régler et réactiver
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => dispatch({ type: 'TOGGLE_STAFF_STATUS', employeeId: employee.id })}
                    >
                      {employee.status === 'active' ? 'Mettre en pause' : 'Réactiver'}
                    </button>
                  )}
                </div>
              </div>
            </InventoryCard>
          )
        })}
      </div>
    </section>
  )
}

const CommercialConsole = () => {
  const { state, dispatch, now } = useGame()
  const [settings, setSettings] = useState<CommercialSettings>(state.commercialSettings)
  const hasSalesperson = state.staff.some((employee) => employee.role === 'salesperson')

  useEffect(() => setSettings(state.commercialSettings), [state.commercialSettings])

  return (
    <section className="mt-8" aria-labelledby="commercial-console-title">
      <InventoryCard className="overflow-hidden">
        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-8">
          <div>
            <p className="eyebrow">Consigne d’achat</p>
            <h3 id="commercial-console-title" className="mt-2 font-display text-2xl font-semibold tracking-[-0.035em]">
              Radar commercial
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              Le radar ne voit jamais Rare / Collection. Un passage a lieu toutes les {COMMERCIAL_ACTION_DELAY_SECONDS[0]} à {COMMERCIAL_ACTION_DELAY_SECONDS[1]} secondes quand le poste est actif.
            </p>
            <div className="subtle-card mt-5 p-4">
              <p className="data-label">Prochain passage</p>
              <p className="mt-1 font-mono text-lg font-semibold">
                {hasSalesperson && settings.enabled
                  ? formatRemaining(state.nextCommercialActionAt, now)
                  : 'Automatisation inactive'}
              </p>
            </div>
          </div>

          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              dispatch({ type: 'UPDATE_COMMERCIAL_SETTINGS', settings, now: Date.now() })
            }}
          >
            <label>
              <span className="data-label">Budget maximum par achat</span>
              <input
                className="form-input mt-2 font-mono"
                type="number"
                min="5000"
                max="100000"
                step="500"
                value={settings.maxPurchasePrice}
                onChange={(event) => setSettings((current) => ({ ...current, maxPurchasePrice: Number(event.target.value) }))}
              />
            </label>
            <label>
              <span className="data-label">Décote minimum recherchée</span>
              <div className="relative mt-2">
                <input
                  className="form-input pr-10 font-mono"
                  type="number"
                  min="5"
                  max="35"
                  step="1"
                  value={settings.minDiscountPercent}
                  onChange={(event) => setSettings((current) => ({ ...current, minDiscountPercent: Number(event.target.value) }))}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
              </div>
            </label>
            <label>
              <span className="data-label">Profil de marché</span>
              <select
                className="form-input mt-2"
                value={settings.marketProfile}
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  marketProfile: event.target.value as CommercialSettings['marketProfile'],
                }))}
              >
                <option value="both">Occasion + Import / Premium</option>
                <option value="standard">Occasion courante uniquement</option>
                <option value="premium">Import / Premium uniquement</option>
              </select>
            </label>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl bg-soft/70 px-4 py-3 sm:self-end">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[rgb(var(--accent))]"
                checked={settings.enabled}
                onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span className="text-sm font-semibold">Achats automatiques actifs</span>
            </label>
            <button type="submit" className="button-primary sm:col-span-2" disabled={!hasSalesperson}>
              Enregistrer la consigne
            </button>
          </form>
        </div>
      </InventoryCard>
    </section>
  )
}

const StaffSection = () => (
  <div>
    <div className="mb-5 rounded-[1.75rem] bg-drive-soft p-5 shadow-inset sm:p-6">
      <p className="text-base font-semibold text-drive">Automatisation volontairement imparfaite</p>
      <p className="mt-2 max-w-[72ch] text-sm leading-6 text-muted">
        Un garagiste met {MECHANIC_DIAGNOSIS_SECONDS} s à diagnostiquer, travaille environ {Math.round((MECHANIC_REPAIR_TIME_FACTOR - 1) * 100)} % plus lentement et peut laisser un détail mineur ouvert. Mets-le en pause pour reprendre toi-même un gros coup.
      </p>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <StaffHiringCard role="mechanic" />
      <StaffHiringCard role="salesperson" />
    </div>
    <StaffRoster />
    <CommercialConsole />
  </div>
)

const ShowroomSection = () => {
  const { state, dispatch, now } = useGame()
  const collection = state.vehicles.filter((vehicle) => vehicle.kept)
  const exposedVehicles = state.showroomVehicleIds
    .map((id) => collection.find((vehicle) => vehicle.id === id))
    .filter((vehicle) => vehicle !== undefined)

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <InventoryCard className="overflow-hidden">
          <div className="border-b border-line p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Galerie privée</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em]">Plateau d’exposition</h2>
              </div>
              <StatusBadge tone="accent">{exposedVehicles.length} / {SHOWROOM_CAPACITY} exposées</StatusBadge>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {collection.length === 0 ? (
              <div className="rounded-2xl bg-soft/70 p-6 text-center">
                <p className="text-lg font-semibold">Ta collection est encore vide</p>
                <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-muted">
                  Garde un véhicule depuis le Garage pour pouvoir le mettre en scène ici.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {collection.map((vehicle) => {
                  const exposed = state.showroomVehicleIds.includes(vehicle.id)
                  const offer = state.showroomOffers.find((item) => item.vehicleId === vehicle.id)
                  return (
                    <div key={vehicle.id} className={`rounded-2xl border p-4 transition-colors ${exposed ? 'border-signal bg-signal-soft/35' : 'border-line bg-soft/45'}`}>
                      <div className="flex gap-3">
                        <VehicleAvatar compact />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold">{vehicle.maker} {vehicle.model}</p>
                          <p className="mt-1 text-sm text-muted">{vehicle.year} · {vehicle.segment}</p>
                        </div>
                      </div>
                      {offer && (
                        <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 font-mono text-sm font-semibold text-success">
                          Offre visiteur · {formatMoney(offer.amount)}
                        </p>
                      )}
                      <button
                        type="button"
                        className={exposed ? 'button-secondary mt-4 w-full' : 'button-primary mt-4 w-full'}
                        disabled={!exposed && exposedVehicles.length >= SHOWROOM_CAPACITY}
                        onClick={() => dispatch({ type: 'TOGGLE_SHOWROOM_VEHICLE', vehicleId: vehicle.id, now: Date.now() })}
                      >
                        {exposed ? 'Retirer du plateau' : 'Exposer ce véhicule'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </InventoryCard>

        <InventoryCard className="p-4 sm:p-6">
          <p className="eyebrow">Visiteurs privés</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.035em]">Propositions en cours</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Une proposition arrive toutes les {SHOWROOM_OFFER_DELAY_SECONDS[0] / 60} à {SHOWROOM_OFFER_DELAY_SECONDS[1] / 60} minutes et peut varier de −8 % à +13 % de la valeur actuelle.
          </p>
          <div className="subtle-card mt-5 p-4">
            <p className="data-label">Prochaine visite</p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {exposedVehicles.length > 0 ? formatRemaining(state.nextShowroomOfferAt, now) : 'En attente d’un véhicule'}
            </p>
          </div>
          <div className="mt-4 grid gap-3">
            {state.showroomOffers.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line p-5 text-sm leading-6 text-muted">
                Aucune proposition active. Les offres du showroom restent indépendantes des annonces du Marché.
              </p>
            ) : state.showroomOffers.map((offer) => {
              const vehicle = state.vehicles.find((item) => item.id === offer.vehicleId)
              if (!vehicle) return null
              return (
                <div key={offer.id} className="rounded-2xl bg-success/10 p-4">
                  <p className="text-sm font-semibold">{vehicle.maker} {vehicle.model}</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-success">{formatMoney(offer.amount)}</p>
                  <p className="mt-1 text-sm text-muted">Expire dans {formatRemaining(offer.expiresAt, now)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" className="button-primary px-3" onClick={() => dispatch({ type: 'ACCEPT_SHOWROOM_OFFER', offerId: offer.id, now: Date.now() })}>
                      Accepter
                    </button>
                    <button type="button" className="button-secondary px-3" onClick={() => dispatch({ type: 'REJECT_SHOWROOM_OFFER', offerId: offer.id, now: Date.now() })}>
                      Refuser
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </InventoryCard>
      </div>
    </div>
  )
}

export const EmpireView = ({ onBack }: { onBack: () => void }) => {
  const { state } = useGame()
  const [section, setSection] = useState<EmpireSection>('showroom')

  return (
    <main id="main-content" tabIndex={-1} className="app-main">
      <button type="button" className="text-action -ml-3 mb-5" onClick={onBack}>
        <span aria-hidden="true">←</span> Retour aux locaux
      </button>
      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Grand Garage AUTYCO</p>
          <h1 className="page-title">Pilote ton empire.</h1>
          <p className="mt-3 max-w-[62ch] text-base leading-6 text-muted">
            Mets en scène ta collection, traite les propositions privées et règle le niveau d’automatisation sans retirer les meilleurs coups au jeu manuel.
          </p>
        </div>
        <dl className="grid grid-cols-2 overflow-hidden rounded-2xl bg-surface shadow-card shadow-inset">
          <div className="border-r border-line px-4 py-4 sm:px-6">
            <dt className="data-label">Équipe</dt>
            <dd className="mt-1 font-mono text-xl font-semibold">{state.staff.length} / 3</dd>
          </div>
          <div className="px-4 py-4 sm:px-6">
            <dt className="data-label">Paie / jour</dt>
            <dd className="mt-1 font-mono text-xl font-semibold">{formatMoney(getStaffCycleCost(state.staff))}</dd>
          </div>
        </dl>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-2 rounded-[1.5rem] bg-surface p-2 shadow-inset" role="tablist" aria-label="Espaces du Grand Garage">
        {([
          ['showroom', 'Showroom'],
          ['staff', 'Équipe & automatisation'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={section === value}
            className={`min-h-12 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors sm:text-base ${section === value ? 'bg-drive text-on-drive shadow-card' : 'text-muted hover:bg-soft hover:text-ink'}`}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <section role="tabpanel">
        {section === 'showroom' ? <ShowroomSection /> : <StaffSection />}
      </section>
    </main>
  )
}

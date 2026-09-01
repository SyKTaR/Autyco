import {
  getGarageCapacity,
  getRecurringPropertyCosts,
  getVehicleResaleValue,
} from '../game/engine'
import { formatMoney } from '../game/format'
import type { GameState } from '../types/game'
import { MetricTile } from './ui/MetricTile'

export const SummaryStrip = ({ state }: { state: GameState }) => {
  const stockValue = state.vehicles.reduce(
    (total, vehicle) => total + getVehicleResaleValue(vehicle),
    0,
  )
  const capacity = getGarageCapacity(state)
  const recurringCosts = getRecurringPropertyCosts(state)

  const metrics = [
    {
      label: 'Trésorerie',
      value: formatMoney(state.cash),
      tone: state.cash < 0 ? 'danger' as const : 'accent' as const,
    },
    { label: 'Valeur du parc', value: formatMoney(stockValue) },
    {
      label: 'Bénéfice du jour',
      value: `${state.profitToday >= 0 ? '+' : '−'}${formatMoney(Math.abs(state.profitToday))}`,
      tone: state.profitToday > 0 ? 'success' as const : 'default' as const,
    },
    {
      label: 'Occupation',
      value: `${state.vehicles.length} / ${capacity}`,
      detail: `${capacity - state.vehicles.length} place${capacity - state.vehicles.length > 1 ? 's' : ''} libre${capacity - state.vehicles.length > 1 ? 's' : ''}`,
    },
    {
      label: 'Charges / jour',
      value: formatMoney(recurringCosts),
      detail: `${state.properties.length} ${state.properties.length > 1 ? 'locaux' : 'local'}`,
    },
  ]
  const metricClasses = [
    'col-span-2 rounded-2xl bg-signal-soft md:col-span-1',
    'rounded-2xl bg-surface',
    'rounded-2xl bg-surface',
    'rounded-2xl bg-surface',
    'rounded-2xl bg-surface',
  ]

  return (
    <section className="bg-paper px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8" aria-label="Situation du garage">
      <div className="mx-auto grid w-full max-w-[82rem] grid-cols-2 gap-2 rounded-3xl bg-soft/35 p-2 md:grid-cols-5">
        {metrics.map((metric, index) => (
          <MetricTile
            key={metric.label}
            {...metric}
            className={metricClasses[index]}
          />
        ))}
      </div>
    </section>
  )
}

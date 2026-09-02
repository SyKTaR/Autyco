import { useId, useState } from 'react'
import {
  getGarageCapacity,
  getRecurringPropertyCosts,
  getVehicleResaleValue,
} from '../game/engine'
import { formatMoney } from '../game/format'
import type { GameState } from '../types/game'
import { MetricTile } from './ui/MetricTile'

export const SummaryStrip = ({ state }: { state: GameState }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const mobileDetailsId = useId()
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
    'col-span-2 bg-signal-soft md:col-span-1',
    '',
    '',
    '',
    '',
  ]

  return (
    <section className="bg-paper px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8" aria-label="Situation du garage">
      <div className="mx-auto w-full max-w-[82rem] rounded-[1.75rem] bg-soft/35 p-1.5 shadow-inset sm:p-2 md:grid md:grid-cols-5 md:gap-2">
        <button
          type="button"
          aria-controls={mobileDetailsId}
          aria-expanded={isExpanded}
          className="stat-tile flex w-full items-center justify-between gap-4 bg-signal-soft text-left transition-colors duration-200 hover:bg-signal-soft/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal motion-reduce:transition-none md:hidden"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <span className="min-w-0">
            <span className="data-label block">Trésorerie</span>
            <span
              className={`stat-value block ${state.cash < 0 ? 'text-danger' : 'text-signal'}`}
            >
              {formatMoney(state.cash)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-signal">
            Détails
            <svg
              aria-hidden="true"
              className={`h-5 w-5 transition-transform duration-300 motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </span>
        </button>

        <div
          id={mobileDetailsId}
          aria-hidden={!isExpanded}
          className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none md:hidden ${
            isExpanded
              ? 'mt-1.5 grid-rows-[1fr] opacity-100 sm:mt-2'
              : 'mt-0 grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {metrics.slice(1).map((metric) => (
                <MetricTile key={metric.label} {...metric} />
              ))}
            </div>
          </div>
        </div>

        {metrics.map((metric, index) => (
          <MetricTile
            key={metric.label}
            {...metric}
            className={`hidden md:block ${metricClasses[index]}`}
          />
        ))}
      </div>
    </section>
  )
}

import { formatMoney } from '../game/format'
import type { ReturnSummary as ReturnSummaryData } from '../game/returnSummary'

interface ReturnSummaryProps {
  summary: ReturnSummaryData
  onDismiss: () => void
  onOpenGarage: () => void
}

const formatAwayDuration = (durationMs: number) => {
  const minutes = Math.max(1, Math.round(durationMs / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours} h ${remainingMinutes}` : `${hours} h`
}

export const ReturnSummary = ({ summary, onDismiss, onOpenGarage }: ReturnSummaryProps) => {
  const events = [
    summary.repairsCompleted > 0
      ? `${summary.repairsCompleted} réparation${summary.repairsCompleted > 1 ? 's' : ''} terminée${summary.repairsCompleted > 1 ? 's' : ''}`
      : null,
    summary.offersReceived > 0
      ? `${summary.offersReceived} nouvelle${summary.offersReceived > 1 ? 's' : ''} offre${summary.offersReceived > 1 ? 's' : ''}`
      : null,
    summary.propertiesOpened > 0
      ? `${summary.propertiesOpened} local${summary.propertiesOpened > 1 ? 'ux' : ''} mis en service`
      : null,
    summary.showroomOffersReceived > 0
      ? `${summary.showroomOffersReceived} proposition${summary.showroomOffersReceived > 1 ? 's' : ''} au showroom`
      : null,
    summary.staffPaused > 0
      ? `${summary.staffPaused} poste${summary.staffPaused > 1 ? 's' : ''} suspendu${summary.staffPaused > 1 ? 's' : ''} pour paie insuffisante`
      : null,
    summary.cashDelta !== 0
      ? `Trésorerie ${summary.cashDelta > 0 ? '+' : '−'}${formatMoney(Math.abs(summary.cashDelta))}`
      : null,
  ].filter((event): event is string => Boolean(event))

  const openGarage = () => {
    onDismiss()
    onOpenGarage()
  }

  return (
    <section
      className="bg-paper px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8"
      aria-labelledby="return-summary-title"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mx-auto w-full max-w-[82rem] overflow-hidden rounded-[1.75rem] bg-drive-soft shadow-card shadow-inset">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-7">
          <div>
            <p className="text-sm font-semibold text-drive">
              De retour après {formatAwayDuration(summary.awayDurationMs)}
            </p>
            <h2
              id="return-summary-title"
              className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
            >
              Le garage a continué de tourner.
            </h2>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm leading-6 text-muted">
              {events.map((event) => (
                <li key={event} className="before:mr-2 before:text-drive before:content-['·']">
                  {event}
                </li>
              ))}
            </ul>
            {summary.actionCount > 0 && (
              <p className="mt-3 text-sm font-semibold text-ink">
                {summary.actionCount} décision{summary.actionCount > 1 ? 's' : ''} disponible{summary.actionCount > 1 ? 's' : ''} maintenant.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <button type="button" className="button-primary" onClick={openGarage}>
              Reprendre au garage
            </button>
            <button type="button" className="text-action justify-center" onClick={onDismiss}>
              Masquer le résumé
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

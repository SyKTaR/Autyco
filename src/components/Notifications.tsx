import { useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const Notifications = () => {
  const { state, dispatch } = useGame()
  const firstNotification = state.notifications[0]

  useEffect(() => {
    if (!firstNotification) return
    const timeout = window.setTimeout(
      () => dispatch({ type: 'DISMISS_NOTIFICATION', notificationId: firstNotification.id }),
      5_500,
    )
    return () => window.clearTimeout(timeout)
  }, [firstNotification, dispatch])

  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:top-5 sm:w-[24rem]"
      aria-live="polite"
      aria-label="Notifications"
    >
      {state.notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          className={`pointer-events-auto min-h-12 w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold leading-5 shadow-raised transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
            notification.tone === 'success'
              ? 'bg-[#18362b] text-success'
              : notification.tone === 'warning'
                ? 'bg-[#3a2c19] text-warning'
                : 'bg-surface text-ink'
          }`}
          onClick={() => dispatch({ type: 'DISMISS_NOTIFICATION', notificationId: notification.id })}
          aria-label={`${notification.message} Fermer la notification`}
        >
          {notification.message}
        </button>
      ))}
    </div>
  )
}

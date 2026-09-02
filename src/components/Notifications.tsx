import { useCallback, useEffect, useState } from 'react'
import { useGame } from '../context/GameContext'
import type { GameNotification } from '../types/game'

const NOTIFICATION_DURATION_MS = 4_500

const NotificationToast = ({
  notification,
  onDismiss,
}: {
  notification: GameNotification
  onDismiss: (notificationId: string) => void
}) => {
  const [visible, setVisible] = useState(true)
  const dismiss = useCallback(() => {
    setVisible(false)
    onDismiss(notification.id)
  }, [notification.id, onDismiss])

  useEffect(() => {
    const timeout = window.setTimeout(dismiss, NOTIFICATION_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [dismiss])

  if (!visible) return null

  return (
    <button
      type="button"
      className={`pointer-events-auto min-h-12 w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold leading-5 shadow-raised transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
        notification.tone === 'success'
          ? 'bg-success-soft text-success'
          : notification.tone === 'warning'
            ? 'bg-warning-soft text-warning'
            : 'bg-surface text-ink'
      }`}
      onClick={dismiss}
      aria-label={`${notification.message} Fermer la notification`}
    >
      {notification.message}
    </button>
  )
}

export const Notifications = () => {
  const { state, dispatch } = useGame()
  const dismiss = useCallback((notificationId: string) => {
    dispatch({ type: 'DISMISS_NOTIFICATION', notificationId })
  }, [dispatch])

  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex max-h-[calc(100dvh-6rem)] flex-col items-end gap-2 overflow-y-auto sm:left-auto sm:right-5 sm:top-5 sm:w-[24rem]"
      aria-live="polite"
      aria-label="Notifications"
    >
      {state.notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={dismiss}
        />
      ))}
    </div>
  )
}

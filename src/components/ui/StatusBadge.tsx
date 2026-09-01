import type { PropsWithChildren } from 'react'

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'inverse'

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-soft text-ink',
  accent: 'bg-signal-soft text-signal-hover',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  inverse: 'bg-ink text-paper',
}

export const StatusBadge = ({
  children,
  tone = 'neutral',
  className = '',
}: PropsWithChildren<{ tone?: StatusTone; className?: string }>) => (
  <span className={`status-badge ${toneClass[tone]} ${className}`}>{children}</span>
)

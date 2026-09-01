interface MetricTileProps {
  label: string
  value: string
  detail?: string
  tone?: 'default' | 'accent' | 'success' | 'danger'
  className?: string
}

const toneClass = {
  default: 'text-ink',
  accent: 'text-signal',
  success: 'text-success',
  danger: 'text-danger',
}

export const MetricTile = ({
  label,
  value,
  detail,
  tone = 'default',
  className = '',
}: MetricTileProps) => (
  <div className={`stat-tile ${className}`}>
    <p className="data-label">{label}</p>
    <p className={`stat-value ${toneClass[tone]}`}>{value}</p>
    {detail && <p className="mt-1 text-sm leading-5 text-muted">{detail}</p>}
  </div>
)

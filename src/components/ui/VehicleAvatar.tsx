interface VehicleAvatarProps {
  compact?: boolean
}

export const VehicleAvatar = ({ compact = false }: VehicleAvatarProps) => (
  <span
    className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-soft text-drive shadow-inset ${
      compact ? 'h-12 w-12' : 'h-16 w-16'
    }`}
    aria-hidden="true"
  >
    <svg className={compact ? 'h-6 w-8' : 'h-8 w-11'} viewBox="0 0 48 30" fill="none">
      <path d="M8.5 19.5 12 11.8a4 4 0 0 1 3.65-2.35h16.7A4 4 0 0 1 36 11.8l3.5 7.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 19.5h36v5.25A2.25 2.25 0 0 1 39.75 27H8.25A2.25 2.25 0 0 1 6 24.75V19.5Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="2" />
      <path d="M12 23h.01M36 23h.01" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  </span>
)

import { useState } from 'react'

interface RecoveryCodeDisplayProps {
  code: string
  compact?: boolean
}

export const RecoveryCodeDisplay = ({ code, compact = false }: RecoveryCodeDisplayProps) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={`rounded-[1.5rem] bg-paper/75 text-ink shadow-inset ${compact ? 'p-5 sm:p-6' : 'p-6 sm:p-7'}`}>
      <p className="text-sm font-semibold text-muted">Code de récupération</p>
      <output className={`mt-5 block break-words font-mono font-bold leading-relaxed tracking-[0.035em] ${compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}`}>
        {code}
      </output>
      <button
        type="button"
        className="text-action mt-4 -ml-3"
        onClick={() => void copy()}
      >
        {copied ? 'Code copié' : 'Copier le code'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{copied ? 'Le code a été copié.' : ''}</span>
    </div>
  )
}

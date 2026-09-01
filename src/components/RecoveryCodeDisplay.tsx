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
    <div className={`border-2 border-ink border-t-[0.5rem] border-t-signal bg-ink text-white ${compact ? 'p-5 sm:p-6' : 'p-6 sm:p-8'}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/20 pb-3">
        <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-white/50">Clé de récupération</p>
        <span className="font-mono text-xs text-white/40">GG / PRIVÉ</span>
      </div>
      <output className={`mt-5 block break-words font-mono font-bold leading-relaxed tracking-[0.035em] ${compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}`}>
        {code}
      </output>
      <button
        type="button"
        className="mt-5 min-h-11 border-b-2 border-signal text-sm font-bold text-white transition-colors hover:border-white"
        onClick={() => void copy()}
      >
        {copied ? 'Code copié' : 'Copier le code'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{copied ? 'Le code a été copié.' : ''}</span>
    </div>
  )
}

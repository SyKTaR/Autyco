import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { useAuth } from '../backend/AuthContext'

export const accentPresets = [
  { id: 'orange', label: 'Orange atelier', accent: '255 145 82', strong: '255 173 124', soft: '52 31 23' },
  { id: 'blue', label: 'Bleu course', accent: '121 167 255', strong: '155 190 255', soft: '24 36 58' },
  { id: 'green', label: 'Vert paddock', accent: '91 210 157', strong: '126 224 180', soft: '20 46 38' },
  { id: 'violet', label: 'Violet nocturne', accent: '191 154 255', strong: '211 185 255', soft: '41 31 59' },
  { id: 'red', label: 'Rouge carrosserie', accent: '255 132 151', strong: '255 165 178', soft: '58 27 36' },
  { id: 'teal', label: 'Turquoise établi', accent: '85 211 205', strong: '125 225 220', soft: '19 47 47' },
] as const

export type AccentId = (typeof accentPresets)[number]['id']

const storageKey = 'garage-game-accents-v1'
const defaultAccent: AccentId = 'orange'

const isAccentId = (value: string | null): value is AccentId =>
  accentPresets.some((preset) => preset.id === value)

const readStoredAccents = (): Record<string, AccentId> => {
  if (typeof window === 'undefined') return {}
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, AccentId] => isAccentId(String(entry[1]))),
    )
  } catch {
    return {}
  }
}

interface AccentThemeValue {
  accentId: AccentId
  setAccentId: (accentId: AccentId) => void
}

const AccentThemeContext = createContext<AccentThemeValue | null>(null)

export const AccentThemeProvider = ({ children }: PropsWithChildren) => {
  const auth = useAuth()
  const ownerId = auth.session?.user.id ?? 'local'
  const [storedAccents, setStoredAccents] = useState<Record<string, AccentId>>(readStoredAccents)
  const accentId = storedAccents[ownerId] ?? defaultAccent

  const setAccentId = (nextAccentId: AccentId) => {
    setStoredAccents((currentAccents) => ({
      ...currentAccents,
      [ownerId]: nextAccentId,
    }))
  }

  useLayoutEffect(() => {
    const preset = accentPresets.find((candidate) => candidate.id === accentId) ?? accentPresets[0]
    const root = document.documentElement
    root.style.setProperty('--accent', preset.accent)
    root.style.setProperty('--accent-strong', preset.strong)
    root.style.setProperty('--accent-soft', preset.soft)
    root.dataset.accent = preset.id
  }, [accentId])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(storedAccents))
    } catch {
      // Le thème reste actif pour la session si le stockage navigateur est indisponible.
    }
  }, [storedAccents])

  const value = useMemo(() => ({ accentId, setAccentId }), [accentId, ownerId])

  return <AccentThemeContext.Provider value={value}>{children}</AccentThemeContext.Provider>
}

export const useAccentTheme = () => {
  const context = useContext(AccentThemeContext)
  if (!context) throw new Error('useAccentTheme doit être utilisé dans AccentThemeProvider')
  return context
}

import {
  useCallback,
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
  {
    id: 'orange',
    label: 'Orange atelier',
    dark: { accent: '255 145 82', strong: '255 173 124', soft: '52 31 23', onAccent: '8 10 14' },
    light: { accent: '190 76 24', strong: '150 54 12', soft: '246 220 202', onAccent: '255 250 246' },
  },
  {
    id: 'blue',
    label: 'Bleu course',
    dark: { accent: '121 167 255', strong: '155 190 255', soft: '24 36 58', onAccent: '8 10 14' },
    light: { accent: '48 94 178', strong: '30 69 143', soft: '216 226 244', onAccent: '255 255 255' },
  },
  {
    id: 'green',
    label: 'Vert paddock',
    dark: { accent: '91 210 157', strong: '126 224 180', soft: '20 46 38', onAccent: '8 10 14' },
    light: { accent: '35 121 82', strong: '24 91 59', soft: '211 234 222', onAccent: '255 255 255' },
  },
  {
    id: 'violet',
    label: 'Violet nocturne',
    dark: { accent: '191 154 255', strong: '211 185 255', soft: '41 31 59', onAccent: '8 10 14' },
    light: { accent: '110 75 173', strong: '83 52 143', soft: '229 219 242', onAccent: '255 255 255' },
  },
  {
    id: 'red',
    label: 'Rouge carrosserie',
    dark: { accent: '255 132 151', strong: '255 165 178', soft: '58 27 36', onAccent: '8 10 14' },
    light: { accent: '174 56 75', strong: '137 37 55', soft: '243 216 220', onAccent: '255 255 255' },
  },
  {
    id: 'teal',
    label: 'Turquoise établi',
    dark: { accent: '85 211 205', strong: '125 225 220', soft: '19 47 47', onAccent: '8 10 14' },
    light: { accent: '22 119 117', strong: '12 89 88', soft: '207 234 231', onAccent: '255 255 255' },
  },
] as const

export type AccentId = (typeof accentPresets)[number]['id']
export type ColorScheme = 'light' | 'dark'

const storageKey = 'garage-game-accents-v1'
const colorSchemeStorageKey = 'garage-game-color-scheme-v1'
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

const isColorScheme = (value: string | null): value is ColorScheme =>
  value === 'light' || value === 'dark'

const readInitialColorScheme = (): ColorScheme => {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(colorSchemeStorageKey)
    if (isColorScheme(stored)) return stored
  } catch {
    // La préférence système reste disponible si le stockage est bloqué.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface AccentThemeValue {
  accentId: AccentId
  setAccentId: (accentId: AccentId) => void
  colorScheme: ColorScheme
  setColorScheme: (colorScheme: ColorScheme) => void
}

const AccentThemeContext = createContext<AccentThemeValue | null>(null)

export const AccentThemeProvider = ({ children }: PropsWithChildren) => {
  const auth = useAuth()
  const ownerId = auth.session?.user.id ?? 'local'
  const [storedAccents, setStoredAccents] = useState<Record<string, AccentId>>(readStoredAccents)
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readInitialColorScheme)
  const accentId = storedAccents[ownerId] ?? defaultAccent

  const setAccentId = useCallback((nextAccentId: AccentId) => {
    setStoredAccents((currentAccents) => ({
      ...currentAccents,
      [ownerId]: nextAccentId,
    }))
  }, [ownerId])

  useLayoutEffect(() => {
    const preset = accentPresets.find((candidate) => candidate.id === accentId) ?? accentPresets[0]
    const palette = preset[colorScheme]
    const root = document.documentElement
    root.style.setProperty('--accent', palette.accent)
    root.style.setProperty('--accent-strong', palette.strong)
    root.style.setProperty('--accent-soft', palette.soft)
    root.style.setProperty('--on-accent', palette.onAccent)
    root.dataset.accent = preset.id
    root.dataset.theme = colorScheme
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', colorScheme === 'light' ? '#ece9e2' : '#080a0e')
  }, [accentId, colorScheme])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(storedAccents))
    } catch {
      // Le thème reste actif pour la session si le stockage navigateur est indisponible.
    }
  }, [storedAccents])

  useEffect(() => {
    try {
      window.localStorage.setItem(colorSchemeStorageKey, colorScheme)
    } catch {
      // Le choix reste actif pour la session si le stockage navigateur est indisponible.
    }
  }, [colorScheme])

  const value = useMemo(
    () => ({ accentId, setAccentId, colorScheme, setColorScheme }),
    [accentId, setAccentId, colorScheme],
  )

  return <AccentThemeContext.Provider value={value}>{children}</AccentThemeContext.Provider>
}

export const useAccentTheme = () => {
  const context = useContext(AccentThemeContext)
  if (!context) throw new Error('useAccentTheme doit être utilisé dans AccentThemeProvider')
  return context
}

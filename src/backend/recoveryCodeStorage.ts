const RECOVERY_CODE_STORAGE_PREFIX = 'garage-game:recovery-code:v1'
const RECOVERY_CODE_PATTERN = /^GG-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/

export interface RecoveryCodeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const getBrowserStorage = (): RecoveryCodeStorage | null => {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

const recoveryCodeStorageKey = (playerId: string) =>
  `${RECOVERY_CODE_STORAGE_PREFIX}:${playerId}`

export const loadStoredRecoveryCode = (
  playerId: string,
  storage = getBrowserStorage(),
): string | null => {
  if (!storage || !playerId) return null
  try {
    const code = storage.getItem(recoveryCodeStorageKey(playerId))
    return code && RECOVERY_CODE_PATTERN.test(code) ? code : null
  } catch {
    return null
  }
}

export const storeRecoveryCode = (
  playerId: string,
  code: string,
  storage = getBrowserStorage(),
) => {
  if (!storage || !playerId || !RECOVERY_CODE_PATTERN.test(code)) return false
  try {
    storage.setItem(recoveryCodeStorageKey(playerId), code)
    return true
  } catch {
    return false
  }
}

export const clearStoredRecoveryCode = (
  playerId: string,
  storage = getBrowserStorage(),
) => {
  if (!storage || !playerId) return
  try {
    storage.removeItem(recoveryCodeStorageKey(playerId))
  } catch {
    // Le retrait de la session doit rester possible si le stockage local est indisponible.
  }
}

export const issueAndStoreRecoveryCode = async (
  playerId: string,
  issueCode: () => Promise<string>,
  storage = getBrowserStorage(),
) => {
  const code = await issueCode()
  storeRecoveryCode(playerId, code, storage)
  return code
}

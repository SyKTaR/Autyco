import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clearStoredRecoveryCode,
  issueAndStoreRecoveryCode,
  loadStoredRecoveryCode,
  storeRecoveryCode,
  type RecoveryCodeStorage,
} from '../backend/recoveryCodeStorage'

class MemoryStorage implements RecoveryCodeStorage {
  private value = new Map<string, string>()

  getItem(key: string) {
    return this.value.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.value.set(key, value)
  }

  removeItem(key: string) {
    this.value.delete(key)
  }
}

const firstCode = 'GG-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF'
const secondCode = 'GG-FEDC-BA98-7654-3210-FEDC-BA98-7654-3210'

describe('code de récupération local', () => {
  it('réouvre les Réglages après plusieurs rechargements sans réémettre de code', async () => {
    const storage = new MemoryStorage()
    let serverEmissions = 0
    const issueCode = async () => {
      serverEmissions += 1
      return firstCode
    }

    assert.equal(
      await issueAndStoreRecoveryCode('player-a', issueCode, storage),
      firstCode,
    )

    // Chaque lecture avec un état mémoire vide simule un nouveau chargement de page.
    assert.equal(loadStoredRecoveryCode('player-a', storage), firstCode)
    assert.equal(loadStoredRecoveryCode('player-a', storage), firstCode)
    assert.equal(loadStoredRecoveryCode('player-a', storage), firstCode)
    assert.equal(serverEmissions, 1)
  })

  it('ne génère rien quand cet appareil ne possède pas le code', () => {
    const storage = new MemoryStorage()

    assert.equal(loadStoredRecoveryCode('player-a', storage), null)
  })

  it('remplace le cache uniquement après une rotation explicite', async () => {
    const storage = new MemoryStorage()
    let serverEmissions = 0
    storeRecoveryCode('player-a', firstCode, storage)

    const rotatedCode = await issueAndStoreRecoveryCode(
      'player-a',
      async () => {
        serverEmissions += 1
        return secondCode
      },
      storage,
    )

    assert.equal(rotatedCode, secondCode)
    assert.equal(loadStoredRecoveryCode('player-a', storage), secondCode)
    assert.equal(serverEmissions, 1)
  })

  it('isole le code par compte et le retire avec la session locale', () => {
    const storage = new MemoryStorage()
    storeRecoveryCode('player-a', firstCode, storage)
    storeRecoveryCode('player-b', secondCode, storage)

    clearStoredRecoveryCode('player-a', storage)

    assert.equal(loadStoredRecoveryCode('player-a', storage), null)
    assert.equal(loadStoredRecoveryCode('player-b', storage), secondCode)
  })
})

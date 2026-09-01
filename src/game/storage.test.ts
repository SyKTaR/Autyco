import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialGame } from './engine'
import {
  loadGame,
  loadRemoteGame,
  saveGame,
  saveRemoteGame,
  type StorageAdapter,
} from './storage'

class MemoryStorage implements StorageAdapter {
  private value = new Map<string, string>()

  getItem(key: string) {
    return this.value.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.value.set(key, value)
  }
}

describe('sauvegarde locale', () => {
  it('sauvegarde et recharge un état valide', () => {
    const storage = new MemoryStorage()
    const game = createInitialGame(1_000, () => 0.2)
    game.cash = 12_345

    assert.equal(saveGame(game, storage), true)
    assert.equal(loadGame(storage)?.cash, 12_345)
    assert.equal(loadGame(storage)?.listings.length, 10)
    assert.equal(loadGame(storage)?.version, 2)
  })

  it('migre une sauvegarde v1 en conservant la partie en cours', () => {
    const storage = new MemoryStorage()
    const current = createInitialGame(1_000, () => 0.2)
    const legacyVehicle = {
      id: 'vehicle-legacy',
      listingId: current.listings[0].id,
      templateId: current.listings[0].templateId,
      maker: current.listings[0].maker,
      model: current.listings[0].model,
      segment: current.listings[0].segment,
      year: current.listings[0].year,
      mileage: current.listings[0].mileage,
      purchasePrice: current.listings[0].askingPrice,
      marketValue: current.listings[0].marketValue,
      risk: current.listings[0].risk,
      status: 'needs-diagnosis',
      problems: [],
      repairCosts: 0,
      repairsSkipped: false,
      acquiredAt: 1_100,
    }
    storage.setItem(
      'garage-game:save:v1',
      JSON.stringify({
        version: 1,
        cash: 7_654,
        capacity: 3,
        profitToday: 900,
        profitDayKey: current.profitDayKey,
        vehicles: [legacyVehicle],
        listings: current.listings,
        notifications: [],
      }),
    )

    const migrated = loadGame(storage)
    assert.equal(migrated?.version, 2)
    assert.equal(migrated?.cash, 7_654)
    assert.equal(migrated?.vehicles[0].kept, false)
    assert.deepEqual(migrated?.properties, [])
  })

  it('ignore une sauvegarde corrompue', () => {
    const storage = new MemoryStorage()
    storage.setItem('garage-game:save:v1', '{non valide')
    assert.equal(loadGame(storage), null)
  })

  it('isole le cache de chaque compte de la partie locale', () => {
    const storage = new MemoryStorage()
    const localGame = createInitialGame(1_000, () => 0.2)
    const remoteGame = { ...localGame, cash: 87_654 }

    saveGame(localGame, storage)
    saveRemoteGame(remoteGame, 'player-a', storage)

    assert.equal(loadGame(storage)?.cash, 20_000)
    assert.equal(loadRemoteGame('player-a', storage)?.cash, 87_654)
    assert.equal(loadRemoteGame('player-b', storage), null)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialGame } from './engine'
import {
  loadGame,
  loadLastActiveAt,
  loadRemoteGame,
  saveGame,
  saveLastActiveAt,
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
    assert.equal(loadGame(storage)?.listings.length, 13)
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

  it('complète la gravité et la sélection absentes d’une sauvegarde v2 existante', () => {
    const storage = new MemoryStorage()
    const current = createInitialGame(1_000, () => 0.2)
    const listing = current.listings[0]
    storage.setItem(
      'garage-game:save:v2',
      JSON.stringify({
        ...current,
        vehicles: [{
          id: 'vehicle-old-v2',
          listingId: listing.id,
          templateId: listing.templateId,
          maker: listing.maker,
          model: listing.model,
          segment: listing.segment,
          year: listing.year,
          mileage: listing.mileage,
          purchasePrice: listing.askingPrice,
          marketValue: listing.marketValue,
          risk: listing.risk,
          status: 'repairing',
          problems: [{
            id: 'brakes',
            label: 'Freinage usé',
            detail: 'Disques et plaquettes avant',
            cost: 380,
            durationSeconds: 5,
            resaleImpact: 720,
            repaired: false,
          }],
          repairCosts: 0,
          repairsSkipped: false,
          kept: false,
          acquiredAt: 1_100,
        }],
      }),
    )

    const migratedProblem = loadGame(storage)?.vehicles[0].problems[0]
    assert.equal(migratedProblem?.severity, 'critical')
    assert.equal(migratedProblem?.selectedForRepair, true)
  })

  it('classe les anciennes annonces et recrée les échéances de marché absentes', () => {
    const storage = new MemoryStorage()
    const current = createInitialGame(1_000, () => 0.2)
    const listingsWithoutMarket = current.listings.map(({ market: _market, ...listing }) => listing)
    const { marketRefreshAt: _marketRefreshAt, ...stateWithoutRefreshes } = current
    storage.setItem(
      'garage-game:save:v2',
      JSON.stringify({ ...stateWithoutRefreshes, listings: listingsWithoutMarket }),
    )

    const migrated = loadGame(storage)
    assert.deepEqual(
      [...new Set(migrated?.listings.map((listing) => listing.market))].sort(),
      ['collector', 'premium', 'standard'],
    )
    assert.ok((migrated?.marketRefreshAt.collector ?? 0) > 1_000)
    assert.equal(
      migrated?.marketRefreshAt.collector,
      Math.max(...current.listings
        .filter((listing) => listing.market === 'collector')
        .map((listing) => listing.expiresAt)),
    )
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

  it('isole aussi la dernière activité locale de chaque compte', () => {
    const storage = new MemoryStorage()

    assert.equal(saveLastActiveAt(10_000, undefined, storage), true)
    assert.equal(saveLastActiveAt(20_000, 'player-a', storage), true)
    assert.equal(loadLastActiveAt(undefined, storage), 10_000)
    assert.equal(loadLastActiveAt('player-a', storage), 20_000)
    assert.equal(loadLastActiveAt('player-b', storage), null)
  })
})

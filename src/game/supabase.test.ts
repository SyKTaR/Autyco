import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  SupabaseRequestError,
  createPlayerIdentity,
  loadStoredSession,
  loadSupabaseConfiguration,
  performRemoteGameAction,
  recoverPlayer,
  signInAnonymously,
  storeSession,
  type AuthSession,
  type SupabaseConfiguration,
} from '../backend/supabase'
import { createInitialGame } from './engine'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const configuration: SupabaseConfiguration = {
  url: 'https://garage-game.supabase.co',
  publicKey: 'sb_publishable_test_key_long_enough',
}

const session: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 3_600_000,
  user: { id: 'player-id', isAnonymous: true },
}

const authResponse = {
  access_token: session.accessToken,
  refresh_token: session.refreshToken,
  expires_in: 3600,
  user: { id: session.user.id, is_anonymous: true },
}

describe('adaptateur Supabase', () => {
  it('charge uniquement une URL valide et une clé publique', () => {
    assert.deepEqual(loadSupabaseConfiguration({
      VITE_SUPABASE_URL: 'https://garage-game.supabase.co/',
      VITE_SUPABASE_PUBLISHABLE_KEY: configuration.publicKey,
    }), configuration)

    assert.equal(loadSupabaseConfiguration({
      VITE_SUPABASE_URL: 'https://garage-game.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_this_must_never_reach_the_browser',
    }), null)
    assert.equal(loadSupabaseConfiguration({
      VITE_SUPABASE_URL: 'javascript:alert(1)',
      VITE_SUPABASE_PUBLISHABLE_KEY: configuration.publicKey,
    }), null)
  })

  it('ouvre une session anonyme sans email ni mot de passe', async () => {
    let requestUrl = ''
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify(authResponse), { status: 200 })
    }

    const signedIn = await signInAnonymously(configuration, 'Garage des Docks', 'Lucas')
    assert.equal(signedIn.user.id, session.user.id)
    assert.equal(signedIn.user.isAnonymous, true)
    assert.match(requestUrl, /\/auth\/v1\/signup$/)
    assert.deepEqual(requestBody, {
      data: { garage_name: 'Garage des Docks', player_name: 'Lucas' },
    })
    assert.equal('email' in requestBody, false)
    assert.equal('password' in requestBody, false)
  })

  it('crée l’identité via RPC et valide la présence du code', async () => {
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        garageName: 'Garage des Docks',
        playerName: 'Lucas',
        recoveryCode: 'GG-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF',
      }), { status: 200 })
    }

    const identity = await createPlayerIdentity(
      configuration,
      session,
      ' Garage des Docks ',
      ' Lucas ',
    )
    assert.equal(identity.playerName, 'Lucas')
    assert.match(identity.recoveryCode, /^GG-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/)
    assert.deepEqual(requestBody, {
      p_garage_name: 'Garage des Docks',
      p_player_name: 'Lucas',
    })
  })

  it('remonte un code de récupération refusé sans le journaliser ni le transformer', async () => {
    const code = 'GG-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111'
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ ok: false, error: 'Code inconnu ou expiré.' }), {
        status: 200,
      })
    }

    await assert.rejects(
      recoverPlayer(configuration, session, code),
      (error: unknown) => error instanceof SupabaseRequestError && error.status === 400,
    )
    assert.equal(requestBody.p_recovery_code, code)
  })

  it('valide une restauration uniquement si le serveur renvoie la nouvelle clé', async () => {
    const renewedCode = 'GG-1111-2222-3333-4444-5555-6666-7777-8888'
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      garageName: 'Garage des Docks',
      playerName: 'Lucas',
      recoveryCode: renewedCode,
    }), { status: 200 })

    const identity = await recoverPlayer(
      configuration,
      session,
      'GG-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
    )
    assert.equal(identity.garageName, 'Garage des Docks')
    assert.equal(identity.recoveryCode, renewedCode)
  })

  it('ignore les anciennes sessions email et persiste le nouveau format anonyme', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size },
    } satisfies Storage

    values.set('garage-game:supabase-session:v1', JSON.stringify({ user: { email: 'old@test' } }))
    storeSession(session, storage)
    assert.equal(values.has('garage-game:supabase-session:v1'), false)
    assert.deepEqual(loadStoredSession(storage), session)
  })

  it('envoie une action critique à la RPC sans transmettre le timestamp client', async () => {
    const remoteState = createInitialGame(1_000, () => 0.2)
    remoteState.listings[0].id = '5c967aca-4545-4d28-9bda-544f8622150f'
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify(remoteState), { status: 200 })
    }

    const result = await performRemoteGameAction(configuration, session, {
      type: 'BUY_LISTING',
      listingId: remoteState.listings[0].id,
      now: 999_999_999,
    })

    assert.equal(requestBody.p_action, 'BUY_LISTING')
    assert.deepEqual(requestBody.p_payload, { listingId: remoteState.listings[0].id })
    assert.equal('now' in (requestBody.p_payload as Record<string, unknown>), false)
    assert.match(String(requestBody.p_request_id), /^[0-9a-f-]{36}$/)
    assert.equal(result.cash, remoteState.cash)
  })
})

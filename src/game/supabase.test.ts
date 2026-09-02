import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  SupabaseRequestError,
  createPrivateServer,
  createPlayerIdentity,
  fetchExistingPlayerIdentity,
  fetchCurrentPrivateServer,
  fetchPrivateServerLeaderboard,
  joinPrivateServer,
  loadStoredSession,
  loadSupabaseConfiguration,
  performRemoteGameAction,
  recoverPlayer,
  recoverSessionFromUrl,
  requestRecoveryEmailOtp,
  signInAnonymously,
  storeSession,
  updateRecoveryEmail,
  verifyRecoveryEmailOtp,
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

  it('lie un email au même utilisateur après réservation du quota', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = []
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({
        url,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: new Headers(init?.headers).get('Authorization') ?? undefined,
      })
      if (url.includes('/reserve_email_auth_attempt')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({
        id: session.user.id,
        new_email: 'lucas@example.com',
        is_anonymous: true,
        email_change_sent_at: '2026-09-02T10:00:00Z',
      }), { status: 200 })
    }

    const user = await updateRecoveryEmail(
      configuration,
      session,
      ' Lucas@Example.com ',
      'https://autyco.example/app',
    )

    assert.deepEqual(requests[0].body, {
      p_email: 'lucas@example.com',
      p_action: 'send',
    })
    assert.equal(requests[0].authorization, `Bearer ${session.accessToken}`)
    assert.match(requests[1].url, /\/auth\/v1\/user\?redirect_to=/)
    assert.deepEqual(requests[1].body, { email: 'lucas@example.com' })
    assert.equal(user.id, session.user.id)
    assert.equal(user.pendingEmail, 'lucas@example.com')
    assert.equal(user.isAnonymous, true)
  })

  it('demande une connexion email sans autoriser la création d’un compte', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({
        url,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      })
      return new Response(
        JSON.stringify(url.includes('/reserve_email_auth_attempt') ? { ok: true } : {}),
        { status: 200 },
      )
    }

    await requestRecoveryEmailOtp(
      configuration,
      ' Lucas@Example.com ',
      'https://autyco.example/app',
    )

    assert.deepEqual(requests[0].body, {
      p_email: 'lucas@example.com',
      p_action: 'send',
    })
    assert.match(requests[1].url, /\/auth\/v1\/otp\?redirect_to=/)
    assert.deepEqual(requests[1].body, {
      email: 'lucas@example.com',
      create_user: false,
    })
  })

  it('n’appelle pas Auth quand le quota applicatif refuse un nouvel envoi', async () => {
    let requestCount = 0
    globalThis.fetch = async () => {
      requestCount += 1
      return new Response(JSON.stringify({ ok: false, rateLimited: true }), { status: 200 })
    }

    await assert.rejects(
      requestRecoveryEmailOtp(configuration, 'lucas@example.com'),
      (error: unknown) => error instanceof SupabaseRequestError
        && error.status === 429
        && error.code === 'email_auth_rate_limited',
    )
    assert.equal(requestCount, 1)
  })

  it('vérifie un OTP email après réservation et conserve le player_id', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({
        url,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      })
      if (url.includes('/reserve_email_auth_attempt')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({
        ...authResponse,
        user: {
          id: session.user.id,
          email: 'lucas@example.com',
          email_confirmed_at: '2026-09-02T10:00:00Z',
          is_anonymous: false,
        },
      }), { status: 200 })
    }

    const restored = await verifyRecoveryEmailOtp(
      configuration,
      'lucas@example.com',
      '12 34 56',
    )

    assert.deepEqual(requests[0].body, {
      p_email: 'lucas@example.com',
      p_action: 'verify',
    })
    assert.deepEqual(requests[1].body, {
      email: 'lucas@example.com',
      token: '123456',
      type: 'email',
    })
    assert.equal(restored.user.id, session.user.id)
    assert.equal(restored.user.isAnonymous, false)
    assert.equal(restored.user.emailConfirmedAt, '2026-09-02T10:00:00Z')
  })

  it('ne relaie pas le détail interne d’un OTP refusé', async () => {
    let requestCount = 0
    globalThis.fetch = async () => {
      requestCount += 1
      if (requestCount === 1) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({
        error_code: 'otp_expired',
        msg: 'sensitive provider detail',
      }), { status: 403 })
    }

    await assert.rejects(
      verifyRecoveryEmailOtp(configuration, 'lucas@example.com', '123456'),
      (error: unknown) => error instanceof SupabaseRequestError
        && error.code === 'invalid_email_otp'
        && !error.message.includes('provider'),
    )
  })

  it('restaure une session depuis le fragment sécurisé d’un lien magique', async () => {
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /\/auth\/v1\/user$/)
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer magic-access')
      return new Response(JSON.stringify({
        id: session.user.id,
        email: 'lucas@example.com',
        email_confirmed_at: '2026-09-02T10:00:00Z',
        is_anonymous: false,
      }), { status: 200 })
    }

    const restored = await recoverSessionFromUrl(
      configuration,
      new URL('https://autyco.example/#access_token=magic-access&refresh_token=magic-refresh&expires_in=3600'),
    )

    assert.equal(restored?.accessToken, 'magic-access')
    assert.equal(restored?.refreshToken, 'magic-refresh')
    assert.equal(restored?.user.id, session.user.id)
  })

  it('charge l’identité email sans déclencher la création automatique d’un garage', async () => {
    let requestUrl = ''
    globalThis.fetch = async (input) => {
      requestUrl = String(input)
      return new Response(JSON.stringify({
        garageName: 'Garage des Docks',
        playerName: 'Lucas',
      }), { status: 200 })
    }

    const identity = await fetchExistingPlayerIdentity(configuration, session)
    assert.match(requestUrl, /\/rest\/v1\/rpc\/get_existing_player_identity$/)
    assert.equal(identity.garageName, 'Garage des Docks')
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

  it('transmet au serveur uniquement les postes de réparation sélectionnés', async () => {
    const remoteState = createInitialGame(1_000, () => 0.2)
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify(remoteState), { status: 200 })
    }

    await performRemoteGameAction(configuration, session, {
      type: 'START_REPAIR',
      vehicleId: '5c967aca-4545-4d28-9bda-544f8622150f',
      problemIds: ['brakes', 'service'],
      now: 999_999_999,
    })

    assert.equal(requestBody.p_action, 'START_REPAIR')
    assert.deepEqual(requestBody.p_payload, {
      vehicleId: '5c967aca-4545-4d28-9bda-544f8622150f',
      problemIds: ['brakes', 'service'],
    })
  })

  it('transmet la consigne commerciale bornée à la RPC sans timestamp client', async () => {
    const remoteState = createInitialGame(1_000, () => 0.2)
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify(remoteState), { status: 200 })
    }
    const settings = {
      enabled: true,
      maxPurchasePrice: 42_000,
      minDiscountPercent: 18,
      marketProfile: 'premium' as const,
    }

    await performRemoteGameAction(configuration, session, {
      type: 'UPDATE_COMMERCIAL_SETTINGS',
      settings,
      now: 999_999_999,
    })

    assert.equal(requestBody.p_action, 'UPDATE_COMMERCIAL_SETTINGS')
    assert.deepEqual(requestBody.p_payload, { settings })
    assert.equal('now' in (requestBody.p_payload as Record<string, unknown>), false)
  })

  it('crée un serveur privé via la RPC et valide son code éphémère', async () => {
    let requestUrl = ''
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        ok: true,
        server: {
          id: 'server-1',
          name: 'Les Docks',
          memberCount: 1,
          createdAt: 1_000,
          isOwner: true,
        },
        inviteCode: 'SRV-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF',
      }), { status: 200 })
    }

    const result = await createPrivateServer(configuration, session, ' Les Docks ')
    assert.match(requestUrl, /\/rest\/v1\/rpc\/create_private_server$/)
    assert.deepEqual(requestBody, {
      p_name: 'Les Docks',
      p_replace_current: false,
    })
    assert.equal(result.server?.memberCount, 1)
    assert.match(result.inviteCode ?? '', /^SRV-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/)
  })

  it('préserve la confirmation explicite avant de remplacer un serveur', async () => {
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        ok: false,
        requiresConfirmation: true,
        error: 'Rejoindre ce serveur remplacera ta dépendance actuelle.',
      }), { status: 200 })
    }

    const result = await joinPrivateServer(
      configuration,
      session,
      'SRV-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
    )
    assert.equal(result.ok, false)
    assert.equal(result.requiresConfirmation, true)
    assert.equal(requestBody.p_replace_current, false)
    assert.equal(
      requestBody.p_invite_code,
      'SRV-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
    )
  })

  it('accepte une absence de serveur sans fabriquer de données', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ server: null }), { status: 200 })
    assert.equal(await fetchCurrentPrivateServer(configuration, session), null)
  })

  it('valide chaque membre du classement en lecture seule', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      server: {
        id: 'server-1',
        name: 'Les Docks',
        memberCount: 2,
        createdAt: 1_000,
        isOwner: true,
      },
      members: [{
        rank: 1,
        playerId: 'player-id',
        playerName: 'Lucas',
        garageName: 'Garage des Docks',
        cash: 20_000,
        fleetValue: 31_000,
        totalValue: 51_000,
        vehicleCount: 2,
        isCurrentPlayer: true,
      }],
    }), { status: 200 })

    const leaderboard = await fetchPrivateServerLeaderboard(configuration, session)
    assert.equal(leaderboard.members.length, 1)
    assert.equal(leaderboard.members[0].totalValue, 51_000)
    assert.equal(leaderboard.members[0].isCurrentPlayer, true)
  })
})

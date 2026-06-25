'use client'

import { useSession, useUser } from '@clerk/nextjs'
import { createClient } from '@supabase/supabase-js'
import * as React from 'react'
import * as Y from 'yjs'

type Permission = 'view' | 'comment' | 'edit'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

type PresenceUser = {
    clientId: string
    userId: string
    name: string
    color: string
    permission: Permission
    joinedAt: number
    cursor?: {
        rowId: string
        columnId: string | number
        label: string
    }
}

type BroadcastPayload = {
    clientId: string
    update?: string
    stateVector?: string
    targetClientId?: string
}

type JwtDebugClaims = {
    sub?: string
    role?: string
    aud?: string | string[]
    iss?: string
    exp?: number
}

type ClerkSession = NonNullable<ReturnType<typeof useSession>['session']>
type SupabaseBrowserClient = ReturnType<typeof createClient<any, 'public', any>>

const REMOTE_ORIGIN = Symbol('supabase-realtime-remote')
const SUBSCRIBE_TIMEOUT_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 15_000
const RECONNECT_DELAY_MS = 1_500
const CHANNEL_OPERATION_TIMEOUT_MS = 5_000
const USE_PRIVATE_REALTIME = true

function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]!)
    }
    return window.btoa(binary)
}

function base64ToBytes(value: string) {
    const binary = window.atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes
}

function decodeJwtDebugClaims(token: string | null): JwtDebugClaims | null {
    if (!token) return null

    try {
        const payload = token.split('.')[1]
        if (!payload) return null

        const normalizedPayload = payload
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(Math.ceil(payload.length / 4) * 4, '=')
        const claims = JSON.parse(window.atob(normalizedPayload)) as JwtDebugClaims

        return {
            sub: claims.sub,
            role: claims.role,
            aud: claims.aud,
            iss: claims.iss,
            exp: claims.exp,
        }
    } catch {
        return null
    }
}

function getRealtimeErrorDebug(error: unknown) {
    if (!error) return null

    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        }
    }

    return String(error)
}

async function testSupabaseRestAuth(token: string | null, userId?: string) {
    if (!token || !userId) {
        return 'rest skipped'
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            return 'rest missing env'
        }

        const tableName = encodeURIComponent(
            'safe-cities-project-management-v2_user'
        )
        const url = new URL(`/rest/v1/${tableName}`, supabaseUrl)
        url.searchParams.set('id', `eq.${userId}`)
        url.searchParams.set('select', 'id,role')

        const response = await fetch(url, {
            headers: {
                apikey: supabaseAnonKey,
                authorization: `Bearer ${token}`,
            },
        })

        const body = await response.text()

        return `rest ${response.status}: ${body.slice(0, 120)}`
    } catch (error) {
        return `rest error: ${
            error instanceof Error ? error.message : String(error)
        }`
    }
}

function testPublicRealtimeChannel({
    supabase,
    documentId,
    clientId,
}: {
    supabase: SupabaseBrowserClient
    documentId: string | number
    clientId: string
}) {
    let cleanedUp = false
    const testChannel = supabase.channel(
        `live-editing-diagnostic:${documentId}:${clientId}`,
        {
            config: {
                broadcast: { self: true },
                presence: { key: clientId },
                private: false,
            },
        }
    )

    testChannel.subscribe((status, error) => {
        console.warn(
            `Supabase public realtime diagnostic: ${JSON.stringify({
                documentId,
                status,
                error: getRealtimeErrorDebug(error),
            })}`
        )

        if (
            status === 'SUBSCRIBED' ||
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
        ) {
            if (cleanedUp) return

            cleanedUp = true
            window.setTimeout(() => {
                void supabase.removeChannel(testChannel)
            }, 0)
        }
    }, SUBSCRIBE_TIMEOUT_MS)
}

function testBrowserRealtimeSocket() {
    return new Promise<string>((resolve) => {
        if (typeof window === 'undefined') {
            resolve('ws unavailable')
            return
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            resolve('ws missing env')
            return
        }

        const realtimeUrl = new URL('/realtime/v1/websocket', supabaseUrl)
        realtimeUrl.protocol = realtimeUrl.protocol.replace('http', 'ws')
        realtimeUrl.searchParams.set('apikey', supabaseAnonKey)
        realtimeUrl.searchParams.set('vsn', '1.0.0')

        let settled = false
        const timeout = window.setTimeout(() => {
            if (settled) return

            settled = true
            socket.close()
            resolve('ws timeout')
        }, 8_000)

        const socket = new WebSocket(realtimeUrl)

        socket.onopen = () => {
            if (settled) return

            settled = true
            window.clearTimeout(timeout)
            socket.close()
            resolve('ws open')
        }

        socket.onerror = () => {
            if (settled) return

            settled = true
            window.clearTimeout(timeout)
            resolve('ws error')
        }

        socket.onclose = (event) => {
            if (settled) return

            settled = true
            window.clearTimeout(timeout)
            resolve(`ws closed ${event.code}`)
        }
    })
}

async function getSupabaseRealtimeToken(session: ClerkSession) {
    const defaultToken = await session.getToken({ skipCache: true })
    const defaultClaims = decodeJwtDebugClaims(defaultToken)

    try {
        const templateToken = await session.getToken({
            template: 'supabase',
            skipCache: true,
        })
        const templateClaims = decodeJwtDebugClaims(templateToken)

        if (templateToken) {
            return {
                token: templateToken,
                claims: templateClaims,
                source: 'supabase-template',
            }
        }
    } catch (error) {
        console.warn(
            `Supabase live editing token template unavailable: ${JSON.stringify(
                getRealtimeErrorDebug(error)
            )}`
        )
    }

    if (defaultToken) {
        return {
            token: defaultToken,
            claims: defaultClaims,
            source:
                defaultClaims?.role === 'authenticated'
                    ? 'default'
                    : 'default-missing-authenticated-role',
        }
    }

    return {
        token: defaultToken,
        claims: defaultClaims,
        source: 'missing-token',
    }
}

function getStableColor(value: string) {
    const colors = [
        '#2563eb',
        '#059669',
        '#dc2626',
        '#7c3aed',
        '#d97706',
        '#0891b2',
        '#be123c',
        '#4f46e5',
    ]

    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0
    }

    return colors[hash % colors.length]!
}

function isYDocEmpty(ydoc: Y.Doc) {
    return ydoc.getXmlFragment('default').length === 0
}

function flattenPresenceState(
    state: Record<string, PresenceUser[]>
): PresenceUser[] {
    return Object.values(state).flat().filter(Boolean)
}

function getClientId() {
    if (typeof window === 'undefined') return 'server'
    return window.crypto.randomUUID()
}

function withTimeout<T>(
    promise: PromiseLike<T>,
    timeoutMs: number,
    timeoutValue: T
) {
    return new Promise<T>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            resolve(timeoutValue)
        }, timeoutMs)

        Promise.resolve(promise)
            .then((value) => {
                window.clearTimeout(timeout)
                resolve(value)
            })
            .catch((error) => {
                window.clearTimeout(timeout)
                reject(error)
            })
    })
}

export function useSupabaseYjsCollaboration({
    documentId,
    enabled,
    permission,
}: {
    documentId?: string | number | null
    enabled: boolean
    permission: Permission
}) {
    const { session, isLoaded: isSessionLoaded } = useSession()
    const { user } = useUser()
    const [ydoc] = React.useState(() => new Y.Doc())
    const [status, setStatus] = React.useState<ConnectionStatus>('idle')
    const [lastError, setLastError] = React.useState<string | null>(null)
    const [presenceUsers, setPresenceUsers] = React.useState<PresenceUser[]>([])
    const [shouldLoadInitialContent, setShouldLoadInitialContent] =
        React.useState(false)

    const clientIdRef = React.useRef<string>(getClientId())
    const hasReceivedRemoteUpdateRef = React.useRef(false)
    const hasLoadedInitialContentRef = React.useRef(false)
    const channelRef = React.useRef<ReturnType<
        ReturnType<typeof createClient>['channel']
    > | null>(null)
    const presenceMetadataRef = React.useRef<
        Partial<Pick<PresenceUser, 'cursor'>>
    >({})
    const realtimeSession = USE_PRIVATE_REALTIME ? session : null

    const supabase = React.useMemo(() => {
        if (!enabled) return null

        const logger = (kind: string, message: string, data: unknown) => {
            console.warn(`Supabase realtime ${kind}: ${message}`, data)
        }

        if (USE_PRIVATE_REALTIME) {
            if (!realtimeSession) return null

            return createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                {
                    accessToken: async () => realtimeSession.getToken(),
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false,
                    },
                    realtime: { logger },
                }
            )
        }

        return createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                },
                realtime: { logger },
            }
        )
    }, [enabled, realtimeSession])

    React.useEffect(() => {
        const isAuthReady = USE_PRIVATE_REALTIME ? isSessionLoaded : true

        if (!enabled || !documentId || !isAuthReady) {
            setStatus('idle')
            return
        }

        if (!user || !supabase || (USE_PRIVATE_REALTIME && !session)) {
            setStatus('error')
            return
        }

        const clientId = clientIdRef.current
        hasReceivedRemoteUpdateRef.current = false
        hasLoadedInitialContentRef.current = false
        setLastError(null)
        setShouldLoadInitialContent(false)
        setStatus('connecting')

        let cancelled = false
        let connected = false
        let initialContentTimer: ReturnType<typeof setTimeout> | null = null
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let reconnecting = false
        let reconnectAttempts = 0
        let recoveryCleanup: (() => void) | null = null
        let currentAuthInfo: {
            tokenClaims: JwtDebugClaims | null
            tokenSource: string
        } | null = null

        let channel: ReturnType<typeof supabase.channel> | null = null

        const getPresencePayload = (): PresenceUser => ({
            clientId,
            userId: user.id,
            name:
                user.fullName ||
                user.primaryEmailAddress?.emailAddress ||
                'User',
            color: getStableColor(user.id),
            permission,
            joinedAt: Date.now(),
            ...presenceMetadataRef.current,
        })

        const sendSyncRequest = () => {
            sendBroadcast('sync-request', {
                clientId,
                stateVector: bytesToBase64(Y.encodeStateVector(ydoc)),
            })
        }

        const updatePresence = () => {
            if (!channel) return

            setPresenceUsers(flattenPresenceState(channel.presenceState()))
        }

        const shouldThisClientSeedDocument = () => {
            if (!channel) return false

            const users = flattenPresenceState(channel.presenceState())
            const leader = [...users.map((presence) => presence.clientId)]
                .filter(Boolean)
                .sort()[0]

            return leader === clientId
        }

        const handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
            if (origin === REMOTE_ORIGIN) return

            sendBroadcast('yjs-update', {
                clientId,
                update: bytesToBase64(update),
            })
        }

        const bindChannelHandlers = (
            activeChannel: ReturnType<typeof supabase.channel>
        ) => {
            activeChannel
            .on('presence', { event: 'sync' }, updatePresence)
            .on('presence', { event: 'join' }, updatePresence)
            .on('presence', { event: 'leave' }, updatePresence)
            .on(
                'broadcast',
                { event: 'yjs-update' },
                ({ payload }: { payload: BroadcastPayload }) => {
                    if (
                        !payload?.update ||
                        payload.clientId === clientId ||
                        cancelled
                    ) {
                        return
                    }

                    hasReceivedRemoteUpdateRef.current = true
                    Y.applyUpdate(
                        ydoc,
                        base64ToBytes(payload.update),
                        REMOTE_ORIGIN
                    )
                }
            )
            .on(
                'broadcast',
                { event: 'sync-request' },
                ({ payload }: { payload: BroadcastPayload }) => {
                    if (
                        !payload?.stateVector ||
                        payload.clientId === clientId ||
                        cancelled
                    ) {
                        return
                    }

                    const update = Y.encodeStateAsUpdate(
                        ydoc,
                        base64ToBytes(payload.stateVector)
                    )

                    if (update.length === 0) return

                    sendBroadcast('sync-response', {
                        clientId,
                        targetClientId: payload.clientId,
                        update: bytesToBase64(update),
                    })
                }
            )
            .on(
                'broadcast',
                { event: 'sync-response' },
                ({ payload }: { payload: BroadcastPayload }) => {
                    if (
                        !payload?.update ||
                        payload.targetClientId !== clientId ||
                        payload.clientId === clientId ||
                        cancelled
                    ) {
                        return
                    }

                    hasReceivedRemoteUpdateRef.current = true
                    Y.applyUpdate(
                        ydoc,
                        base64ToBytes(payload.update),
                        REMOTE_ORIGIN
                    )
                }
            )
        }

        ydoc.on('update', handleDocumentUpdate)

        const clearTimers = () => {
            if (initialContentTimer) {
                clearTimeout(initialContentTimer)
                initialContentTimer = null
            }

            if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
            }

            if (reconnectTimer) {
                clearTimeout(reconnectTimer)
                reconnectTimer = null
            }
        }

        const authReady = USE_PRIVATE_REALTIME
            ? (async () => {
                  if (!session) {
                      throw new Error('Missing Clerk session')
                  }

                  const { token, claims, source } =
                      await getSupabaseRealtimeToken(session)

                  await supabase.realtime.setAuth(token)

                  return { tokenClaims: claims, tokenSource: source }
              })()
            : Promise.resolve({
                  tokenClaims: null,
                  tokenSource: 'public-anon',
              })

        const removeActiveChannel = () => {
            const activeChannel = channel
            channel = null
            connected = false

            if (activeChannel) {
                void supabase.removeChannel(activeChannel)
            }

            if (channelRef.current === activeChannel) {
                channelRef.current = null
            }
        }

        const refreshRealtimeAuth = async (fallbackAuthInfo: {
            tokenClaims: JwtDebugClaims | null
            tokenSource: string
        }) => {
            if (!USE_PRIVATE_REALTIME || !session) return fallbackAuthInfo

            const { token, claims, source } =
                await getSupabaseRealtimeToken(session)
            await supabase.realtime.setAuth(token)

            return {
                tokenClaims: claims,
                tokenSource: source,
            }
        }

        const scheduleReconnect = (
            reason: string,
            authInfo: {
                tokenClaims: JwtDebugClaims | null
                tokenSource: string
            }
        ) => {
            if (cancelled || reconnectTimer) return

            console.warn(
                `Supabase live editing reconnect scheduled: ${JSON.stringify({
                    documentId,
                    reason,
                    attempt: reconnectAttempts + 1,
                    tokenSource: authInfo.tokenSource,
                })}`
            )
            setStatus('connecting')
            setLastError(`reconnecting (${reason})`)

            reconnectTimer = setTimeout(() => {
                reconnectTimer = null
                void connectChannel(authInfo)
            }, RECONNECT_DELAY_MS)
        }

        const sendBroadcast = (
            event: 'yjs-update' | 'sync-request' | 'sync-response',
            payload: BroadcastPayload
        ) => {
            const activeChannel = channel
            if (!connected || !activeChannel) return

            void withTimeout(
                activeChannel.send({
                    type: 'broadcast',
                    event,
                    payload,
                }),
                CHANNEL_OPERATION_TIMEOUT_MS,
                'timed out'
            )
                .then((result) => {
                    if (cancelled || channel !== activeChannel) return

                    if (result !== 'ok') {
                        if (currentAuthInfo) {
                            scheduleReconnect(
                                `send ${event} ${result}`,
                                currentAuthInfo
                            )
                        }
                    }
                })
                .catch((error) => {
                    if (cancelled || channel !== activeChannel) return

                    if (currentAuthInfo) {
                        scheduleReconnect(
                            `send ${event} ${
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            }`,
                            currentAuthInfo
                        )
                    }
                })
        }

        const startHeartbeat = (
            activeChannel: ReturnType<typeof supabase.channel>,
            authInfo: {
                tokenClaims: JwtDebugClaims | null
                tokenSource: string
            }
        ) => {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
            }

            heartbeatTimer = setInterval(() => {
                if (cancelled || !connected || channel !== activeChannel) return

                void withTimeout(
                    activeChannel.track(getPresencePayload()),
                    CHANNEL_OPERATION_TIMEOUT_MS,
                    'timed out'
                )
                    .then((result) => {
                        if (
                            cancelled ||
                            channel !== activeChannel ||
                            result === 'ok'
                        ) {
                            return
                        }

                        scheduleReconnect(`heartbeat ${result}`, authInfo)
                    })
                    .catch((error) => {
                        if (cancelled || channel !== activeChannel) return

                        scheduleReconnect(
                            `heartbeat ${
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            }`,
                            authInfo
                        )
                    })
            }, HEARTBEAT_INTERVAL_MS)
        }

        const connectChannel = async (authInfo: {
            tokenClaims: JwtDebugClaims | null
            tokenSource: string
        }) => {
            if (cancelled || reconnecting) return

            reconnecting = true
            reconnectAttempts += 1
            removeActiveChannel()
            supabase.realtime.disconnect()

            if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
            }

            let activeAuthInfo: {
                tokenClaims: JwtDebugClaims | null
                tokenSource: string
            }

            try {
                activeAuthInfo = await refreshRealtimeAuth(authInfo)
            } catch (error) {
                reconnecting = false
                setStatus('error')
                setLastError('auth refresh failed')
                console.warn(
                    `Supabase live editing auth refresh failed: ${JSON.stringify(
                        getRealtimeErrorDebug(error)
                    )}`
                )
                scheduleReconnect('auth refresh failed', authInfo)
                return
            }

            currentAuthInfo = activeAuthInfo

            const activeChannel = supabase.channel(`doc:${documentId}`, {
                config: {
                    broadcast: { self: false },
                    presence: { key: clientId },
                    private: USE_PRIVATE_REALTIME,
                },
            })

            channel = activeChannel
            channelRef.current = activeChannel
            bindChannelHandlers(activeChannel)

            activeChannel.subscribe(async (subscriptionStatus, error) => {
                if (cancelled || channel !== activeChannel) return

                if (subscriptionStatus === 'SUBSCRIBED') {
                    reconnecting = false
                    connected = true
                    setLastError(null)
                    setStatus('connected')

                    const trackResult = await withTimeout(
                        activeChannel.track(getPresencePayload()),
                        CHANNEL_OPERATION_TIMEOUT_MS,
                        'timed out'
                    )

                    if (trackResult !== 'ok') {
                        scheduleReconnect(
                            `initial presence ${trackResult}`,
                            activeAuthInfo
                        )
                        return
                    }

                    updatePresence()
                    sendSyncRequest()
                    startHeartbeat(activeChannel, activeAuthInfo)

                    initialContentTimer = setTimeout(() => {
                        if (
                            cancelled ||
                            channel !== activeChannel ||
                            hasReceivedRemoteUpdateRef.current ||
                            hasLoadedInitialContentRef.current ||
                            !isYDocEmpty(ydoc) ||
                            !shouldThisClientSeedDocument()
                        ) {
                            return
                        }

                        setShouldLoadInitialContent(true)
                    }, 800)
                }

                if (
                    subscriptionStatus === 'CLOSED' ||
                    subscriptionStatus === 'CHANNEL_ERROR' ||
                    subscriptionStatus === 'TIMED_OUT' ||
                    error
                ) {
                    reconnecting = false
                    connected = false

                    if (heartbeatTimer) {
                        clearInterval(heartbeatTimer)
                        heartbeatTimer = null
                    }

                    const restAuthStatus = USE_PRIVATE_REALTIME
                        ? await testSupabaseRestAuth(
                              (await session?.getToken()) ?? null,
                              user.id
                          )
                        : 'rest skipped'
                    const debugDetails = {
                        documentId,
                        status: subscriptionStatus,
                        error: getRealtimeErrorDebug(error),
                        tokenClaims: activeAuthInfo.tokenClaims,
                        tokenSource: activeAuthInfo.tokenSource,
                        restAuthStatus,
                    }

                    console.warn(
                        `Supabase live editing channel failed: ${JSON.stringify(debugDetails)}`
                    )
                    setLastError(
                        `${subscriptionStatus.toLowerCase()} (${activeAuthInfo.tokenSource}; ${restAuthStatus})`
                    )
                    setStatus('error')
                    scheduleReconnect(
                        subscriptionStatus.toLowerCase(),
                        activeAuthInfo
                    )
                }
            }, SUBSCRIBE_TIMEOUT_MS)
        }

        void authReady
            .then((authInfo) => {
                if (cancelled) return
                currentAuthInfo = authInfo

                const recoverConnection = () => {
                    if (cancelled) return

                    if (!connected || !channel) {
                        scheduleReconnect('browser resumed', authInfo)
                        return
                    }

                    void withTimeout(
                        channel.track(getPresencePayload()),
                        CHANNEL_OPERATION_TIMEOUT_MS,
                        'timed out'
                    )
                        .then((result) => {
                            if (cancelled) return

                            if (result !== 'ok') {
                                scheduleReconnect(
                                    `browser resumed ${result}`,
                                    authInfo
                                )
                                return
                            }

                            sendSyncRequest()
                        })
                        .catch((error) => {
                            if (cancelled) return

                            scheduleReconnect(
                                `browser resumed ${
                                    error instanceof Error
                                        ? error.message
                                        : String(error)
                                }`,
                                authInfo
                            )
                        })
                }

                const handleVisibilityChange = () => {
                    if (document.visibilityState === 'visible') {
                        recoverConnection()
                    }
                }

                window.addEventListener('focus', recoverConnection)
                window.addEventListener('online', recoverConnection)
                document.addEventListener(
                    'visibilitychange',
                    handleVisibilityChange
                )

                void connectChannel(authInfo)

                const removeRecoveryListeners = () => {
                    window.removeEventListener('focus', recoverConnection)
                    window.removeEventListener('online', recoverConnection)
                    document.removeEventListener(
                        'visibilitychange',
                        handleVisibilityChange
                    )
                }

                recoveryCleanup = removeRecoveryListeners
            })
            .catch((error) => {
                if (cancelled) return

                console.error('Supabase live editing auth failed', {
                    documentId,
                    error,
                })
                setLastError('auth failed')
                setStatus('error')
            })

        return () => {
            cancelled = true
            recoveryCleanup?.()
            recoveryCleanup = null
            clearTimers()

            ydoc.off('update', handleDocumentUpdate)
            setPresenceUsers([])
            setShouldLoadInitialContent(false)
            setLastError(null)
            setStatus('idle')
            removeActiveChannel()
        }
    }, [
        documentId,
        enabled,
        isSessionLoaded,
        permission,
        realtimeSession,
        supabase,
        user,
        ydoc,
    ])

    const markInitialContentLoaded = React.useCallback(() => {
        hasLoadedInitialContentRef.current = true
        setShouldLoadInitialContent(false)
    }, [])

    const updatePresenceMetadata = React.useCallback(
        (metadata: Partial<Pick<PresenceUser, 'cursor'>>) => {
            presenceMetadataRef.current = {
                ...presenceMetadataRef.current,
                ...metadata,
            }

            const channel = channelRef.current
            if (!channel) return

            void channel.track({
                clientId: clientIdRef.current,
                userId: user?.id ?? '',
                name:
                    user?.fullName ||
                    user?.primaryEmailAddress?.emailAddress ||
                    'User',
                color: getStableColor(user?.id ?? clientIdRef.current),
                permission,
                joinedAt: Date.now(),
                ...presenceMetadataRef.current,
            } satisfies PresenceUser)
        },
        [permission, user]
    )

    return {
        ydoc,
        status,
        lastError,
        presenceUsers,
        shouldLoadInitialContent,
        markInitialContentLoaded,
        updatePresenceMetadata,
    }
}

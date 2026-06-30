'use client'

import { useSession, useUser } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
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
    selection?: {
        anchor: number
        head: number
    }
    cursor?: {
        rowId: string
        columnId: string | number
        label: string
    }
}

type PresencePayload = Omit<PresenceUser, 'clientId'>

const DEFAULT_HOCUSPOCUS_URL =
    process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? 'ws://127.0.0.1:1234'

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

function toPresenceUsers(states: Map<number, unknown>): PresenceUser[] {
    const nextUsers: PresenceUser[] = []

    for (const [clientId, value] of states.entries()) {
        if (!value || typeof value !== 'object') continue

        const state = value as Partial<PresencePayload>
        if (!state.userId || !state.name) continue

        nextUsers.push({
            clientId: String(clientId),
            userId: state.userId,
            name: state.name,
            color: state.color ?? getStableColor(state.userId),
            permission: state.permission ?? 'view',
            joinedAt: state.joinedAt ?? Date.now(),
            selection: state.selection,
            cursor: state.cursor,
        })
    }

    return nextUsers
}

function isYDocEmpty(ydoc: Y.Doc) {
    return ydoc.getXmlFragment('default').length === 0
}

function getClientId(provider: HocuspocusProvider | null) {
    return provider?.awareness ? String(provider.awareness.clientID) : 'local'
}

export function useYjsCollaboration({
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

    const providerRef = React.useRef<HocuspocusProvider | null>(null)
    const sessionRef = React.useRef(session)
    const clientIdRef = React.useRef<string>('local')
    const hasLoadedInitialContentRef = React.useRef(false)
    const presenceMetadataRef = React.useRef<
        Partial<Pick<PresenceUser, 'cursor' | 'selection'>>
    >({})
    const initialContentTimerRef = React.useRef<ReturnType<
        typeof setTimeout
    > | null>(null)

    const userId = user?.id ?? null
    const userName =
        user?.fullName || user?.primaryEmailAddress?.emailAddress || 'User'

    React.useEffect(() => {
        sessionRef.current = session
    }, [session])

    const syncPresenceUsers = React.useCallback((provider: HocuspocusProvider) => {
        const nextUsers = toPresenceUsers(provider.awareness?.getStates() ?? new Map())
        setPresenceUsers(nextUsers)
    }, [])

    const publishPresence = React.useCallback(
        (provider: HocuspocusProvider) => {
            const activeUserId = userId ?? clientIdRef.current
            const nextState: PresencePayload = {
                userId: activeUserId,
                name: userName,
                color: getStableColor(activeUserId),
                permission,
                joinedAt: Date.now(),
                ...presenceMetadataRef.current,
            }

            provider.awareness?.setLocalState(nextState)
            clientIdRef.current = getClientId(provider)
            syncPresenceUsers(provider)
        },
        [permission, syncPresenceUsers, userId, userName]
    )

    const shouldThisClientSeedDocument = React.useCallback(
        (provider: HocuspocusProvider) => {
            const states = toPresenceUsers(provider.awareness?.getStates() ?? new Map())
            const leader = states
                .map((presence) => presence.clientId)
                .filter(Boolean)
                .sort()[0]
            return leader === getClientId(provider)
        },
        []
    )

    React.useEffect(() => {
        const isAuthReady = isSessionLoaded

        if (!enabled || !documentId || !isAuthReady) {
            setStatus('idle')
            return
        }

        if (!userId) {
            setStatus('error')
            setLastError('missing user')
            return
        }

        setStatus('connecting')
        setLastError(null)
        hasLoadedInitialContentRef.current = false
        setShouldLoadInitialContent(false)

        const provider = new HocuspocusProvider({
            url: DEFAULT_HOCUSPOCUS_URL,
            name: String(documentId),
            document: ydoc,
            token: async () => (await sessionRef.current?.getToken()) ?? '',
            onConnect: () => {
                setStatus('connecting')
            },
            onAuthenticated: () => {
                setStatus('connecting')
            },
            onSynced: ({ state }) => {
                if (!state) return

                setStatus('connected')
                setLastError(null)
                publishPresence(provider)

                if (initialContentTimerRef.current) {
                    clearTimeout(initialContentTimerRef.current)
                }

                initialContentTimerRef.current = setTimeout(() => {
                    if (
                        hasLoadedInitialContentRef.current ||
                        !isYDocEmpty(ydoc) ||
                        !shouldThisClientSeedDocument(provider)
                    ) {
                        return
                    }

                    setShouldLoadInitialContent(true)
                }, 300)
            },
            onDisconnect: ({ event }) => {
                setStatus('connecting')
                setLastError(event.reason || 'disconnected')
            },
            onClose: ({ event }) => {
                setStatus('error')
                setLastError(event.reason || 'closed')
            },
            onAuthenticationFailed: ({ reason }) => {
                setStatus('error')
                setLastError(reason)
            },
            onAwarenessChange: ({ states }) => {
                const nextUsers: PresenceUser[] = []

                for (const state of states) {
                    if (!state || typeof state !== 'object') continue
                    if (!('clientId' in state)) continue

                    const awarenessState = state as {
                        clientId: number
                        userId?: string
                        name?: string
                        color?: string
                        permission?: Permission
                        joinedAt?: number
                        selection?: PresenceUser['selection']
                        cursor?: PresenceUser['cursor']
                    }

                    if (!awarenessState.userId || !awarenessState.name) {
                        continue
                    }

                    nextUsers.push({
                        clientId: String(awarenessState.clientId),
                        userId: awarenessState.userId,
                        name: awarenessState.name,
                        color:
                            awarenessState.color ??
                            getStableColor(awarenessState.userId),
                        permission: awarenessState.permission ?? 'view',
                        joinedAt: awarenessState.joinedAt ?? Date.now(),
                        selection: awarenessState.selection,
                        cursor: awarenessState.cursor,
                    })
                }

                setPresenceUsers(nextUsers)
            },
        })

        providerRef.current = provider
        clientIdRef.current = getClientId(provider)
        publishPresence(provider)

        return () => {
            if (initialContentTimerRef.current) {
                clearTimeout(initialContentTimerRef.current)
                initialContentTimerRef.current = null
            }

            provider.destroy()
            providerRef.current = null
            setPresenceUsers([])
            setShouldLoadInitialContent(false)
            setLastError(null)
            setStatus('idle')
        }
    }, [
        documentId,
        enabled,
        isSessionLoaded,
        permission,
        publishPresence,
        shouldThisClientSeedDocument,
        userId,
        ydoc,
    ])

    const markInitialContentLoaded = React.useCallback(() => {
        hasLoadedInitialContentRef.current = true
        setShouldLoadInitialContent(false)
    }, [])

    const updatePresenceMetadata = React.useCallback(
        (metadata: Partial<Pick<PresenceUser, 'cursor' | 'selection'>>) => {
            presenceMetadataRef.current = {
                ...presenceMetadataRef.current,
                ...metadata,
            }

            const provider = providerRef.current
            if (!provider) return

            publishPresence(provider)
        },
        [publishPresence]
    )

    return {
        clientId: clientIdRef.current,
        ydoc,
        status,
        lastError,
        presenceUsers,
        shouldLoadInitialContent,
        markInitialContentLoaded,
        updatePresenceMetadata,
    }
}

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from '~/hooks/use-toast'
import { SimpleEditor } from '~/components/tiptap-templates/simple/simple-editor'
import { FileHeader } from '~/components/file-header'
import { VersionHistory } from '~/components/version-history'
import { api } from '~/trpc/react'

type Permission = 'view' | 'comment' | 'edit'

export default function PageView() {
    const params = useParams()
    const router = useRouter()
    const pageId = Number((params?.pageId ?? '') as string)

    // Fetch page data using tRPC with type validation
    const {
        data: page,
        isLoading,
        error,
    } = api.files.getById.useQuery(
        {
            id: pageId,
            expectedType: 'page',
        },
        {
            enabled: !!pageId,
            retry: (failureCount, error) => {
                // Don't retry on permission or type validation errors
                if (
                    error?.data?.code === 'FORBIDDEN' ||
                    error?.data?.code === 'BAD_REQUEST'
                ) {
                    return false
                }
                return failureCount < 3
            },
        }
    )

    // Get user's permission for this file using the hierarchical permission system
    const { data: userPermission, isLoading: isPermissionLoading } =
        api.permissions.getUserPermission.useQuery(
            { fileId: pageId },
            {
                enabled: !!pageId,
                staleTime: 30 * 1000, // 30 seconds
                gcTime: 5 * 60 * 1000, // 5 minutes
                retry: 3,
                retryDelay: (attemptIndex) =>
                    Math.min(1000 * 2 ** attemptIndex, 30000),
                refetchOnWindowFocus: false,
            }
        )

    const [content, setContent] = useState<string>('')
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
    const [localPermission, setLocalPermission] = useState<Permission>('view')
    const [hasInitialContentLoaded, setHasInitialContentLoaded] =
        useState(false)
    const [lastSyncedContent, setLastSyncedContent] = useState<string>('')

    // Version history state
    const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)

    // Add state to track saving status
    const [savingStatus, setSavingStatus] = useState<
        'idle' | 'saving' | 'saved'
    >('idle')

    // Add mutation hook for updating the page
    const updatePageMutation = api.files.updatePageContent.useMutation({
        onSuccess: () => {
            setSavingStatus('saved')
            // Reset status after a delay
            setTimeout(() => setSavingStatus('idle'), 3 * 1000)
            setLastSyncedContent(content)
        },
        onError: (error) => {
            setSavingStatus('idle')
            toast({
                title: 'Failed to update page',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    // Debounced content update using useRef to store timer
    const contentUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Update content when page data loads, but only once
    useEffect(() => {
        if (page?.content?.content && !hasInitialContentLoaded) {
            setContent(page.content.content)
            setLastSyncedContent(page.content.content)
            setHasInitialContentLoaded(true)
        }
        if (page?.content?.updatedAt && !lastSyncedAt) {
            setLastSyncedAt(
                page.content.updatedAt
                    ? page.content.updatedAt.toISOString()
                    : null
            )
        }
    }, [
        page?.content?.content,
        page?.content?.updatedAt,
        hasInitialContentLoaded,
        lastSyncedAt,
    ])

    // Update local permission when user permission loads
    useEffect(() => {
        if (userPermission) {
            setLocalPermission(userPermission)
        }
    }, [userPermission])

    // Handle content change with debounced saving
    const handleContentChange = useCallback(
        (newContent: string) => {
            setContent(newContent)

            // Only auto-save if user has edit permissions
            if (!userPermission || userPermission === 'view') return

            // Clear previous timer if exists
            if (contentUpdateTimerRef.current) {
                clearTimeout(contentUpdateTimerRef.current)
            }

            // Set new timer for debounced save
            contentUpdateTimerRef.current = setTimeout(() => {
                setSavingStatus('saving')
                updatePageMutation.mutate({
                    fileId: pageId,
                    content: newContent,
                })
            }, 1500) // 1.5 seconds debounce interval (server waits 1.5 seconds after no more keystroke to save)
        },
        [pageId, userPermission, updatePageMutation]
    )

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (contentUpdateTimerRef.current) {
                clearTimeout(contentUpdateTimerRef.current)
            }
        }
    }, [])

    // When polling for remote updates:
    useEffect(() => {
        if (!pageId || !lastSyncedAt) return

        const interval = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/pages/last-updated?pageId=${pageId}`
                )
                if (!res.ok) return
                const data = await res.json()
                if (data.lastUpdated && data.lastUpdated !== lastSyncedAt) {
                    // Only update local content if the user hasn't typed since last sync
                    if (content === lastSyncedContent) {
                        setContent(data.content)
                        setLastSyncedContent(data.content)
                        setLastSyncedAt(data.lastUpdated)
                    } else {
                        // Optionally, show a non-intrusive toast: "Remote changes detected, please save or reload."
                        // Or set a "stale" flag in UI to let user choose when/how to resolve
                    }
                }
            } catch (e) {
                // ignore polling errors
            }
        }, 5 * 1000)

        return () => clearInterval(interval)
    }, [pageId, lastSyncedAt, content, lastSyncedContent])

    // Handle version restoration
    const handleVersionRestore = useCallback((restoredContent: string) => {
        setContent(restoredContent)
        setLastSyncedContent(restoredContent)
        setIsVersionHistoryOpen(false)
        toast({
            title: 'Version restored',
            description:
                'The page content has been restored to the selected version.',
        })
    }, [])

    // Determine if the editor should be read-only based on permissions
    const isReadOnly = isPermissionLoading || userPermission !== 'edit'

    if (isLoading || isPermissionLoading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                    <div className="text-center">
                        <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent mx-auto mb-4"></div>
                        <p className="text-muted-foreground">
                            Loading page content...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                    <div className="text-center max-w-md">
                        <div className="mb-4">
                            {error.data?.code === 'FORBIDDEN' ? (
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900">
                                    <svg
                                        className="w-8 h-8 text-red-600 dark:text-red-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-7V9m0 0V7m0 2h2M12 9H9m3-7a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </div>
                            ) : error.data?.code === 'BAD_REQUEST' ? (
                                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-yellow-900">
                                    <svg
                                        className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                                        />
                                    </svg>
                                </div>
                            ) : (
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-800">
                                    <svg
                                        className="w-8 h-8 text-gray-600 dark:text-gray-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <h2 className="text-xl font-bold mb-2">
                            {error.data?.code === 'FORBIDDEN'
                                ? 'Access Denied'
                                : error.data?.code === 'BAD_REQUEST'
                                  ? 'Invalid File Type'
                                  : error.data?.code === 'NOT_FOUND'
                                    ? 'Page Not Found'
                                    : 'Error Loading Page'}
                        </h2>
                        <p className="text-muted-foreground mb-4">
                            {error.data?.code === 'FORBIDDEN'
                                ? 'You do not have permission to access this page.'
                                : error.data?.code === 'BAD_REQUEST'
                                  ? 'This file is not a page or has an invalid format.'
                                  : error.data?.code === 'NOT_FOUND'
                                    ? 'The page you are looking for does not exist.'
                                    : error.message}
                        </p>
                        <button
                            onClick={() => window.history.back()}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!page) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                    <div className="text-center">
                        <p className="text-muted-foreground">Page not found</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col">
            <FileHeader
                filename={page.name || 'Untitled Page'}
                fileId={pageId}
                permission={localPermission}
                savingStatus={savingStatus}
                content={content}
                onVersionHistoryClick={() => setIsVersionHistoryOpen(true)}
            />

            <div className="flex-1 min-h-0 flex flex-col justify-start items-center bg-background">
                <SimpleEditor
                    initialContent={content}
                    readOnly={isReadOnly}
                    realtimeDocumentId={pageId}
                    permission={userPermission ?? 'view'}
                    onUpdate={handleContentChange}
                />
            </div>

            <VersionHistory
                fileId={pageId}
                fileType="page"
                isOpen={isVersionHistoryOpen}
                onClose={() => setIsVersionHistoryOpen(false)}
                onRestore={handleVersionRestore}
            />
        </div>
    )
}

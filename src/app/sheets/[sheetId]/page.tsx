'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { api } from '~/trpc/react'
import { SheetEditor } from '~/components/sheet-editor'
import { FileHeader } from '~/components/file-header'
import { VersionHistory } from '~/components/version-history'
import { FileUnlockDialog } from '~/components/file-unlock-dialog'
import { createEmptySheet, type SheetData } from '~/lib/sheet-utils'
import { toast } from '~/hooks/use-toast'

type PermissionType = 'view' | 'comment' | 'edit'

export default function SheetPage() {
    const params = useParams()
    const sheetId = Number(params.sheetId as string)
    const [localPermission, setLocalPermission] =
        useState<PermissionType>('view')
    const [savingStatus, setSavingStatus] = useState<
        'idle' | 'saving' | 'saved'
    >('idle')
    const [showVersionHistory, setShowVersionHistory] = useState(false)
    const [currentSheetData, setCurrentSheetData] = useState<SheetData | null>(
        null
    )
    // Live editor state, so Download exports what's on screen (saves are
    // debounced, so the fetched content can lag behind edits).
    const [liveSheetData, setLiveSheetData] = useState<SheetData | null>(null)

    // Password supplied via the unlock dialog for protected files (Feature 2)
    const [filePassword, setFilePassword] = useState<string | undefined>(
        undefined
    )

    // Fetch sheet from the server using the unified files router with type validation
    const {
        data: sheet,
        isLoading,
        error,
    } = api.files.getById.useQuery(
        {
            id: sheetId,
            expectedType: 'sheet',
            password: filePassword,
        },
        {
            enabled: !!sheetId,
            retry: (failureCount, error) => {
                // Don't retry on permission, type, or password errors
                if (
                    error?.data?.code === 'FORBIDDEN' ||
                    error?.data?.code === 'BAD_REQUEST' ||
                    error?.data?.code === 'UNAUTHORIZED' ||
                    error?.data?.code === 'TOO_MANY_REQUESTS'
                ) {
                    return false
                }
                return failureCount < 3
            },
        }
    )

    const needsPassword =
        error?.data?.code === 'UNAUTHORIZED' &&
        (error.message === 'PASSWORD_REQUIRED' ||
            error.message === 'PASSWORD_INCORRECT')

    // Get user's permission for this file using the hierarchical permission system
    const { data: userPermission } = api.permissions.getUserPermission.useQuery(
        { fileId: sheetId },
        { enabled: !!sheetId }
    )

    // Get sync metadata for this sheet if it's synced from a form
    const { data: syncMetadata } = api.forms.getSyncMetadataBySheetId.useQuery(
        { sheetId },
        { enabled: !!sheetId }
    )

    // Update local permission when user permission loads
    useEffect(() => {
        if (userPermission) {
            setLocalPermission(userPermission)
        }
    }, [userPermission])

    if (isLoading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                    <div className="text-center">
                        <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent mx-auto mb-4"></div>
                        <p className="text-muted-foreground">
                            Loading sheet content...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (needsPassword) {
        return (
            <FileUnlockDialog
                fileId={sheetId}
                onUnlocked={(pw) => setFilePassword(pw)}
            />
        )
    }

    if (!sheet) {
        return <div className="p-4">Sheet not found</div>
    }

    let initialData: SheetData
    try {
        const parsed = JSON.parse(sheet.content?.content || '{}')
        // Use parsed data if valid (has rows and cells arrays), otherwise create a new empty sheet
        initialData =
            parsed?.rows &&
            Array.isArray(parsed.rows) &&
            parsed?.cells &&
            Array.isArray(parsed.cells)
                ? parsed
                : createEmptySheet()
    } catch (error) {
        console.error('Error parsing sheet content:', error)
        initialData = createEmptySheet()
    }

    const handlePermissionChange = (newPermission: PermissionType) => {
        setLocalPermission(newPermission)
        // Note: Actual permission changes should be handled through the share modal
        // This is just for UI consistency
    }

    // Determine if the editor should be read-only based on permissions
    const isReadOnly = !userPermission || userPermission === 'view'

    // Handle version restore
    const handleVersionRestore = (content: string) => {
        try {
            const restoredData = JSON.parse(content)
            if (
                restoredData?.rows &&
                Array.isArray(restoredData.rows) &&
                restoredData?.cells &&
                Array.isArray(restoredData.cells)
            ) {
                setCurrentSheetData(restoredData)
                setLiveSheetData(restoredData)
                toast({
                    title: '✅ Version restored',
                    description:
                        'Sheet has been restored to the selected version',
                })
            } else {
                throw new Error('Invalid sheet data format')
            }
        } catch (error) {
            console.error('Error restoring sheet version:', error)
            toast({
                title: '❌ Restore failed',
                description: 'Could not restore the selected version',
                variant: 'destructive',
            })
        }
    }

    // Use the restored data if available, otherwise use initial data
    const sheetDataToUse = currentSheetData || initialData

    return (
        <div className="h-full flex flex-col">
            <FileHeader
                filename={sheet.name}
                fileId={sheetId}
                permission={localPermission}
                savingStatus={savingStatus}
                fileType="sheet"
                content={JSON.stringify(liveSheetData ?? sheetDataToUse)}
                onPermissionChange={handlePermissionChange}
                onVersionHistoryClick={
                    !isReadOnly ? () => setShowVersionHistory(true) : undefined
                }
            />
            <div className="flex-1">
                <SheetEditor
                    initialData={sheetDataToUse}
                    sheetId={sheetId}
                    sheetName={sheet.name}
                    readOnly={isReadOnly}
                    realtimeDocumentId={sheetId}
                    permission={userPermission ?? 'view'}
                    syncMetadata={
                        syncMetadata
                            ? {
                                  ...syncMetadata,
                                  isLiveSync: syncMetadata.isLiveSync ?? false,
                              }
                            : undefined
                    }
                    onSavingStatusChange={setSavingStatus}
                    onDataChange={setLiveSheetData}
                />
            </div>

            {/* Version History Modal */}
            <VersionHistory
                fileId={sheetId}
                fileType="sheet"
                isOpen={showVersionHistory}
                onClose={() => setShowVersionHistory(false)}
                onRestore={handleVersionRestore}
            />
        </div>
    )
}

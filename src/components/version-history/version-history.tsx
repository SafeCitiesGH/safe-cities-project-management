import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { toast } from '~/hooks/use-toast'
import { api } from '~/trpc/react'
import { HistoryIcon } from 'lucide-react'
import { useVersionHistory } from './hooks'
import { VersionPreview } from './version-preview'
import { VersionItem } from './version-item'
import type { VersionHistoryProps } from './types'

export function VersionHistory({
    fileId,
    fileType,
    isOpen,
    onClose,
    onRestore,
}: VersionHistoryProps) {
    const [previewContent, setPreviewContent] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [versionToDelete, setVersionToDelete] = useState<number | null>(null)

    const utils = api.useUtils()

    const {
        versions,
        isLoading,
        refetch,
        restoreVersion,
        deleteVersion,
        isRestoring,
        isDeleting,
    } = useVersionHistory(fileId, fileType, isOpen)

    const handleRestore = (versionId: number) => {
        restoreVersion(
            { fileId, versionId },
            {
                onSuccess: (data) => {
                    toast({
                        title: 'Version restored',
                        description: `Successfully restored to version ${data.restoredToVersion}`,
                    })
                    // The server returns the content it actually wrote. Looking
                    // it back up locally by version number was unreliable —
                    // version numbers repeat across history entries.
                    onRestore?.(data.content)
                    onClose()
                    // Invalidate without an input filter: getById is keyed by
                    // { id, expectedType, password }, so invalidating with a
                    // partial input matched nothing and the page kept showing
                    // the pre-restore content.
                    void utils.files.getById.invalidate()
                    void utils.files.getVersionHistory.invalidate({ fileId })
                },
                onError: (error) => {
                    toast({
                        title: 'Failed to restore version',
                        description: error.message,
                        variant: 'destructive',
                    })
                },
            }
        )
    }

    const handleDelete = (versionId: number) => {
        setVersionToDelete(versionId)
        setShowDeleteConfirm(true)
    }

    const confirmDelete = () => {
        if (versionToDelete) {
            deleteVersion(
                { fileId, versionId: versionToDelete },
                {
                    onSuccess: () => {
                        toast({
                            title: 'Version deleted',
                            description:
                                'Version successfully deleted from history',
                        })
                        void refetch()
                        setShowDeleteConfirm(false)
                        setVersionToDelete(null)
                    },
                    onError: (error) => {
                        toast({
                            title: 'Failed to delete version',
                            description: error.message,
                            variant: 'destructive',
                        })
                    },
                }
            )
        }
    }

    const handlePreview = (content: string) => {
        setPreviewContent(content)
        setShowPreview(true)
    }

    if (!isOpen) return null

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl h-[80vh] min-h-[600px] sm:h-[85vh] sm:min-h-[700px] md:h-[90vh] md:min-h-[800px] w-[95vw] sm:w-full flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            <HistoryIcon className="h-5 w-5" />
                            Version History
                        </DialogTitle>
                        <DialogDescription>
                            View and manage previous versions of this {fileType}
                            . You can restore any version or preview its
                            content.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 overflow-hidden">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent" />
                                <span className="ml-2 text-muted-foreground">
                                    Loading version history...
                                </span>
                            </div>
                        ) : !versions || versions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <HistoryIcon className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                                    No version history
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    No previous versions are available for this{' '}
                                    {fileType}.
                                </p>
                            </div>
                        ) : (
                            <div className="h-full overflow-y-auto px-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800 hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500 scroll-smooth">
                                <div className="space-y-3 pr-2 py-2">
                                    {versions.map((version) => (
                                        <VersionItem
                                            key={version.id}
                                            version={version}
                                            fileType={fileType}
                                            onRestore={handleRestore}
                                            onDelete={handleDelete}
                                            onPreview={handlePreview}
                                            isRestoring={isRestoring}
                                            isDeleting={isDeleting}
                                        />
                                    ))}
                                    {/* Add some bottom padding for better scrolling */}
                                    <div className="h-4" />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex-shrink-0">
                        <Button variant="outline" onClick={onClose}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            {previewContent && (
                <VersionPreview
                    content={previewContent}
                    fileType={fileType}
                    isOpen={showPreview}
                    onClose={() => {
                        setShowPreview(false)
                        // Drop the content too, otherwise the preview (and the
                        // editor instance inside it) stays mounted invisibly
                        // and the next preview can flash the previous version.
                        setPreviewContent(null)
                    }}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Version</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this version from
                            the history? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete Version
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

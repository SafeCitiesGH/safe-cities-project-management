'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
    Eye,
    MessageSquare,
    MoreHorizontal,
    PenSquare,
    Users,
    Download,
    History,
    Save,
    ChevronDown,
    FileText,
    FileType,
    FileSpreadsheet,
    Sheet as SheetIcon,
} from 'lucide-react'
import { useChatToggle } from '~/hooks/use-chat-toggle'
import { useSidebar } from './ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import { downloadFile } from '~/utils/pdfExport.client'
import { exportHtmlToDocx } from '~/utils/export/exportDocx.client'
import { exportSheet } from '~/utils/export/exportSheet.client'
import {
    EXPORT_FORMAT_META,
    FILE_TYPE_EXPORT_FORMATS,
    type ExportableFileType,
    type ExportFormat,
} from '~/utils/export/formats'
import { api } from '~/trpc/react'
import { toast } from '~/hooks/use-toast'
import { SidebarTrigger } from './ui/sidebar'

type Permission = 'view' | 'comment' | 'edit'

interface FileHeaderProps {
    filename: string
    fileId: number
    permission: Permission
    savingStatus?: 'saving' | 'saved' | 'idle'
    content?: string
    /**
     * The kind of file being shown. Drives which export formats appear in the
     * Download menu. Defaults to 'page' (document) for backwards compatibility.
     * For 'sheet', `content` must be the serialized sheet JSON.
     */
    fileType?: ExportableFileType
    onPermissionChange?: (permission: Permission) => void
    onVersionHistoryClick?: () => void
}

// Icon shown next to each format in the Download menu.
const FORMAT_ICONS: Record<ExportFormat, ReactNode> = {
    pdf: <FileText size={16} />,
    docx: <FileType size={16} />,
    xlsx: <FileSpreadsheet size={16} />,
    csv: <SheetIcon size={16} />,
}

const permissionIcons = {
    view: <Eye size={16} />,
    comment: <MessageSquare size={16} />,
    edit: <PenSquare size={16} />,
}

const permissionLabels = {
    view: 'Can View',
    comment: 'Can Comment',
    edit: 'Can Edit',
}

export function FileHeader({
    filename,
    fileId,
    permission,
    savingStatus = 'idle',
    content,
    fileType = 'page',
    onPermissionChange,
    onVersionHistoryClick,
}: FileHeaderProps) {
    const { toggleChat } = useChatToggle({ pageTitle: filename, fileId })
    const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
        null
    )
    const [isRenaming, setIsRenaming] = useState(false)
    const [renamingValue, setRenamingValue] = useState(filename)
    const [displayTitle, setDisplayTitle] = useState(filename)
    const editableRef = useRef<HTMLDivElement>(null)
    const { state } = useSidebar();
    const isMobile = useMobile();

    // Update display title when filename prop changes
    useEffect(() => {
        setDisplayTitle(filename)
        setRenamingValue(filename)
    }, [filename])

    const utils = api.useUtils()
    const updateFileMutation = api.files.update.useMutation({
        onSuccess: () => {
            setDisplayTitle(renamingValue)
            // Update just the name in the cached query data
            utils.files.getById.setData(
                { id: fileId, expectedType: 'sheet' },
                (oldData) => {
                    if (oldData) {
                        return { ...oldData, name: renamingValue }
                    }
                    return oldData
                }
            )
            toast({
                title: 'File renamed',
                description: `File successfully renamed to "${renamingValue}"`,
            })
        },
        onError: (error) => {
            toast({
                title: 'Error renaming file',
                description:
                    error.message || 'Failed to rename file. Please try again.',
                variant: 'destructive',
            })
            // Reset the value on error
            setRenamingValue(filename)
            setDisplayTitle(filename)
        },
    })

    const handleSaveRename = async () => {
        if (renamingValue.trim() === filename || renamingValue.trim() === '') {
            setIsRenaming(false)
            setRenamingValue(filename)
            return
        }

        // Update display immediately for smooth UX
        setDisplayTitle(renamingValue.trim())

        try {
            await updateFileMutation.mutateAsync({
                id: fileId,
                name: renamingValue.trim(),
            })
        } catch (error) {
            // Error is handled in onError callback
        } finally {
            setIsRenaming(false)
        }
    }

    const exportFormats = FILE_TYPE_EXPORT_FORMATS[fileType] ?? []

    const handleExport = async (format: ExportFormat) => {
        if (!content || exportingFormat) return

        setExportingFormat(format)
        try {
            if (format === 'pdf') {
                await downloadFile(content, `${filename}.pdf`)
            } else if (format === 'docx') {
                await exportHtmlToDocx(content, `${filename}.docx`)
            } else if (format === 'xlsx' || format === 'csv') {
                await exportSheet(content, `${filename}.${format}`, format)
            }

            toast({
                title: 'Download started',
                description: `"${filename}" exported as ${format.toUpperCase()}.`,
            })
        } catch (error) {
            console.error('Error exporting file:', error)
            toast({
                title: 'Export failed',
                description: `Could not export as ${format.toUpperCase()}. Please try again.`,
                variant: 'destructive',
            })
        } finally {
            setExportingFormat(null)
        }
    }

    return (
        <>
            <div className="flex items-center justify-between p-4 border-b bg-background">
                <div className="flex items-center gap-4">
                    {(state === 'collapsed' || isMobile) && (
                        <div>
                            <SidebarTrigger />
                        </div>
                    )}
                    {isRenaming ? (
                        <div
                            ref={editableRef}
                            contentEditable={!updateFileMutation.isPending}
                            suppressContentEditableWarning={true}
                            onInput={(e) => {
                                const target = e.target as HTMLDivElement
                                setRenamingValue(target.textContent || '')
                            }}
                            onBlur={() => {
                                handleSaveRename()
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleSaveRename()
                                } else if (e.key === 'Escape') {
                                    e.preventDefault()
                                    setIsRenaming(false)
                                    setRenamingValue(filename)
                                    if (editableRef.current) {
                                        editableRef.current.textContent =
                                            filename
                                    }
                                }
                            }}
                            className="text-xl font-semibold bg-transparent outline-none focus:ring-2 focus:ring-primary rounded px-1 inline-block whitespace-nowrap overflow-hidden"
                            style={{
                                opacity: updateFileMutation.isPending ? 0.5 : 1,
                            }}
                        />
                    ) : (
                        <h1
                            className="text-xl font-semibold cursor-pointer hover:bg-muted rounded px-1 py-1"
                            onClick={() => {
                                if (permission === 'edit') {
                                    setIsRenaming(true)
                                    setRenamingValue(displayTitle)
                                    // Focus and set content after state update
                                    setTimeout(() => {
                                        if (editableRef.current) {
                                            editableRef.current.textContent =
                                                displayTitle
                                            editableRef.current.focus()
                                            // Select all text
                                            const range = document.createRange()
                                            range.selectNodeContents(
                                                editableRef.current
                                            )
                                            const selection =
                                                window.getSelection()
                                            selection?.removeAllRanges()
                                            selection?.addRange(range)
                                        }
                                    }, 0)
                                }
                            }}
                        >
                            {displayTitle}
                        </h1>
                    )}
                    {savingStatus === 'saving' && (
                        <span className="text-xs text-muted-foreground flex items-center">
                            <div className="animate-spin h-3 w-3 border-2 border-primary rounded-full border-t-transparent mr-1"></div>
                            Saving...
                        </span>
                    )}
                    {savingStatus === 'saved' && (
                        <span className="text-xs text-green-500 flex items-center">
                            <svg
                                className="h-3 w-3 mr-1"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                ></path>
                            </svg>
                            Saved
                        </span>
                    )}
                    {updateFileMutation.isPending && (
                        <span className="text-xs text-muted-foreground flex items-center">
                            <div className="animate-spin h-3 w-3 border-2 border-primary rounded-full border-t-transparent mr-1"></div>
                            Renaming...
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={toggleChat}
                    >
                        <MessageSquare size={16} />
                        Chat
                    </Button>
                    {onVersionHistoryClick && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={onVersionHistoryClick}
                        >
                            <History size={16} />
                            History
                        </Button>
                    )}
                    {content && exportFormats.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    disabled={exportingFormat !== null}
                                >
                                    <Download size={16} />
                                    Download
                                    <ChevronDown size={14} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuLabel>
                                    Download as
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {exportFormats.map((format) => {
                                    const meta = EXPORT_FORMAT_META[format]
                                    return (
                                        <DropdownMenuItem
                                            key={format}
                                            disabled={exportingFormat !== null}
                                            onSelect={(event) => {
                                                // Keep the menu logic in our handler
                                                // rather than letting Radix close it
                                                // before the async work starts.
                                                event.preventDefault()
                                                void handleExport(format)
                                            }}
                                            className="flex flex-col items-start gap-0.5"
                                        >
                                            <span className="flex items-center gap-2">
                                                {FORMAT_ICONS[format]}
                                                {meta.label}
                                                {exportingFormat === format && (
                                                    <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                                )}
                                            </span>
                                            {meta.hint && (
                                                <span className="pl-6 text-xs text-muted-foreground">
                                                    {meta.hint}
                                                </span>
                                            )}
                                        </DropdownMenuItem>
                                    )
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </>
    )
}

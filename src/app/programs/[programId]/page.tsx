'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '~/trpc/react'
import { navigateToFile } from '~/lib/navigation-utils'
import { FILE_TYPES } from '~/server/db/schema'
import {
    FileText,
    Sheet,
    ClipboardList,
    Folder,
    UploadCloud,
    ChevronRight,
    ArrowLeft,
    FolderOpen,
    Lock,
} from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import type { FileNode } from '~/components/file-tree'

function findNodeById(tree: FileNode[], id: number): FileNode | null {
    for (const node of tree) {
        if (node.id === id) return node
        if (node.children) {
            const found = findNodeById(node.children, id)
            if (found) return found
        }
    }
    return null
}

function getFileIcon(type: string | undefined, className = '') {
    const props = { size: 18, className: `text-primary ${className}` }
    switch (type) {
        case FILE_TYPES.PAGE:
            return <FileText {...props} />
        case FILE_TYPES.SHEET:
            return <Sheet {...props} />
        case FILE_TYPES.FORM:
            return <ClipboardList {...props} />
        case FILE_TYPES.FOLDER:
            return <Folder {...props} />
        case FILE_TYPES.UPLOAD:
            return <UploadCloud {...props} />
        default:
            return <FileText {...props} />
    }
}

function getFileTypeLabel(type: string | undefined) {
    switch (type) {
        case FILE_TYPES.PAGE:
            return 'Page'
        case FILE_TYPES.SHEET:
            return 'Sheet'
        case FILE_TYPES.FORM:
            return 'Form'
        case FILE_TYPES.FOLDER:
            return 'Folder'
        case FILE_TYPES.UPLOAD:
            return 'Upload'
        default:
            return 'File'
    }
}

export default function ProgramFilesPage() {
    const params = useParams()
    const router = useRouter()
    const isMobile = useMobile()
    const { state } = useSidebar()
    const programId = Number(params?.programId as string)

    // Stack of folder node IDs representing the current navigation path
    // starts empty — root is the programme itself
    const [folderStack, setFolderStack] = useState<number[]>([])

    const { data: fileTree, isLoading } =
        api.files.getFilteredFileTree.useQuery()

    const programNode = fileTree ? findNodeById(fileTree, programId) : null

    // Resolve the currently-viewed folder inside the programme
    const currentNode = (() => {
        if (!programNode) return null
        let node: FileNode = programNode
        for (const folderId of folderStack) {
            const child = node.children?.find((c) => c.id === folderId)
            if (!child) return node
            node = child
        }
        return node
    })()

    const children = currentNode?.children ?? []

    // Build breadcrumb list: Programme > Folder1 > Folder2 ...
    const breadcrumbs: { id: number; name: string }[] = [
        {
            id: programId,
            name: programNode?.name ?? programNode?.filename ?? 'Programme',
        },
    ]
    if (programNode) {
        let node: FileNode = programNode
        for (const folderId of folderStack) {
            const child = node.children?.find((c) => c.id === folderId)
            if (!child) break
            breadcrumbs.push({ id: child.id, name: child.name ?? child.filename ?? 'Folder' })
            node = child
        }
    }

    const navigateToFolder = (folderId: number) => {
        const folderIdxInStack = folderStack.indexOf(folderId)
        if (folderIdxInStack !== -1) {
            // Clicked a breadcrumb — pop back to that level
            setFolderStack(folderStack.slice(0, folderIdxInStack))
        } else {
            setFolderStack([...folderStack, folderId])
        }
    }

    const handleItemClick = (child: FileNode) => {
        if (child.type === FILE_TYPES.FOLDER) {
            navigateToFolder(child.id)
        } else if (child.type) {
            navigateToFile(router, child.id, child.type as any)
        }
    }

    if (isLoading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </div>
        )
    }

    if (!programNode) {
        return (
            <div className="container mx-auto p-6">
                <Button
                    variant="ghost"
                    size="sm"
                    className="mb-6 gap-2"
                    onClick={() => router.push('/dashboard')}
                >
                    <ArrowLeft size={16} />
                    Back to Dashboard
                </Button>
                <p className="text-muted-foreground">Program not found.</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-6">
            {/* Header */}
            <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    {(state === 'collapsed' || isMobile) && <SidebarTrigger />}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/dashboard')}
                    >
                        <ArrowLeft size={18} />
                    </Button>
                    <div>
                        <div className="mb-1 inline-flex rounded-full border border-border/60 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            Programme
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {programNode.name ?? programNode.filename}
                        </h1>
                    </div>
                </div>
            </div>

            {/* Breadcrumbs */}
            {breadcrumbs.length > 1 && (
                <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={crumb.id} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight size={14} />}
                            {i < breadcrumbs.length - 1 ? (
                                <button
                                    className="hover:text-foreground transition-colors"
                                    onClick={() => {
                                        if (i === 0) {
                                            setFolderStack([])
                                        } else {
                                            setFolderStack(
                                                folderStack.slice(0, i)
                                            )
                                        }
                                    }}
                                >
                                    {crumb.name}
                                </button>
                            ) : (
                                <span className="text-foreground font-medium">
                                    {crumb.name}
                                </span>
                            )}
                        </span>
                    ))}
                </nav>
            )}

            {/* File list */}
            {children.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                        <FolderOpen size={24} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium">No files yet</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                        This programme doesn&apos;t have any files yet.
                    </p>
                </div>
            ) : (
                <div className="grid gap-2">
                    {children.map((child) => {
                        const isFolder = child.type === FILE_TYPES.FOLDER
                        const childName = child.name ?? child.filename ?? 'Untitled'
                        return (
                            <Card
                                key={child.id}
                                className="cursor-pointer border-border/70 bg-card/85 transition-colors hover:bg-muted/40"
                                onClick={() => handleItemClick(child)}
                            >
                                <CardContent className="flex items-center gap-3 p-4">
                                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/15 to-accent/50">
                                        {getFileIcon(child.type)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">
                                            {childName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {getFileTypeLabel(child.type)}
                                            {isFolder &&
                                                child.children &&
                                                child.children.length > 0 &&
                                                ` · ${child.children.length} item${child.children.length !== 1 ? 's' : ''}`}
                                        </p>
                                    </div>
                                    {child.isPasswordProtected && (
                                        <Lock
                                            size={14}
                                            className="text-muted-foreground"
                                        />
                                    )}
                                    <ChevronRight
                                        size={16}
                                        className="flex-shrink-0 text-muted-foreground"
                                    />
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

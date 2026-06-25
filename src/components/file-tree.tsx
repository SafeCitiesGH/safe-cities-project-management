'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronRight, Folder, FileText, ChevronDown, MoreHorizontal, Edit2, Trash2, Plus,
    AlertCircle, ClipboardList, Sheet, Share2, UploadCloud, Lock, Users } from 'lucide-react'
import { cn } from '~/lib/utils'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useToast } from '~/hooks/use-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { api } from '~/trpc/react'
import { ShareModal } from '~/components/share-modal'
import { ProgrammeMembersPanel } from '~/components/programme-members-panel'
import { useBatchPermissions } from '~/hooks/use-batch-permissions'
import { useRouter } from 'next/navigation'

export type FileNode = {
    id: number
    filename: string
    name?: string // Some files might use 'name' instead of 'filename'
    type?: 'folder' | 'page' | 'sheet' | 'form' | 'upload' | 'programme'
    isFolder?: boolean
    parentId?: number | null
    isPasswordProtected?: boolean
    children?: FileNode[]
}

interface FileTreeProps {
    items: FileNode[]
    onSelectFile?: (fileId: number) => void
    activeFileId?: number
    selectedFileIds?: number[]
    onMultiSelectFile?: (fileIds: number[]) => void
    onMove?: (dragId: number, dropId: number) => void
    onCreateFile?: (parentId: number | null) => void
    onCreateSheet?: (parentId: number | null) => void
    onCreateForm?: (parentId: number | null) => void
    onCreateFolder?: (parentId: number | null) => void
    onCreateUpload?: (parentId: number | null) => void
    onRename?: (id: number, filename: string) => void
    onDelete?: (id: number) => void
}

interface FileTreeNodeProps extends Omit<FileTreeProps, 'items'> {
    node: FileNode
    level: number
    getPermissions: (fileId: number) => {
        userPermission: any
        canEdit: boolean
        canShare: boolean
    }
}

export function FileTree(props: FileTreeProps) {
    // Create a ref to store component data for range selection
    const rootRef = useRef<HTMLDivElement>(null)
    // Use batch permissions for all files in the tree
    const { getPermissions } = useBatchPermissions(props.items)

    // Store the props in the DOM element for access from child components
    useEffect(() => {
        if (rootRef.current) {
            ;(rootRef.current as any).__fileTreeProps = props
        }
    }, [props])

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle keyboard shortcuts if the tree has focus
            const treeElement = rootRef.current
            if (
                !treeElement ||
                !document.activeElement ||
                !treeElement.contains(document.activeElement)
            ) {
                return
            }

            // Delete key - delete selected items
            if (
                (e.key === 'Delete' || e.key === 'Backspace') &&
                props.selectedFileIds?.length && props.onDelete
            ) {
                e.preventDefault()

                const selectedId = props.selectedFileIds[0]
                if (selectedId !== undefined) {
                    if (props.selectedFileIds.length === 1) {
                        props.onDelete(selectedId)
                    } else if (
                        confirm(`Are you sure you want to delete ${props.selectedFileIds.length} selected items?`)
                    ) {
                        // Multi-delete handled in the parent component
                        props.onDelete(selectedId)
                    }
                }
            }
        }

        // Add event listener
        window.addEventListener('keydown', handleKeyDown)

        // Clean up
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [props.selectedFileIds, props.onDelete])

    return (
        <DndProvider backend={HTML5Backend}>
            <div
                className="space-y-1 py-2"
                ref={rootRef}
                data-file-tree-root="true"
            >
                {props.items.map((item) => (
                    <FileTreeNode
                        key={item.id}
                        node={item}
                        level={0}
                        getPermissions={getPermissions}
                        onSelectFile={props.onSelectFile}
                        activeFileId={props.activeFileId}
                        selectedFileIds={props.selectedFileIds}
                        onMultiSelectFile={props.onMultiSelectFile}
                        onMove={props.onMove}
                        onCreateFile={props.onCreateFile}
                        onCreateSheet={props.onCreateSheet}
                        onCreateForm={props.onCreateForm}
                        onCreateFolder={props.onCreateFolder}
                        onCreateUpload={props.onCreateUpload}
                        onRename={props.onRename}
                        onDelete={props.onDelete}
                    />
                ))}
            </div>
        </DndProvider>
    )
}

const ItemTypes = {
    FILE: 'file',
    FOLDER: 'folder',
}

function FileTreeNode({
    node,
    level,
    getPermissions,
    onSelectFile,
    activeFileId,
    selectedFileIds = [],
    onMultiSelectFile,
    onMove,
    onCreateFile,
    onCreateSheet,
    onCreateFolder,
    onCreateForm,
    onCreateUpload,
    onRename,
    onDelete,
}: FileTreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [isDraggedOver, setIsDraggedOver] = useState(false)
    const [isDropSuccess, setIsDropSuccess] = useState(false)
    const [isDropError, setIsDropError] = useState(false)

    // Dialog states
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false)
    const [renameValue, setRenameValue] = useState(node.filename || node.name || '')

    const expandTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const isActive = activeFileId === node.id
    const isSelected = selectedFileIds.includes(node.id)
    const nodeRef = useRef<HTMLDivElement>(null)
    const { toast } = useToast()
    const router = useRouter()

    // Get permissions for this file from the batch query
    const permissions = getPermissions(node.id)
    const { userPermission, canEdit, canShare } = permissions

    // Admin check for programme membership management (Feature 1).
    // getProfile is cached/deduped by react-query, so calling it per node is fine.
    const { data: userProfile } = api.user.getProfile.useQuery()
    const isAdmin =
        !!userProfile && 'role' in userProfile && userProfile.role === 'admin'
    const canManageMembers = isAdmin && node.type === 'programme'

    // Permission checks based on hierarchical permission levels
    const canCreate = canEdit // Edit permission anywhere in hierarchy allows creating files
    const canRename = canEdit // Edit permission anywhere in hierarchy allows renaming
    const canDelete = canEdit // Edit permission anywhere in hierarchy allows deleting

    // Configure drag source
    const [{ isDragging }, drag] = useDrag(() => ({
        type: node.isFolder ? ItemTypes.FOLDER : ItemTypes.FILE,
        item: {
            id: node.id,
            type: node.isFolder ? 'folder' : 'file',
            nodeType: node.type, // Include the actual node type (programme, folder, etc.)
        },
        canDrag: () => {
            // Prevent programmes from being dragged
            return node.type !== 'programme'
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }))

    // Configure drop target
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: [ItemTypes.FILE, ItemTypes.FOLDER],
        canDrop: (item: any) => {
            // Prevent dropping on itself or dropping a parent into its child
            if (item.id === node.id || isParentOfChild(item.id, node)) {
                console.log(
                    `Cannot drop: item.id=${item.id}, node.id=${node.id}, isParentOfChild=${isParentOfChild(item.id, node)}`
                )
                return false
            }

            // For debugging - log allowed drops
            console.log(
                `Can drop: item.id=${item.id}, onto node.id=${node.id}, node.isFolder=${!!node.isFolder}`
            )
            return true
        },
        hover: (item: any, monitor) => {
            // Auto-expand folders after hovering for a second
            if (node.isFolder && !isExpanded) {
                if (expandTimeoutRef.current)
                    clearTimeout(expandTimeoutRef.current)

                expandTimeoutRef.current = setTimeout(() => {
                    setIsExpanded(true)
                }, 800) // Expand after 800ms of hovering
            }

            setIsDraggedOver(true)
        },
        drop: (item: any, monitor) => {
            // Only handle the drop if this component is the direct drop target
            if (monitor.didDrop()) return

            if (onMove) {
                try {
                    // Show visual feedback
                    setIsDropSuccess(true)

                    // Auto-expand folder when an item is dropped onto it
                    if (node.isFolder && !isExpanded) {
                        setIsExpanded(true)
                    }

                    // Log information before the move to help with debugging
                    console.log(`Drag item ID: ${item.id}, Drop target ID: ${node.id}`)
                    console.log(`Target node isFolder: ${!!node.isFolder}, Target parentId: ${node.parentId}`)

                    // Call the onMove handler
                    onMove(item.id, node.id)

                    // Clear success animation after 1 second
                    animationTimeoutRef.current = setTimeout(() => {
                        setIsDropSuccess(false)
                    }, 1000)
                } catch (error) {
                    // Show error feedback
                    setIsDropError(true)
                    console.error('Error during drag and drop: ', error)
                    toast({
                        title: 'Error moving item',
                        description: 'Failed to move the item. Please try again.',
                        variant: 'destructive',
                    })

                    // Clear error animation after 1.5 seconds
                    animationTimeoutRef.current = setTimeout(() => {
                        setIsDropError(false)
                    }, 1500)
                }
            }

            return { dropped: true }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver({ shallow: true }),
            canDrop: monitor.canDrop(),
        }),
    }))

    // Clear the timeouts when unmounting
    useEffect(() => {
        return () => {
            if (expandTimeoutRef.current) {
                clearTimeout(expandTimeoutRef.current)
            }
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current)
            }
        }
    }, [])

    // Reset dragged over state when mouse leaves
    useEffect(() => {
        if (!isOver && isDraggedOver) {
            setIsDraggedOver(false)
            if (expandTimeoutRef.current) {
                clearTimeout(expandTimeoutRef.current)
                expandTimeoutRef.current = null
            }
        }
    }, [isOver, isDraggedOver])

    // TERRIBLE CODE TO FIX LATER IT WAS WRONG
    // Check if potential drop target is a child of the dragged item
    const isParentOfChild = (
        draggedId: number,
        targetNode: FileNode
    ): boolean => {
        // If no parentId, target is at root level
        if (!targetNode.parentId) {
            return false
        }
        // Direct parent match
        if (targetNode.parentId === draggedId) {
            return true
        }

        // Retrieve the full tree from the root element props
        const rootElement = document.querySelector(
            '[data-file-tree-root="true"]'
        )
        const items: FileNode[] = rootElement?.__fileTreeProps?.items || []

        // Helper to find a node by id in the tree
        const findNode = (nodes: FileNode[]): FileNode | undefined => {
            for (const n of nodes) {
                if (n.id === targetNode.parentId) {
                    return n
                }
                if (n.children) {
                    const found = findNode(n.children)
                    if (found) {
                        return found
                    }
                }
            }
            return undefined
        }

        const parentNode = findNode(items)
        if (!parentNode) {
            return false
        }

        // Recursively check up the tree
        return isParentOfChild(draggedId, parentNode)
    }

    // Connect drag and drop to the ref
    drag(drop(nodeRef))

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsExpanded(!isExpanded)
    }

    const handleSelect = (e: React.MouseEvent) => {
        // For folders, toggle expansion unless multi-selection is active
        if (node.isFolder && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            setIsExpanded(!isExpanded)
            return
        }

        // Handle multi-selection
        if (onMultiSelectFile) {
            let newSelectedIds = [...selectedFileIds]

            // Ctrl/Cmd click - toggle selection
            if (e.ctrlKey || e.metaKey) {
                if (isSelected) {
                    // Remove from selection
                    newSelectedIds = newSelectedIds.filter((id) => id !== node.id)
                } else {
                    // Add to selection
                    newSelectedIds.push(node.id)
                }
            }
            // Shift click - select range (only for files, not folders)
            else if (e.shiftKey && activeFileId && !node.isFolder) {
                // Get all files in the tree as a flat array
                const allFiles: number[] = []
                const collectFiles = (nodes: FileNode[] | undefined) => {
                    if (!nodes) return
                    nodes.forEach((n) => {
                        // Only collect files, not folders for range selection
                        if (!n.isFolder) allFiles.push(n.id)
                        collectFiles(n.children)
                    })
                }

                // Get the parent component to provide all items
                const root = document.querySelector('[data-file-tree-root="true"]')
                if (root) {
                    const fileTreeProps = (root as any).__fileTreeProps
                    if (fileTreeProps?.items) {
                        collectFiles(fileTreeProps.items)
                    }
                }

                // Sort the IDs to ensure we get a proper range
                allFiles.sort((a, b) => a - b)

                // Find start and end index
                const startIdx = allFiles.indexOf(activeFileId)
                const endIdx = allFiles.indexOf(node.id)

                if (startIdx !== -1 && endIdx !== -1) {
                    // Get the range of IDs
                    const min = Math.min(startIdx, endIdx)
                    const max = Math.max(startIdx, endIdx)
                    const rangeIds = allFiles.slice(min, max + 1)

                    // Add any IDs that are already selected
                    newSelectedIds = [
                        ...new Set([...newSelectedIds, ...rangeIds]),
                    ]
                }
            }
            // Regular click - select just this one
            else {
                newSelectedIds = [node.id]
                if (onSelectFile) {
                    onSelectFile(node.id)
                }
            }

            onMultiSelectFile(newSelectedIds)
        }
        // Regular single selection
        else if (!node.isFolder && onSelectFile) {
            onSelectFile(node.id)
        }
    }

    const handleCreateFile = () => {
        if (onCreateFile) {
            onCreateFile(node.id)
            setIsExpanded(true) // Expand folder when creating new file
        }
    }

    const handleCreateSheet = () => {
        if (onCreateSheet) {
            onCreateSheet(node.id)
            setIsExpanded(true) // Expand folder when creating new sheet
        }
    }

    const handleCreateFolder = () => {
        if (onCreateFolder) {
            onCreateFolder(node.id)
            setIsExpanded(true) // Expand folder when creating new subfolder
        }
    }

    const handleCreateForm = () => {
        if (onCreateForm) {
            onCreateForm(node.id)
            setIsExpanded(true) // Expand folder when creating new form
        }
    }

    const handleCreateUpload = () => {
        if (onCreateUpload) {
            onCreateUpload(node.id)
            setIsExpanded(true) // Expand folder when creating new upload
        }
    }

    const handleRename = () => {
        setRenameValue(node.filename || node.name || '')
        setIsRenameDialogOpen(true)
    }

    const handleRenameConfirm = () => {
        if (
            onRename &&
            renameValue.trim() &&
            renameValue.trim() !== (node.filename || node.name)
        ) {
            onRename(node.id, renameValue.trim())
        }
        setIsRenameDialogOpen(false)
    }

    const handleDelete = () => {
        setIsDeleteDialogOpen(true)
    }

    const handleDeleteConfirm = () => {
        if (onDelete) {
            onDelete(node.id)
            // If this file is currently being viewed, redirect to dashboard
            if (activeFileId === node.id) {
                router.push('/dashboard')
            }
        }
        setIsDeleteDialogOpen(false)
    }

    const handleShare = () => {
        setIsShareModalOpen(true)
    }

    return (
        <div className="flex flex-col">
            <div
                ref={nodeRef}
                className={cn(
                    'flex items-center py-1 rounded-md cursor-pointer transition-all duration-200',
                    node.type !== 'programme' && 'hover:bg-sidebar-accent/10',
                    node.type === 'programme' &&
                        'hover:bg-secondary/60 dark:hover:bg-secondary/30',
                    isActive &&
                        node.type !== 'programme' &&
                        !node.isFolder &&
                        'bg-sidebar-accent/20 text-sidebar-accent-foreground',
                    isSelected &&
                        node.type !== 'programme' &&
                        !isActive &&
                        'bg-sidebar-accent/10 text-sidebar-accent-foreground border border-sidebar-accent/30',
                    node.type === 'programme' &&
                        'bg-secondary/50 dark:bg-secondary/20',
                    isOver &&
                        canDrop &&
                        node.isFolder &&
                        'border-2 border-primary bg-primary/10',
                    isOver &&
                        canDrop &&
                        !node.isFolder &&
                        'border-2 border-primary/50',
                    isDragging && 'opacity-50',
                    isDropSuccess &&
                        'bg-green-500/20 border-green-500 border-2 animate-pulse',
                    isDropError &&
                        'bg-red-500/20 border-red-500 border-2 animate-pulse',
                    level > 0
                        ? 'pl-[calc(theme(spacing.5)*var(--level))]'
                        : 'pl-2'
                )}
                style={{ '--level': level } as React.CSSProperties}
                onClick={(e) => handleSelect(e)}
            >
                {node.isFolder ? (
                    <div className="flex items-center gap-1 flex-1 group">
                        <div
                            className="flex items-center"
                            onClick={handleToggle}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4 mr-1 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="h-4 w-4 mr-1 text-muted-foreground shrink-0" />
                            )}
                            <Folder
                                className={cn(
                                    'h-4 w-4 mr-2 shrink-0',
                                    node.type === 'programme'
                                        ? 'text-primary dark:text-primary'
                                        : 'text-muted-foreground'
                                )}
                            />
                        </div>
                        <span
                            className={cn(
                                'text-sm truncate flex-1',
                                node.type === 'programme' &&
                                    'font-semibold text-primary dark:text-primary'
                            )}
                        >
                            {node.filename || node.name}
                        </span>
                        {node.isPasswordProtected && (
                            <Lock
                                className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground"
                                aria-label="Password protected"
                            />
                        )}
                        {/* Only show dropdown if user has any permissions */}
                        {(canCreate || canShare || canRename || canDelete) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    asChild
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                    >
                                        <MoreHorizontal size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {canCreate && (
                                    <>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleCreateFile()
                                            }}
                                        >
                                            <FileText
                                                size={14}
                                                className="mr-2"
                                            />{' '}
                                            New Page
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleCreateSheet()
                                            }}
                                        >
                                            <Sheet size={14} className="mr-2" />{' '}
                                            New Sheet
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleCreateForm()
                                            }}
                                        >
                                            <Plus size={14} className="mr-2" />{' '}
                                            New Form
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleCreateUpload()
                                            }}
                                        >
                                            <UploadCloud
                                                size={14}
                                                className="mr-2"
                                            />{' '}
                                            Upload File
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleCreateFolder()
                                            }}
                                        >
                                            <Folder
                                                size={14}
                                                className="mr-2"
                                            />{' '}
                                            New Folder
                                        </DropdownMenuItem>
                                    </>
                                )}
                                {canManageMembers && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            setIsMembersPanelOpen(true)
                                        }}
                                    >
                                        <Users size={14} className="mr-2" />{' '}
                                        Manage members
                                    </DropdownMenuItem>
                                )}
                                {canShare && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleShare()
                                        }}
                                    >
                                        <Share2 size={14} className="mr-2" />{' '}
                                        Share
                                    </DropdownMenuItem>
                                )}
                                {canRename && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleRename()
                                        }}
                                    >
                                        <Edit2 size={14} className="mr-2" />{' '}
                                        Rename
                                    </DropdownMenuItem>
                                )}
                                {canDelete && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleDelete()
                                        }}
                                    >
                                        <Trash2 size={14} className="mr-2" />{' '}
                                        Delete
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-1 flex-1 group">
                        <div className="ml-5 flex items-center">
                            {(() => {
                                switch (node.type) {
                                    case 'sheet':
                                        return (
                                            <Sheet className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                                        )
                                    case 'form':
                                        return (
                                            <ClipboardList className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                                        )
                                    case 'upload':
                                        return (
                                            <UploadCloud className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                                        )
                                    default:
                                        return (
                                            <FileText className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                                        )
                                }
                            })()}
                        </div>
                        <span className="text-sm truncate flex-1">
                            {node.filename || node.name}
                        </span>
                        {node.isPasswordProtected && (
                            <Lock
                                className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground"
                                aria-label="Password protected"
                            />
                        )}
                        {/* Only show dropdown if user has any permissions */}
                        {(canShare || canRename || canDelete) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                asChild
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                >
                                    <MoreHorizontal size={14} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {canShare && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleShare()
                                        }}
                                    >
                                        <Share2 size={14} className="mr-2" />{' '}
                                        Share
                                    </DropdownMenuItem>
                                )}
                                {canRename && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleRename()
                                        }}
                                    >
                                        <Edit2 size={14} className="mr-2" />{' '}
                                        Rename
                                    </DropdownMenuItem>
                                )}
                                {canDelete && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleDelete()
                                        }}
                                    >
                                        <Trash2 size={14} className="mr-2" />{' '}
                                        Delete
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                    </div>
                )}
            </div>

            {node.isFolder &&
                isExpanded &&
                node.children &&
                node.children.length > 0 && (
                    <div className="flex flex-col">
                        {node.children.map((child) => (
                            <FileTreeNode
                                key={child.id}
                                node={child}
                                level={level + 1}
                                onSelectFile={onSelectFile}
                                activeFileId={activeFileId}
                                selectedFileIds={selectedFileIds}
                                onMultiSelectFile={onMultiSelectFile}
                                onMove={onMove}
                                onCreateFile={onCreateFile}
                                onCreateSheet={onCreateSheet}
                                onCreateForm={onCreateForm}
                                onCreateUpload={onCreateUpload}
                                onCreateFolder={onCreateFolder}
                                onRename={onRename}
                                onDelete={onDelete}
                                getPermissions={getPermissions}
                            />
                        ))}
                    </div>
                )}

            {/* Programme members panel (admin-only, Feature 1) */}
            {canManageMembers && (
                <ProgrammeMembersPanel
                    isOpen={isMembersPanelOpen}
                    onClose={() => setIsMembersPanelOpen(false)}
                    programmeId={node.id}
                    programmeName={node.filename || node.name || 'Programme'}
                />
            )}

            {/* Rename Dialog */}
            <Dialog
                open={isRenameDialogOpen}
                onOpenChange={setIsRenameDialogOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Rename {node.isFolder ? 'Folder' : 'File'}
                        </DialogTitle>
                        <DialogDescription>
                            Enter a new name for{' '}
                            {node.isFolder ? 'this folder' : 'this file'}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rename-input">Name</Label>
                            <div className="relative">
                                <Input
                                    id="rename-input"
                                    value={renameValue}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value.length <= 50) {
                                            setRenameValue(value);
                                        }
                                    }}
                                    className={renameValue.length === 50 ? "border-red-500" : ""}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleRenameConfirm()
                                        } else if (e.key === 'Escape') {
                                            setIsRenameDialogOpen(false)
                                        }
                                    }}
                                    placeholder="Enter new name"
                                    autoFocus
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                    {renameValue.length}/50
                                </div>
                            </div>
                            {renameValue.length === 50 && (
                                <p className="text-sm text-red-500 mt-1">
                                    Maximum character limit reached
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={(e) => {
                                e.preventDefault()
                                setIsRenameDialogOpen(false)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault()
                                handleRenameConfirm()
                            }}
                            disabled={!renameValue.trim()}
                        >
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
            >
                <DialogContent
                    // Allow enter and escape keys to confirm or cancel delete operation
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleDeleteConfirm();
                        } else if (e.key === 'Escape') {
                            setIsDeleteDialogOpen(false);
                        }
                    }}
                    tabIndex={0}
                >
                    <DialogHeader>
                        <DialogTitle>
                            Delete {node.isFolder
                                ? 'Folder'
                                : node.type === 'sheet'
                                    ? 'Sheet'
                                    : node.type === 'form'
                                        ? 'Form'
                                        : node.type === 'upload'
                                            ? 'Upload'
                                            : 'File'}
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{node.filename || node.name}"?
                            {node.isFolder &&
                                ' This will also delete all files and folders inside it.'}{' '}
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={(e) => {
                                e.preventDefault()
                                setIsDeleteDialogOpen(false)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={(e) => {
                                e.preventDefault()
                                handleDeleteConfirm()
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Share Modal */}
            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                filename={node.filename || node.name || ''}
                fileId={node.id}
            />
        </div>
    )
}

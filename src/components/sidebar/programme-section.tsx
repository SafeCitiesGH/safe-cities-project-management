'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { FileNode } from '~/components/file-tree'
import { FileTree } from '~/components/file-tree'
import { useFileTree } from '~/providers/file-tree-provider'
import { NewFileDialog, type NewFileType } from '~/components/new-file-dialog'
import { navigateToFile } from '~/lib/navigation-utils'
import { FILE_TYPES } from '~/server/db/schema'
import type { FileTypeFilter } from '~/components/sidebar/sidebar-header'
import {
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
} from '~/components/ui/sidebar'

interface ProgrammeSectionProps {
    canCreateProgramme: boolean
    onFileActions: {
        onMove: (dragId: number, dropId: number) => void
        onRename: (id: number, filename: string) => void
        onDelete: (id: number) => void
    }
    selectedFileIds: number[]
    setSelectedFileIds: (ids: number[]) => void
    activeFileId?: number
    setActiveFileId: (id?: number) => void
    searchTerm: string
    typeFilter: FileTypeFilter
}

/**
 * Recursively filter a file tree by node type.
 * Structural containers (folder, programme) are kept if they contain any matching descendants.
 */
function filterTreeByType(nodes: FileNode[], type: FileTypeFilter): FileNode[] {
    if (type === 'all') return nodes

    return nodes.reduce<FileNode[]>((acc, node) => {
        const isContainer = node.type === 'folder' || node.type === 'programme'
        const nodeMatchesType = node.type === type

        if (nodeMatchesType) {
            // Node itself matches — include with all its children intact
            acc.push(node)
        } else if (isContainer) {
            // Container doesn't match, but keep it if it has matching descendants
            const filteredChildren = filterTreeByType(node.children ?? [], type)
            if (filteredChildren.length > 0) {
                acc.push({ ...node, children: filteredChildren })
            }
        }

        return acc
    }, [])
}

export function ProgrammeSection({
    canCreateProgramme,
    onFileActions,
    selectedFileIds,
    setSelectedFileIds,
    activeFileId,
    setActiveFileId,
    searchTerm,
    typeFilter,
}: ProgrammeSectionProps) {
    const router = useRouter()
    const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false)
    const [newFileDialogType, setNewFileDialogType] = useState<
        NewFileType | undefined
    >(undefined)
    const [newFileParentId, setNewFileParentId] = useState<number | null>(null)

    const { fileTree, isLoading: isFileTreeLoading, filterTreeBySearchTerm } = useFileTree()

    // Helper function to find a node by ID in the full (unfiltered) file tree
    const findNodeById = (nodes: FileNode[], id: number): FileNode | null => {
        for (const node of nodes) {
            if (node.id === id) return node
            if (node.children && node.children.length > 0) {
                const found = findNodeById(node.children, id)
                if (found) return found
            }
        }
        return null
    }

    // Apply search term filter first, then type filter
    const displayedTree = useMemo(() => {
        const afterSearch = searchTerm.trim()
            ? filterTreeBySearchTerm(searchTerm)
            : fileTree
        return filterTreeByType(afterSearch, typeFilter)
    }, [fileTree, searchTerm, typeFilter, filterTreeBySearchTerm])

    const isFiltering = searchTerm.trim() !== '' || typeFilter !== 'all'

    const handleSelectFile = (id: number) => {
        setActiveFileId(id)
        setSelectedFileIds([id])

        const node = findNodeById(fileTree, id)
        if (node && !node.isFolder && node.type) {
            const typeMapping = {
                page: FILE_TYPES.PAGE,
                sheet: FILE_TYPES.SHEET,
                form: FILE_TYPES.FORM,
                folder: FILE_TYPES.FOLDER,
                upload: FILE_TYPES.UPLOAD,
                programme: FILE_TYPES.PROGRAMME,
            } as const

            const fileType = typeMapping[node.type]
            if (fileType) {
                navigateToFile(router, id, fileType)
            }
        }
    }

    const createFileHandler =
        (type: NewFileType) => (parentId: number | null) => {
            setNewFileDialogType(type)
            setNewFileParentId(parentId)
            setIsNewFileDialogOpen(true)
        }

    return (
        <>
            <SidebarGroup>
                <SidebarGroupLabel className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span>Programmes</span>
                    </div>
                    {canCreateProgramme && (
                        <div className="flex gap-1">
                            <SidebarGroupAction
                                onClick={() => {
                                    setNewFileDialogType('programme')
                                    setIsNewFileDialogOpen(true)
                                }}
                            >
                                <Plus size={16} />
                                <span className="sr-only">Add Programme</span>
                            </SidebarGroupAction>
                        </div>
                    )}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                    {isFileTreeLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                            Loading files...
                        </div>
                    ) : displayedTree.length === 0 && isFiltering ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                            No files match your search.
                        </div>
                    ) : (
                        <div>
                            <FileTree
                                items={displayedTree}
                                onSelectFile={handleSelectFile}
                                activeFileId={activeFileId}
                                selectedFileIds={selectedFileIds}
                                onMultiSelectFile={setSelectedFileIds}
                                onMove={onFileActions.onMove}
                                onCreateFile={createFileHandler('page')}
                                onCreateSheet={createFileHandler('sheet')}
                                onCreateForm={createFileHandler('form')}
                                onCreateUpload={createFileHandler('upload')}
                                onCreateFolder={createFileHandler('folder')}
                                onRename={onFileActions.onRename}
                                onDelete={onFileActions.onDelete}
                            />
                        </div>
                    )}
                </SidebarGroupContent>
            </SidebarGroup>

            <NewFileDialog
                open={isNewFileDialogOpen}
                onOpenChange={(open) => {
                    setIsNewFileDialogOpen(open)
                    if (!open) {
                        setNewFileParentId(null)
                    }
                }}
                fileType={newFileDialogType}
                parentId={newFileParentId}
            />
        </>
    )
}

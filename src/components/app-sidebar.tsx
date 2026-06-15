'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
    Sidebar,
    SidebarContent,
    SidebarSeparator,
    useSidebar,
} from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import { NewFileDialog } from './new-file-dialog'
import { SidebarHeaderComponent, type FileTypeFilter } from './sidebar/sidebar-header'
import { NavigationMenu } from './sidebar/navigation-menu'
import { ProgrammeSection } from './sidebar/programme-section'
import { SidebarFooterComponent } from './sidebar/sidebar-footer'
import { useSidebarState, useFileOperations } from './sidebar/use-sidebar-state'

export function AppSidebar() {
    const pathname = usePathname()
    const isMobile = useMobile()
    const { setOpenMobile } = useSidebar()

    const [searchTerm, setSearchTerm] = useState('')
    const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all')

    const {
        isNewFileDialogOpen,
        setIsNewFileDialogOpen,
        newFileDialogType,
        setNewFileDialogType,
        newFileParentId,
        setNewFileParentId,
        activeFileId,
        setActiveFileId,
        selectedFileIds,
        setSelectedFileIds,
        userProfile,
        fileTree,
        canCreateProgramme,
    } = useSidebarState()

    const { handleMove, handleRename, handleDelete } = useFileOperations()

    // Hide mobile sidebar on route navigation
    useEffect(() => {
        if (isMobile) {
            setOpenMobile(false)
        }
    }, [pathname, isMobile, setOpenMobile])

    const handleNewFileClick = () => {
        setNewFileDialogType(undefined)
        setIsNewFileDialogOpen(true)
    }

    const fileActions = {
        onMove: (dragId: number, dropId: number) =>
            handleMove(dragId, dropId, fileTree, selectedFileIds),
        onRename: handleRename,
        onDelete: (id: number) =>
            handleDelete(id, selectedFileIds, setSelectedFileIds),
    }

    return (
        <>
            <Sidebar>
                <SidebarHeaderComponent
                    onNewFileClick={handleNewFileClick}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    typeFilter={typeFilter}
                    onTypeFilterChange={setTypeFilter}
                />

                <SidebarSeparator />

                <NavigationMenu
                        currentPath={pathname}
                        userRole={
                            userProfile && 'role' in userProfile
                                ? userProfile.role || undefined
                                : undefined
                        }
                />

                <SidebarSeparator />

                <SidebarContent>
                    <ProgrammeSection
                        canCreateProgramme={canCreateProgramme}
                        onFileActions={fileActions}
                        selectedFileIds={selectedFileIds}
                        setSelectedFileIds={setSelectedFileIds}
                        activeFileId={activeFileId}
                        setActiveFileId={setActiveFileId}
                        searchTerm={searchTerm}
                        typeFilter={typeFilter}
                    />
                </SidebarContent>

                <SidebarSeparator />

                <SidebarFooterComponent userProfile={userProfile} />
            </Sidebar>

            {/* Global New File Dialog */}
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

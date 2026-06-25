'use client'

import { Plus, Search, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { SidebarHeader, SidebarTrigger, useSidebar } from '~/components/ui/sidebar'
import { ThemeToggle } from '../tiptap-templates/simple/theme-toggle'
import { SafeCities } from '../SafeCities'
import { cn } from '~/lib/utils'

export type FileTypeFilter = 'all' | 'page' | 'sheet' | 'form' | 'upload' | 'folder'

const TYPE_FILTER_OPTIONS: { value: FileTypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'page', label: 'Page' },
    { value: 'sheet', label: 'Sheet' },
    { value: 'form', label: 'Form' },
    { value: 'folder', label: 'Folder' },
    { value: 'upload', label: 'Upload' },
]

interface SidebarHeaderComponentProps {
    onNewFileClick: () => void
    searchTerm: string
    onSearchChange: (term: string) => void
    typeFilter: FileTypeFilter
    onTypeFilterChange: (type: FileTypeFilter) => void
}

export function SidebarHeaderComponent({
    onNewFileClick,
    searchTerm,
    onSearchChange,
    typeFilter,
    onTypeFilterChange,
}: SidebarHeaderComponentProps) {
    const { state } = useSidebar()

    return (
        <SidebarHeader className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-[3rem] w-[5.2rem] shrink-0 items-center justify-center rounded-[1.05rem] border border-sidebar-border/90 bg-gradient-to-br from-sidebar-primary/10 to-sidebar-accent/45 px-0.5 py-0.5 shadow-sm">
                        <SafeCities
                            width={112}
                            height={60}
                            className="max-h-[3.05rem] max-w-[4.9rem]"
                        />
                    </div>
                    <div className="flex min-w-0 flex-col justify-center">
                        <span className="text-[0.95rem] font-bold leading-none tracking-[0.01em] text-foreground">
                            Safe Cities
                        </span>
                        <span className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.2em] text-primary/80">
                            Project Management
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    {state === 'expanded' && <SidebarTrigger />}
                </div>
            </div>

            <Button
                size="sm"
                className="w-full justify-start gap-2 shadow-sm"
                onClick={onNewFileClick}
            >
                <Plus size={16} />
                New File
            </Button>

            {/* Search input */}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                    placeholder="Search files..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="h-8 pl-8 pr-7 text-sm"
                />
                {searchTerm && (
                    <button
                        onClick={() => onSearchChange('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Type filter pills */}
            <div className="flex flex-wrap gap-1">
                {TYPE_FILTER_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => onTypeFilterChange(option.value)}
                        className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                            typeFilter === option.value
                                ? 'border-primary/40 bg-primary text-primary-foreground'
                                : 'border-transparent bg-muted/80 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground'
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </SidebarHeader>
    )
}

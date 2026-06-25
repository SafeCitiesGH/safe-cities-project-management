'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
    ReactGrid,
    type CellChange,
    type Column,
    type DefaultCellTypes,
    type Id,
    type MenuOption,
    type SelectionMode,
} from '@silevis/reactgrid'
import '@silevis/reactgrid/styles.scss'
import { applyChangesToSheet, type SheetData } from '~/lib/sheet-utils'
import { isFormDataColumn } from '~/lib/form-sync-utils'
import { api } from '~/trpc/react'
import { toast } from '~/hooks/use-toast'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { Plus, Activity, Shield, Info, Undo, Redo } from 'lucide-react'

interface SheetEditorProps {
    initialData: SheetData
    sheetId: number
    sheetName?: string
    readOnly?: boolean
    syncMetadata?: {
        formId: number
        isLiveSync: boolean
        formDataColumnCount: number
        lastSyncAt: string
    }
    onSavingStatusChange?: (status: 'idle' | 'saving' | 'saved') => void
    onShowVersionHistory?: () => void
}

export function SheetEditor({
    initialData,
    sheetId,
    sheetName,
    readOnly = false,
    syncMetadata,
    onSavingStatusChange,
    onShowVersionHistory,
}: SheetEditorProps) {
    const [sheet, setSheet] = useState<SheetData>(initialData)

    // Rename dialog state
    const [renameState, setRenameState] = useState<{
        rowId: string
        colIndex: number
        currentText: string
        label: string
    } | null>(null)
    const [renameInputValue, setRenameInputValue] = useState('')
    const renameInputRef = useRef<HTMLInputElement>(null)

    // Auto-focus and select the rename input when it opens
    useEffect(() => {
        if (renameState) {
            setRenameInputValue(renameState.currentText)
            setTimeout(() => {
                renameInputRef.current?.focus()
                renameInputRef.current?.select()
            }, 50)
        }
    }, [renameState])

    // Snapshot-based undo/redo: history[historyIndex] is always the current state.
    // Undo restores history[historyIndex - 1]; Redo restores history[historyIndex + 1].
    // This covers cell edits AND structural changes (add column, add row).
    const [history, setHistory] = useState<SheetData[]>([initialData])
    const [historyIndex, setHistoryIndex] = useState(0)

    // Debounced saving - only save after 5 seconds of no editing
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Ref to the outer container div, used for Escape-to-deselect
    const containerRef = useRef<HTMLDivElement>(null)

    const isLiveSyncSheet = syncMetadata?.isLiveSync
    const formDataColumnCount = syncMetadata?.formDataColumnCount || 0

    const updateMutation = api.files.updateSheetContent.useMutation({
        onSuccess: () => {
            onSavingStatusChange?.('saved')
            setTimeout(() => onSavingStatusChange?.('idle'), 2000)
        },
        onError: (error) => {
            onSavingStatusChange?.('idle')
            toast({
                title: '❌ Save failed',
                description: error.message,
                variant: 'destructive',
            })
        },
    })

    // Debounced save function - 5 seconds of no editing
    const debouncedSave = useCallback(
        (sheetData: SheetData) => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
            saveTimeoutRef.current = setTimeout(() => {
                onSavingStatusChange?.('saving')
                updateMutation.mutate({
                    fileId: sheetId,
                    content: JSON.stringify(sheetData),
                })
            }, 5000)
        },
        [sheetId, updateMutation, onSavingStatusChange]
    )

    // Commit a new sheet state: updates the sheet, pushes a snapshot to history, and saves.
    // This is the single entry point for ALL mutations (cell edits, add column, add row).
    const commitChange = useCallback(
        (newSheet: SheetData) => {
            setSheet(newSheet)
            setHistory((prev) => {
                // Truncate any "future" history (from undos) then append the new state.
                const next = [...prev.slice(0, historyIndex + 1), newSheet]
                // Cap at 50 snapshots to avoid unbounded memory growth.
                return next.length > 50 ? next.slice(-50) : next
            })
            setHistoryIndex((prev) => Math.min(prev + 1, 50))
            debouncedSave(newSheet)
        },
        [historyIndex, debouncedSave]
    )

    // Apply a rename to a header cell (column header or row label)
    const applyRename = useCallback(
        (newText: string) => {
            if (!renameState) return
            const newSheet = {
                ...sheet,
                rows: sheet.rows.map((row) => ({
                    ...row,
                    cells: [...row.cells] as DefaultCellTypes[],
                })),
            }
            const rowIndex = newSheet.rows.findIndex(
                (r) => r.rowId === renameState.rowId
            )
            if (rowIndex === -1) {
                setRenameState(null)
                return
            }
            const cell = newSheet.rows[rowIndex]!.cells[renameState.colIndex]
            if (!cell) {
                setRenameState(null)
                return
            }
            newSheet.rows[rowIndex]!.cells[renameState.colIndex] = {
                ...cell,
                text: newText,
            } as DefaultCellTypes
            newSheet.cells = newSheet.rows.map((r) => r.cells)
            commitChange(newSheet)
            setRenameState(null)
        },
        [renameState, sheet, commitChange]
    )

    // Undo: restore the previous snapshot
    const undoChanges = useCallback(() => {
        if (historyIndex > 0) {
            const prevSheet = history[historyIndex - 1]!
            setSheet(prevSheet)
            setHistoryIndex(historyIndex - 1)
            debouncedSave(prevSheet)
        }
    }, [historyIndex, history, debouncedSave])

    // Redo: restore the next snapshot
    const redoChanges = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextSheet = history[historyIndex + 1]!
            setSheet(nextSheet)
            setHistoryIndex(historyIndex + 1)
            debouncedSave(nextSheet)
        }
    }, [historyIndex, history, debouncedSave])

    // Helper function to apply cell-level changes to sheet data
    const applyNewValue = useCallback(
        (
            changes: CellChange[],
            prevSheet: SheetData,
        ): SheetData => {
            const newSheet = { ...prevSheet }

            changes.forEach((change) => {
                if (
                    syncMetadata?.formDataColumnCount &&
                    isFormDataColumn(
                        change.columnId as number,
                        syncMetadata.formDataColumnCount
                    )
                ) {
                    return
                }

                const rowIndex = newSheet.rows.findIndex(
                    (row) => row.rowId === change.rowId
                )
                if (rowIndex === -1) return

                const row = { ...newSheet.rows[rowIndex]! }
                const newCells = [...(row.cells || [])] as DefaultCellTypes[]
                newCells[change.columnId as number] = change.newCell as DefaultCellTypes

                row.cells = newCells
                newSheet.rows[rowIndex] = row
                newSheet.cells[rowIndex] = newCells
            })

            return newSheet
        },
        [syncMetadata?.formDataColumnCount]
    )

    // Check if Mac OS for keyboard shortcuts
    const isMacOs = useCallback(() => {
        return (
            typeof navigator !== 'undefined' &&
            navigator.platform.toUpperCase().indexOf('MAC') >= 0
        )
    }, [])

    // Keyboard event handler for undo/redo and Escape-to-deselect
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (readOnly) return

            // Escape: blur the focused cell so the user is visually "out" of the grid
            if (e.key === 'Escape') {
                ;(document.activeElement as HTMLElement)?.blur()
                return
            }

            const isCtrlOrCmd =
                (!isMacOs() && e.ctrlKey) || (isMacOs() && e.metaKey)

            if (isCtrlOrCmd) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        if (e.shiftKey) {
                            e.preventDefault()
                            redoChanges()
                        } else {
                            e.preventDefault()
                            undoChanges()
                        }
                        break
                    case 'y':
                        if (!isMacOs()) {
                            e.preventDefault()
                            redoChanges()
                        }
                        break
                }
            }
        },
        [readOnly, isMacOs, undoChanges, redoChanges]
    )

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [handleKeyDown])

    // Click-outside: blur the active ReactGrid cell when the user clicks
    // anywhere outside the sheet container, so selection visually clears.
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                ;(document.activeElement as HTMLElement)?.blur()
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [])

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [])

    // Add a new column
    const addColumn = () => {
        // Deep-copy rows so we don't mutate existing history snapshots
        const newSheet = {
            ...sheet,
            rows: sheet.rows.map(row => ({ ...row, cells: [...row.cells] as DefaultCellTypes[] })),
        }
        const currentColCount = newSheet.rows[0]?.cells.length || 0

        const getColumnLetter = (index: number): string => {
            let result = ''
            while (index > 0) {
                index--
                result = String.fromCharCode(65 + (index % 26)) + result
                index = Math.floor(index / 26)
            }
            return result
        }

        const columnLetter = getColumnLetter(currentColCount)

        if (newSheet.rows[0]) {
            newSheet.rows[0].cells.push({
                type: 'header',
                text: columnLetter,
            } as DefaultCellTypes)
        }

        for (let i = 1; i < newSheet.rows.length; i++) {
            newSheet.rows[i]?.cells.push({
                type: 'text',
                text: '',
            } as DefaultCellTypes)
        }

        newSheet.cells = newSheet.rows.map((row) => row.cells)

        // commitChange handles setSheet + history + debouncedSave
        commitChange(newSheet)
    }

    // Add a new row
    const addRow = () => {
        // Deep-copy rows so we don't mutate existing history snapshots
        const newSheet = {
            ...sheet,
            rows: sheet.rows.map(row => ({ ...row, cells: [...row.cells] as DefaultCellTypes[] })),
        }
        const newRowIndex = newSheet.rows.length
        const colCount = newSheet.rows[0]?.cells.length || 0

        const newRow = {
            rowId: `row-${newRowIndex}`,
            height: 35,
            cells: Array.from({ length: colCount }, (_, j) => {
                if (j === 0) {
                    return {
                        type: 'header',
                        text: `${newRowIndex}`,
                    } as DefaultCellTypes
                }
                return {
                    type: 'text',
                    text: '',
                } as DefaultCellTypes
            }),
        }

        newSheet.rows.push(newRow)
        newSheet.cells = newSheet.rows.map((row) => row.cells)

        commitChange(newSheet)
    }

    const onCellsChanged = (changes: CellChange[]) => {
        if (readOnly) return

        const allowedChanges = isLiveSyncSheet
            ? changes.filter(
                  (change) =>
                      !isFormDataColumn(
                          change.columnId as number,
                          formDataColumnCount
                      )
              )
            : changes

        if (allowedChanges.length === 0) {
            toast({
                title: '🛡️ Cannot edit form data',
                description:
                    'Form data columns are protected and cannot be edited. Try adding a new column for your notes.',
                variant: 'destructive',
            })
            return
        }

        if (allowedChanges.length < changes.length) {
            toast({
                title: '⚠️ Some edits blocked',
                description:
                    'Form data columns are protected. Only additional columns can be edited.',
                variant: 'default',
            })
        }

        const newSheet = applyNewValue(allowedChanges, sheet)
        commitChange(newSheet)
    }

    // Right-click context menu: rename column, rename row, delete column, delete row
    const handleContextMenu = useCallback(
        (
            selectedRowIds: Id[],
            selectedColIds: Id[],
            selectionMode: SelectionMode,
            menuOptions: MenuOption[],
        ): MenuOption[] => {
            if (readOnly) return menuOptions

            const newOptions = [...menuOptions]
            const colIds = selectedColIds as number[]
            const rowIds = selectedRowIds as string[]
            const protectedRowIds = ['header', 'alphabetical-header', 'form-field-header']

            // Rename Column: column-selection mode, single column, col > 0
            if (selectionMode === 'column' && colIds.length === 1 && colIds[0]! > 0) {
                const colIndex = colIds[0]!
                const headerRow =
                    sheet.rows.find((r) => r.rowId === 'header') ??
                    sheet.rows.find((r) => r.rowId === 'alphabetical-header')
                const currentText =
                    (headerRow?.cells[colIndex] as { text?: string })?.text ?? ''
                newOptions.push({
                    id: 'renameColumn',
                    label: 'Rename Column',
                    handler: () => {
                        setRenameState({
                            rowId: (headerRow?.rowId ?? 'header') as string,
                            colIndex,
                            currentText,
                            label: 'Column',
                        })
                    },
                })
            }

            // Rename Row: row-selection mode, single non-header row
            if (
                selectionMode === 'row' &&
                rowIds.length === 1 &&
                !protectedRowIds.includes(rowIds[0]!)
            ) {
                const rowId = rowIds[0]!
                const row = sheet.rows.find((r) => r.rowId === rowId)
                const currentText = (row?.cells[0] as { text?: string })?.text ?? ''
                newOptions.push({
                    id: 'renameRow',
                    label: 'Rename Row',
                    handler: () => {
                        setRenameState({
                            rowId,
                            colIndex: 0,
                            currentText,
                            label: 'Row',
                        })
                    },
                })
            }

            // Delete Column: column-selection mode, non-protected columns > 0
            if (selectionMode === 'column') {
                const deletableCols = colIds.filter(
                    (colId) =>
                        colId > 0 &&
                        (!isLiveSyncSheet || !isFormDataColumn(colId, formDataColumnCount))
                )
                if (deletableCols.length > 0) {
                    newOptions.push({
                        id: 'deleteColumn',
                        label: `Delete Column${deletableCols.length > 1 ? 's' : ''}`,
                        handler: () => {
                            const toDelete = [...deletableCols].sort((a, b) => b - a)
                            const newSheet = { ...sheet }
                            newSheet.rows = newSheet.rows.map((row) => {
                                const newCells = [...row.cells] as DefaultCellTypes[]
                                toDelete.forEach((colIdx) => newCells.splice(colIdx, 1))
                                return { ...row, cells: newCells }
                            })
                            newSheet.cells = newSheet.rows.map((row) => row.cells)
                            commitChange(newSheet)
                        },
                    })
                }
            }

            // Delete Row: row-selection mode, non-header rows only
            if (selectionMode === 'row') {
                const deletableRows = rowIds.filter(
                    (r) => !protectedRowIds.includes(r)
                )
                if (deletableRows.length > 0) {
                    newOptions.push({
                        id: 'deleteRow',
                        label: `Delete Row${deletableRows.length > 1 ? 's' : ''}`,
                        handler: () => {
                            const toDelete = new Set(deletableRows)
                            const newSheet = { ...sheet }
                            newSheet.rows = newSheet.rows.filter(
                                (row) => !toDelete.has(row.rowId as string)
                            )
                            newSheet.cells = newSheet.rows.map((row) => row.cells)
                            commitChange(newSheet)
                        },
                    })
                }
            }

            return newOptions
        },
        [readOnly, isLiveSyncSheet, formDataColumnCount, sheet, commitChange]
    )

    const columns: Column[] =
        sheet.rows[0]?.cells.map((_, index) => {
            const isFormDataCol =
                isLiveSyncSheet && isFormDataColumn(index, formDataColumnCount)
            return {
                columnId: index,
                width: index === 0 ? 60 : 120,
                resizable: true,
                ...(isFormDataCol && {
                    className: 'rg-column-form-data',
                }),
            }
        }) || []

    return (
        <div className="flex flex-col h-full" ref={containerRef}>
            {isLiveSyncSheet && (
                <style jsx>{`
                    .rg-column-form-data .rg-cell {
                        background-color: hsl(var(--muted)) !important;
                        border-right: 2px solid hsl(var(--border)) !important;
                    }
                    .rg-column-form-data .rg-cell:hover {
                        background-color: hsl(var(--muted) / 0.8) !important;
                    }
                    .rg-column-form-data .rg-cell.rg-cell-header {
                        background-color: hsl(var(--muted)) !important;
                        font-weight: 600;
                        color: hsl(var(--muted-foreground)) !important;
                    }
                `}</style>
            )}

            {/* Centered Action Bar */}
            {!readOnly && (
                <div className="flex justify-center items-center p-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={undoChanges}
                            disabled={historyIndex <= 0}
                            className="flex items-center gap-2"
                            title={`Undo (${isMacOs() ? 'Cmd' : 'Ctrl'}+Z)`}
                        >
                            <Undo className="h-4 w-4" />
                            Undo
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={redoChanges}
                            disabled={historyIndex >= history.length - 1}
                            className="flex items-center gap-2"
                            title={`Redo (${isMacOs() ? 'Cmd+Shift' : 'Ctrl+Shift'}+Z)`}
                        >
                            <Redo className="h-4 w-4" />
                            Redo
                        </Button>
                        <div className="h-4 border-l border-gray-300 mx-2" />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addColumn}
                            disabled={updateMutation.isPending}
                            className="flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Add Column
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addRow}
                            disabled={updateMutation.isPending}
                            className="flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Add Row
                        </Button>
                    </div>
                </div>
            )}

            {/* Live Sync Badge */}
            {isLiveSyncSheet && (
                <div className="flex justify-center p-2 border-b bg-blue-50 dark:bg-blue-950/50">
                    <Badge
                        variant="secondary"
                        className="flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                        <Activity className="h-3 w-3" />
                        Live Sync Active
                    </Badge>
                </div>
            )}

            {/* Live sync notification */}
            {isLiveSyncSheet && (
                <Card className="mx-4 mt-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                    <CardContent className="flex items-start gap-3 p-4">
                        <div className="flex-shrink-0 mt-0.5">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                                <Info className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                    Live Sync Active
                                </h4>
                                <Badge
                                    variant="outline"
                                    className="text-xs border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                                >
                                    <Shield className="h-3 w-3 mr-1" />
                                    Protected
                                </Badge>
                            </div>
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                The first {formDataColumnCount} columns contain
                                form submission data and are protected from
                                editing. You can add and edit additional columns
                                for your notes and analysis.
                            </p>
                            <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                                Last synced:{' '}
                                {syncMetadata?.lastSyncAt
                                    ? new Date(
                                          syncMetadata.lastSyncAt
                                      ).toLocaleString()
                                    : 'Unknown'}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex-1 min-h-0 p-4">
                <div className="rg-container dark:bg-background dark:text-foreground rounded-lg border">
                    <ReactGrid
                        rows={sheet.rows}
                        columns={columns}
                        minRowHeight={35}
                        onCellsChanged={readOnly ? undefined : onCellsChanged}
                        onContextMenu={readOnly ? undefined : handleContextMenu}
                        enableRowSelection={!readOnly}
                        enableColumnSelection={!readOnly}
                    />
                </div>
            </div>

            {/* Rename Column / Row dialog */}
            {renameState && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setRenameState(null)
                    }}
                >
                    <div className="bg-background border rounded-lg shadow-lg p-4 w-72">
                        <h3 className="text-sm font-medium mb-3">
                            Rename {renameState.label}
                        </h3>
                        <input
                            ref={renameInputRef}
                            type="text"
                            value={renameInputValue}
                            onChange={(e) => setRenameInputValue(e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm mb-3 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') applyRename(renameInputValue)
                                if (e.key === 'Escape') setRenameState(null)
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRenameState(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => applyRename(renameInputValue)}
                            >
                                Rename
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

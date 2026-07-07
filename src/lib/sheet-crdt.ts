// Cell-level CRDT model for spreadsheets, backed by Yjs.
//
// A sheet is represented as:
//   - cells:    Y.Map<string>  keyed by `${rowId}::${col}` -> JSON of the cell.
//               This is the merge granularity: two people editing different
//               cells touch different keys, so both survive.
//   - rowOrder: Y.Array<string> of rowIds, giving row order + existence.
//   - meta:     Y.Map          `colCount` (number) and `h:${rowId}` (row height).
//
// The same helper (applySheetToCrdt) both seeds an empty doc and publishes
// incremental edits — it only writes keys whose value actually changed.

import * as Y from 'yjs'
import { type DefaultCellTypes, type Row } from '@silevis/reactgrid'
import { type SheetData } from './sheet-utils'

const CELLS_KEY = 'sheetCells'
const ROW_ORDER_KEY = 'sheetRowOrder'
const META_KEY = 'sheetMeta'
const COL_COUNT = 'colCount'

export function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]!)
    }
    return window.btoa(binary)
}

export function base64ToBytes(value: string) {
    const binary = window.atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes
}

function parts(doc: Y.Doc) {
    return {
        cells: doc.getMap<string>(CELLS_KEY),
        rowOrder: doc.getArray<string>(ROW_ORDER_KEY),
        meta: doc.getMap(META_KEY),
    }
}

function cellKey(rowId: string, col: number) {
    return `${rowId}::${col}`
}

/** True until the sheet has been seeded (no rows yet). */
export function isSheetCrdtEmpty(doc: Y.Doc): boolean {
    return doc.getArray<string>(ROW_ORDER_KEY).length === 0
}

/** Reconstruct a full SheetData from the CRDT. */
export function crdtToSheet(doc: Y.Doc): SheetData {
    const { cells, rowOrder, meta } = parts(doc)
    const colCount = Number(meta.get(COL_COUNT) ?? 0)

    const rows: Row[] = rowOrder.toArray().map((rowId) => {
        const rowCells: DefaultCellTypes[] = []
        for (let col = 0; col < colCount; col += 1) {
            const raw = cells.get(cellKey(rowId, col))
            rowCells.push(
                raw
                    ? (JSON.parse(raw) as DefaultCellTypes)
                    : ({ type: 'text', text: '' } as DefaultCellTypes)
            )
        }
        return {
            rowId,
            height: Number(meta.get(`h:${rowId}`) ?? 35),
            cells: rowCells,
        }
    })

    return { rows, cells: rows.map((row) => row.cells) }
}

/**
 * Write a SheetData into the CRDT inside one transaction, touching only keys
 * whose value actually changed. Used both to seed an empty doc (everything is
 * "changed") and to publish incremental local edits (only the edited cells).
 * Skipping unchanged keys also stops remote-applied cells from echoing back.
 */
export function applySheetToCrdt(
    doc: Y.Doc,
    sheet: SheetData,
    origin: unknown
) {
    const { cells, rowOrder, meta } = parts(doc)

    doc.transact(() => {
        const colCount = sheet.rows[0]?.cells.length ?? 0
        if (Number(meta.get(COL_COUNT) ?? -1) !== colCount) {
            meta.set(COL_COUNT, colCount)
        }

        const newRowIds = sheet.rows.map((row) => String(row.rowId))
        const currentRowIds = rowOrder.toArray()
        const rowOrderChanged =
            newRowIds.length !== currentRowIds.length ||
            newRowIds.some((id, index) => id !== currentRowIds[index])
        if (rowOrderChanged) {
            rowOrder.delete(0, rowOrder.length)
            rowOrder.push(newRowIds)
        }

        for (const row of sheet.rows) {
            const heightKey = `h:${row.rowId}`
            const height = row.height ?? 35
            if (Number(meta.get(heightKey) ?? -1) !== height) {
                meta.set(heightKey, height)
            }
            row.cells.forEach((cell, col) => {
                const key = cellKey(String(row.rowId), col)
                const json = JSON.stringify(cell)
                if (cells.get(key) !== json) {
                    cells.set(key, json)
                }
            })
        }
    }, origin)
}

'use client'

import { saveBlob } from './save-blob'

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Row ids used by sheet-utils for the column-letter header rows. These are
// presentation gutters, not real data, so they are dropped on export.
const LETTER_HEADER_ROW_IDS = new Set(['header', 'alphabetical-header'])

type AoaCell = string | number
type AoaRow = AoaCell[]

// Converts the stored sheet JSON ({ rows, cells }) produced by the ReactGrid
// editor into a clean 2D array: the leading row-number gutter column and the
// column-letter header row are removed, and trailing empty rows/columns are
// trimmed so we do not export a 50x26 grid of blanks.
function sheetJsonToAoa(serialized: string): AoaRow[] {
    let parsed: unknown
    try {
        parsed = JSON.parse(serialized)
    } catch {
        return [[]]
    }

    const rows: any[] = Array.isArray(parsed)
        ? parsed
        : ((parsed as any)?.rows ?? [])

    if (!Array.isArray(rows) || rows.length === 0) return [[]]

    const aoa: AoaRow[] = []
    for (const row of rows) {
        const rowId = String(row?.rowId ?? '')
        if (LETTER_HEADER_ROW_IDS.has(rowId)) continue

        const cells: any[] = Array.isArray(row?.cells) ? row.cells : []
        // Drop the first cell (row-number / corner gutter).
        const values = cells
            .slice(1)
            .map((cell) => (cell?.text ?? '').toString())
        aoa.push(values)
    }

    return trimEmpty(aoa)
}

// Removes fully-empty trailing rows and columns.
function trimEmpty(aoa: AoaRow[]): AoaRow[] {
    let lastRow = -1
    let lastCol = -1
    aoa.forEach((row, r) => {
        row.forEach((value, c) => {
            if (value !== '' && value != null) {
                if (r > lastRow) lastRow = r
                if (c > lastCol) lastCol = c
            }
        })
    })

    if (lastRow === -1) return [[]]

    return aoa
        .slice(0, lastRow + 1)
        .map((row) => row.slice(0, lastCol + 1))
}

/**
 * Exports a stored sheet (serialized ReactGrid JSON) to .xlsx or .csv and
 * triggers a download. Both formats open in Excel/OneDrive and Google Sheets.
 */
export async function exportSheet(
    serializedSheet: string,
    fileName: string,
    format: 'xlsx' | 'csv'
) {
    // xlsx is a CommonJS module; depending on interop it may surface under
    // `.default`. Normalize so `.utils`/`.write` are always reachable.
    const xlsxModule: any = await import('xlsx')
    const XLSX = xlsxModule.default ?? xlsxModule

    const aoa = sheetJsonToAoa(serializedSheet)
    const worksheet = XLSX.utils.aoa_to_sheet(aoa)

    if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(worksheet)
        saveBlob(
            new Blob([csv], { type: 'text/csv;charset=utf-8' }),
            fileName
        )
        return
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    const output = XLSX.write(workbook, {
        type: 'array',
        bookType: 'xlsx',
    }) as ArrayBuffer
    saveBlob(new Blob([output], { type: XLSX_MIME }), fileName)
}

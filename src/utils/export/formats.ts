// Central definition of the export formats offered by the "Download" menu and
// which formats are valid for each kind of file.
//
// Documents (pages) export to PDF (read-only) and Word (.docx, editable in both
// Microsoft Word/OneDrive and Google Docs). Sheets export to Excel (.xlsx) and
// CSV. Forms are not wired up yet (their content is not loaded into the header).

export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'csv'

// The file types that currently support exporting from the file header.
export type ExportableFileType = 'page' | 'sheet' | 'form'

export interface ExportFormatMeta {
    format: ExportFormat
    /** Label shown in the dropdown menu item. */
    label: string
    /** File extension (without the dot) used for the download filename. */
    extension: string
    /** Optional secondary line explaining where the file can be used. */
    hint?: string
}

export const EXPORT_FORMAT_META: Record<ExportFormat, ExportFormatMeta> = {
    pdf: {
        format: 'pdf',
        label: 'PDF document',
        extension: 'pdf',
        hint: 'Best for sharing and printing',
    },
    docx: {
        format: 'docx',
        label: 'Word document (.docx)',
        extension: 'docx',
        hint: 'Edit in Word, OneDrive or Google Docs',
    },
    xlsx: {
        format: 'xlsx',
        label: 'Excel spreadsheet (.xlsx)',
        extension: 'xlsx',
        hint: 'Edit in Excel, OneDrive or Google Sheets',
    },
    csv: {
        format: 'csv',
        label: 'CSV (.csv)',
        extension: 'csv',
        hint: 'Plain data for any spreadsheet tool',
    },
}

// Which formats each file type may be exported to, in menu order.
export const FILE_TYPE_EXPORT_FORMATS: Record<
    ExportableFileType,
    ExportFormat[]
> = {
    page: ['pdf', 'docx'],
    sheet: ['xlsx', 'csv'],
    form: ['pdf'],
}

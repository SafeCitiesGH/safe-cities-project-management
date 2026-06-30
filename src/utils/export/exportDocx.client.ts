'use client'

import { saveBlob } from './save-blob'

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Lazily loaded browser build of html-docx-js. The package `main` is a Node
// build that needs Buffer; the `dist` build targets the browser and returns a
// Blob from asBlob(). We import it dynamically so it never ships in the initial
// bundle (mirrors how pdfExport loads html2pdf on demand).
let asBlobFn: ((html: string) => Blob | ArrayBuffer) | null = null

async function getAsBlob() {
    if (!asBlobFn) {
        const mod: any = await import('html-docx-js/dist/html-docx')
        asBlobFn = (mod.asBlob ?? mod.default?.asBlob) as typeof asBlobFn
    }
    return asBlobFn!
}

// Minimal print styling. Word and Google Docs ignore most CSS, but borders and
// a readable body font carry over and keep tables legible.
const DOCX_WRAPPER_STYLES = `
    body { font-family: 'DM Sans', Arial, sans-serif; font-size: 11pt; color: #111; }
    h1, h2, h3, h4 { font-family: 'DM Sans', Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
    img { max-width: 100%; height: auto; }
`

/**
 * Converts an HTML string (TipTap document output) into a .docx file and
 * triggers a download. The resulting file opens and remains editable in
 * Microsoft Word / OneDrive and imports cleanly into Google Docs.
 */
export async function exportHtmlToDocx(htmlString: string, fileName: string) {
    const asBlob = await getAsBlob()

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${DOCX_WRAPPER_STYLES}</style></head><body>${htmlString}</body></html>`

    const converted = asBlob(fullHtml)
    const blob =
        converted instanceof Blob
            ? converted
            : new Blob([converted], { type: DOCX_MIME })

    saveBlob(blob, fileName)
}

'use client'

import { saveBlob } from './save-blob'

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Word and Google Docs can't fetch app-relative image URLs from inside a .docx,
// so every <img> is inlined as a base64 data URL before conversion.
async function inlineImages(html: string): Promise<string> {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const images = Array.from(doc.querySelectorAll('img'))

    await Promise.all(
        images.map(async (img) => {
            const src = img.getAttribute('src')
            if (!src || src.startsWith('data:')) return
            try {
                const blob = await fetch(src).then((res) => res.blob())
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = reject
                    reader.readAsDataURL(blob)
                })
                img.setAttribute('src', dataUrl)
            } catch {
                // An unreachable image would corrupt the document — drop it.
                img.remove()
            }
        })
    )

    return doc.body.innerHTML
}

/**
 * Converts an HTML string (TipTap document output) into a real OOXML .docx and
 * triggers a download. Unlike the previous MHT-based converter, this output
 * opens correctly in Google Docs/Drive as well as Microsoft Word.
 */
export async function exportHtmlToDocx(htmlString: string, fileName: string) {
    const { default: HTMLtoDOCX } = await import('@turbodocx/html-to-docx')

    const body = await inlineImages(htmlString)
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`

    const converted = await HTMLtoDOCX(fullHtml, null, {
        orientation: 'portrait',
        title: fileName.replace(/\.docx$/i, ''),
        font: 'Arial',
        fontSize: 22, // half-points → 11pt
    })

    const blob =
        converted instanceof Blob
            ? converted
            : new Blob([converted as ArrayBuffer], { type: DOCX_MIME })

    saveBlob(blob, fileName)
}

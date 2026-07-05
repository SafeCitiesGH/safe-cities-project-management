'use client'

// Dynamically import html2pdf only on the client side
let html2pdf: any = null

async function initHtml2Pdf() {
    if (!html2pdf) {
        const module = await import('html2pdf.js')
        html2pdf = module.default
    }
    return html2pdf
}

// A4 portrait printable width with 10mm margins: 190mm ≈ 718px at 96dpi.
const PAGE_CONTENT_WIDTH_PX = 718

export async function downloadFile(htmlString: string, fileName: string) {
    const html2pdfInstance = await initHtml2Pdf()

    // Scope the stylesheet's global html/body rules to the export container so
    // they can't restyle the live app while it's attached.
    const pdfExportCss = await fetch('/styles/pdf-export.css').then((res) =>
        res
            .text()
            .then((css) => css.replace(/html,\s*body/g, '.pdf-export-root'))
    )

    // Render into a real element sized exactly to the printable width, hidden
    // inside a zero-height wrapper. The wrapper does the hiding because
    // html2pdf clones the target element WITH its inline styles — off-screen
    // positioning on the element itself survives the clone and yields a blank
    // capture, while the (uncloned) parent wrapper hides it safely.
    const wrapper = document.createElement('div')
    wrapper.style.cssText = `position: fixed; left: 0; top: 0; width: ${PAGE_CONTENT_WIDTH_PX}px; height: 0; overflow: hidden;`
    const container = document.createElement('div')
    container.className = 'pdf-export-root'
    container.style.cssText = `width: ${PAGE_CONTENT_WIDTH_PX}px; background: #fff; color: #333;`
    container.innerHTML = `
        <style>
            ${pdfExportCss}
            .prose {
                width: 100%;
                max-width: none;
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: 'DM Sans', sans-serif;
            }
        </style>
        <div class="prose">${htmlString}</div>
    `
    wrapper.appendChild(container)
    document.body.appendChild(wrapper)

    const opt = {
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            width: PAGE_CONTENT_WIDTH_PX,
            windowWidth: PAGE_CONTENT_WIDTH_PX,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }

    try {
        await html2pdfInstance().set(opt).from(container).save()
    } finally {
        wrapper.remove()
    }
}

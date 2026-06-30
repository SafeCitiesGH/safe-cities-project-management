// html-docx-js ships no type declarations. We only use the browser `dist`
// build, which exposes asBlob() and returns a Blob in the browser.
declare module 'html-docx-js/dist/html-docx' {
    export function asBlob(
        html: string,
        options?: {
            orientation?: 'portrait' | 'landscape'
            margins?: Record<string, number>
        }
    ): Blob | ArrayBuffer

    const _default: {
        asBlob: typeof asBlob
    }
    export default _default
}

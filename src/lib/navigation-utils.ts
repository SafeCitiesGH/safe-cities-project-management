import { type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { FILE_TYPES, type FileType } from '~/server/db/schema'

/**
 * Navigate to the appropriate route based on file type
 */
export function navigateToFile(
    router: AppRouterInstance,
    fileId: number,
    fileType: FileType
) {
    switch (fileType) {
        case FILE_TYPES.PAGE:
            router.push(`/pages/${fileId}`)
            break
        case FILE_TYPES.SHEET:
            router.push(`/sheets/${fileId}`)
            break
        case FILE_TYPES.FORM:
            router.push(`/forms/${fileId}`)
            break
        case FILE_TYPES.UPLOAD:
            router.push(`/uploads/${fileId}`)
            break
        case FILE_TYPES.PROGRAMME:
            router.push(`/programs/${fileId}`)
            break
        // Folders don't have dedicated pages
        case FILE_TYPES.FOLDER:
        default:
            break
    }
}

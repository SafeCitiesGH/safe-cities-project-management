'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '~/trpc/react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '~/components/ui/button'
import { Download, File as FileIcon } from 'lucide-react'
import { SidebarTrigger } from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import { FileUnlockDialog } from '~/components/file-unlock-dialog'

export default function UploadPage() {
    const isMobile = useMobile()
    const { uploadId } = useParams<{ uploadId: string }>()
    const idNum = Number(uploadId)
    // Password supplied via the unlock dialog for protected files (Feature 2)
    const [filePassword, setFilePassword] = useState<string | undefined>(
        undefined
    )
    const {
        data: file,
        isLoading,
        error,
    } = api.files.getById.useQuery(
        {
            id: idNum,
            expectedType: 'upload',
            password: filePassword,
        },
        {
            enabled: !!idNum,
            retry: (failureCount, error) => {
                // Don't retry on permission, type, or password errors
                if (
                    error?.data?.code === 'FORBIDDEN' ||
                    error?.data?.code === 'BAD_REQUEST' ||
                    error?.data?.code === 'UNAUTHORIZED' ||
                    error?.data?.code === 'TOO_MANY_REQUESTS'
                ) {
                    return false
                }
                return failureCount < 3
            },
        }
    )

    const needsPassword =
        error?.data?.code === 'UNAUTHORIZED' &&
        (error.message === 'PASSWORD_REQUIRED' ||
            error.message === 'PASSWORD_INCORRECT')
    const [fileUrl, setFileUrl] = useState<string | null>(null)

    useEffect(() => {
        if (file?.path) {
            const supabase = createClientComponentClient()
            const { data } = supabase.storage
                .from('files')
                .getPublicUrl(file.path)
            console.log(data)
            setFileUrl(data?.publicUrl || null)
        }
    }, [file?.path])

    if (isLoading) return <div className="p-8 text-center">Loading...</div>

    if (needsPassword) {
        return (
            <FileUnlockDialog
                fileId={idNum}
                onUnlocked={(pw) => setFilePassword(pw)}
            />
        )
    }

    if (error) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                    <div className="text-center max-w-md">
                        <div className="mb-4">
                            {error.data?.code === 'FORBIDDEN' ? (
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900">
                                    <svg
                                        className="w-8 h-8 text-red-600 dark:text-red-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-7V9m0 0V7m0 2h2M12 9H9m3-7a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </div>
                            ) : error.data?.code === 'BAD_REQUEST' ? (
                                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-yellow-900">
                                    <svg
                                        className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                                        />
                                    </svg>
                                </div>
                            ) : (
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-800">
                                    <svg
                                        className="w-8 h-8 text-gray-600 dark:text-gray-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <h2 className="text-xl font-bold mb-2">
                            {error.data?.code === 'FORBIDDEN'
                                ? 'Access Denied'
                                : error.data?.code === 'BAD_REQUEST'
                                  ? 'Invalid File Type'
                                  : error.data?.code === 'NOT_FOUND'
                                    ? 'File Not Found'
                                    : 'Error Loading File'}
                        </h2>
                        <p className="text-muted-foreground mb-4">
                            {error.data?.code === 'FORBIDDEN'
                                ? 'You do not have permission to access this file.'
                                : error.data?.code === 'BAD_REQUEST'
                                  ? 'This file is not an upload or has an invalid format.'
                                  : error.data?.code === 'NOT_FOUND'
                                    ? 'The file you are looking for does not exist.'
                                    : error.message}
                        </p>
                        <button
                            onClick={() => window.history.back()}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        )
    }
    if (!file)
        return (
            <div className="p-8 text-center text-muted-foreground">
                File not found here
            </div>
        )

    const isImage = file.mimetype && file.mimetype.startsWith('image/')

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <div className="mb-6 text-2xl font-bold flex items-center gap-2">
                {isMobile && <SidebarTrigger />}
                <FileIcon className="w-6 h-6" />
                {file.name}
                <div className="mt-4 text-sm text-muted-foreground">
                    File Type: {file.mimetype}
                </div>
            </div>
            <div className="mb-4">
                {isImage && fileUrl ? (
                    <img
                        src={fileUrl}
                        alt={file.name}
                        className="max-w-full max-h-[400px] rounded shadow"
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        <FileIcon className="w-12 h-12 text-muted-foreground" />
                        <span className="text-lg">{file.name}</span>
                    </div>
                )}
            </div>
            {fileUrl && (
                <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={file.name}
                >
                    <Button>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </Button>
                </a>
            )}
        </div>
    )
}

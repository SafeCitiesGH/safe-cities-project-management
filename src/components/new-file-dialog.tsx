'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
    FileText,
    Sheet,
    ClipboardList,
    Folder,
    Folders,
    Plus,
    ChevronDown,
    UploadCloud,
    AlertTriangle,
    Lock,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { Card, CardContent } from '~/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select'
import { FILE_TYPES, type FileType } from '~/server/db/schema'
import { FileTreeSelector } from '~/components/file-tree-selector'
import { api } from '~/trpc/react'
import { navigateToFile } from '~/lib/navigation-utils'
import { ultraFastFileCreationInvalidation } from '~/lib/streamlined-cache-invalidation'
import { uploadFileToSupabase } from '~/components/supabase-utils/uploadFile'
import { useBatchPermissions } from '~/hooks/use-batch-permissions'

export type NewFileType =
    | 'page'
    | 'sheet'
    | 'form'
    | 'folder'
    | 'programme'
    | 'upload'

interface NewFileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    fileType?: NewFileType
    onCreateFile?: (data: {
        name: string
        type: FileType
        parentId?: number
    }) => void
    defaultName?: string
    parentId?: number | null
}

export function NewFileDialog({
    open,
    onOpenChange,
    fileType,
    onCreateFile,
    defaultName = '',
    parentId,
}: NewFileDialogProps) {
    const router = useRouter()
    const [selectedType, setSelectedType] = useState<NewFileType>(
        fileType || 'page'
    )
    const [fileName, setFileName] = useState(defaultName)
    const [selectedParentId, setSelectedParentId] = useState<number | null>(
        parentId ?? null
    )
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    // Password protection (Feature 2)
    const [passwordProtect, setPasswordProtect] = useState(false)
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const MIN_PASSWORD_LENGTH = 4
    const passwordsMatch = password === confirmPassword
    const passwordValid =
        !passwordProtect ||
        (password.length >= MIN_PASSWORD_LENGTH && passwordsMatch)
    const { data: fileTree = [], isLoading: isLoadingFileTree } =
        api.files.getFilteredFileTree.useQuery()
    const utils = api.useUtils()

    // Get batch permissions for all files in the tree
    const { getPermissions } = useBatchPermissions(fileTree)

    // Count files where user has edit permissions
    const editableFilesCount = useMemo(() => {
        const countEditableFiles = (files: typeof fileTree): number => {
            let count = 0
            for (const file of files) {
                const permissions = getPermissions(file.id)
                if (permissions.canEdit) {
                    count++
                }
                if (file.children) {
                    count += countEditableFiles(file.children)
                }
            }
            return count
        }
        return countEditableFiles(fileTree)
    }, [fileTree, getPermissions])

    // Get user profile to check permissions
    const { data: userProfile } = api.user.getProfile.useQuery()

    // Check if user can create programmes (admin only)
    const canCreateProgramme =
        userProfile && 'role' in userProfile
            ? userProfile.role === 'admin'
            : false

    const createFileMutation = api.files.create.useMutation({
        onSuccess: async (data) => {
            onOpenChange(false)
            await ultraFastFileCreationInvalidation(utils)
            if (onCreateFile && data) {
                onCreateFile({
                    name: fileName,
                    type: data.type,
                    parentId: data.parentId ?? undefined,
                })
            }
            if (data?.id) {
                navigateToFile(router, data.id, data.type)
            }
            setFileName('')
            setSelectedParentId(null)
            setSelectedFile(null)
            setIsUploading(false)
            setPasswordProtect(false)
            setPassword('')
            setConfirmPassword('')
        },
    })

    useEffect(() => {
        if (open) {
            // Reset all form state when dialog opens
            setFileName(defaultName)
            setSelectedParentId(parentId ?? null)
            setSelectedFile(null)
            setIsUploading(false)
            setPasswordProtect(false)
            setPassword('')
            setConfirmPassword('')

            // Set file type only if provided and different from current
            if (fileType && fileType !== selectedType) {
                // Only allow programme type if user has permission
                if (fileType === 'programme' && !canCreateProgramme) {
                    setSelectedType('page') // Default to page if programme not allowed
                } else {
                    setSelectedType(fileType)
                }
            }
            // If current selected type is programme but user lost permission, reset to page
            else if (selectedType === 'programme' && !canCreateProgramme) {
                setSelectedType('page')
            }
        }
    }, [
        open,
        fileType,
        defaultName,
        parentId,
        selectedType,
        canCreateProgramme,
    ])

    const handleCreate = async () => {
        // Block submit if password protection is on but invalid
        if (!passwordValid) return
        // Containers (programmes/folders) are never password protected.
        const isContainerType =
            selectedType === 'programme' || selectedType === 'folder'
        const protectionPassword =
            passwordProtect && !isContainerType ? password : undefined

        if (selectedType === 'upload') {
            if (!selectedFile) return
            setIsUploading(true)
            try {
                const { path, publicUrl } =
                    await uploadFileToSupabase(selectedFile)
                createFileMutation.mutate({
                    name: selectedFile.name,
                    type: FILE_TYPES.UPLOAD,
                    parentId: selectedParentId ?? undefined,
                    path, // This is the Supabase storage path
                    mimetype: selectedFile.type,
                    password: protectionPassword,
                })
            } catch (err: any) {
                alert('Failed to upload file: ' + (err?.message || err))
                setIsUploading(false)
            }
            return
        }

        if (!fileName.trim()) return
        if (selectedType !== 'programme' && selectedParentId === null) return

        // Permission check: only admins can create programmes
        if (selectedType === 'programme' && !canCreateProgramme) {
            console.error('Unauthorized attempt to create programme')
            return
        }

        const typeMapping: Record<NewFileType, FileType> = {
            page: FILE_TYPES.PAGE,
            sheet: FILE_TYPES.SHEET,
            form: FILE_TYPES.FORM,
            upload: FILE_TYPES.UPLOAD,
            folder: FILE_TYPES.FOLDER,
            programme: FILE_TYPES.PROGRAMME,
        }

        createFileMutation.mutate({
            name: fileName,
            type: typeMapping[selectedType],
            parentId:
                selectedType === 'programme'
                    ? undefined
                    : (selectedParentId ?? undefined),
            password: protectionPassword,
        })
    }

    const getFileTypeConfig = (type: NewFileType) => {
        const configs = {
            page: {
                title: 'Page',
                description: 'Create a new document page',
                icon: FileText,
                placeholder: 'Enter page name',
            },
            sheet: {
                title: 'Sheet',
                description: 'Create a new spreadsheet',
                icon: Sheet,
                placeholder: 'Enter sheet name',
            },
            form: {
                title: 'Form',
                description: 'Create a new form for data collection',
                icon: ClipboardList,
                placeholder: 'Enter form name',
            },
            upload: {
                title: 'Upload',
                description: 'Upload a file from your computer',
                icon: UploadCloud,
                placeholder: 'Select file to upload',
            },
            folder: {
                title: 'Folder',
                description: 'Create a new folder to organize files',
                icon: Folder,
                placeholder: 'Enter folder name',
            },
            programme: {
                title: 'Programme',
                description: 'Create a new programme.',
                icon: Folder,
                placeholder: 'Enter programme name',
            },
        }
        return configs[type]
    }

    const config = getFileTypeConfig(selectedType)
    const IconComponent = config.icon

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {fileType
                            ? `Create New ${config.title}`
                            : 'Create New File'}
                    </DialogTitle>
                    <DialogDescription>
                        {fileType
                            ? config.description
                            : 'Choose the type of file you want to create'}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {!fileType && (
                        <div className="grid gap-2">
                            <Label htmlFor="file-type">File Type</Label>
                            <Select
                                value={selectedType}
                                onValueChange={(value) => {
                                    const newType = value as NewFileType

                                    // Prevent unnecessary state updates if type hasn't changed
                                    if (newType === selectedType) return

                                    // Prevent selecting programme if user doesn't have permission
                                    if (
                                        newType === 'programme' &&
                                        !canCreateProgramme
                                    ) {
                                        return
                                    }

                                    setSelectedType(newType)

                                    // Clear file-specific state when switching types
                                    if (newType !== 'upload') {
                                        setSelectedFile(null)
                                        // Don't clear fileName for non-upload types
                                    } else {
                                        // When switching TO upload, clear the fileName
                                        setFileName('')
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="page">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            Page
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="sheet">
                                        <div className="flex items-center gap-2">
                                            <Sheet className="h-4 w-4" />
                                            Sheet
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="form">
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="h-4 w-4" />
                                            Form
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="upload">
                                        <div className="flex items-center gap-2">
                                            <UploadCloud className="h-4 w-4" />
                                            Upload
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="folder">
                                        <div className="flex items-center gap-2">
                                            <Folder className="h-4 w-4" />
                                            Folder
                                        </div>
                                    </SelectItem>
                                    {canCreateProgramme && (
                                        <SelectItem value="programme">
                                            <div className="flex items-center gap-2">
                                                <Folders className="h-4 w-4 text-blue-600" />
                                                Programme
                                            </div>
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Name input for all except upload, file input for upload */}
                    {selectedType !== 'upload' ? (
                        <div className="grid gap-2">
                            <Label htmlFor="file-name">
                                {config.title} Name
                            </Label>
                            <div className="relative">
                                <Input
                                    id="file-name"
                                    value={fileName}
                                    onChange={(e) => {
                                        const value = e.target.value
                                        if (value.length <= 50) {
                                            setFileName(value)
                                        }
                                    }}
                                    placeholder={config.placeholder}
                                    className={
                                        fileName.length === 50
                                            ? 'border-red-500'
                                            : ''
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (
                                                selectedType === 'programme' ||
                                                selectedParentId !== null
                                            ) {
                                                handleCreate()
                                            }
                                        }
                                    }}
                                    disabled={createFileMutation.isPending}
                                />
                            </div>
                            {fileName.length === 50 && (
                                <p className="text-sm text-red-500 mt-1">
                                    Maximum character limit reached
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            <Label htmlFor="file-upload">File</Label>
                            <Input
                                id="file-upload"
                                type="file"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null
                                    setSelectedFile(file)
                                    if (file) {
                                        setFileName(file.name)
                                    }
                                }}
                                disabled={
                                    isUploading || createFileMutation.isPending
                                }
                            />
                            {selectedFile && (
                                <div className="text-sm text-muted-foreground">
                                    Selected: {selectedFile.name}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Only show parent selection for non-programme files when no parentId is provided */}
                    {selectedType !== 'programme' && parentId === null && (
                        <div className="grid gap-2">
                            <Label>Parent Location *</Label>
                            {isLoadingFileTree ? (
                                <div className="border rounded-md p-4 text-center text-muted-foreground">
                                    Loading file tree...
                                </div>
                            ) : editableFilesCount === 0 ? (
                                <div className="space-y-3">
                                    <div className="text-center text-muted-foreground">
                                        No folders or programmes available for
                                        editing
                                    </div>
                                    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                                <div className="text-sm">
                                                    <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                                                        No edit permissions
                                                        available
                                                    </p>
                                                    <p className="text-amber-700 dark:text-amber-300">
                                                        You need edit access to
                                                        at least one shared
                                                        folder or programme to
                                                        create new files. Please
                                                        contact an administrator
                                                        to request access or
                                                        have them create a
                                                        shared workspace for
                                                        you.
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            ) : (
                                <FileTreeSelector
                                    files={fileTree}
                                    selectedId={selectedParentId}
                                    onSelect={setSelectedParentId}
                                />
                            )}
                            <p className="text-xs text-muted-foreground">
                                Select a parent folder or programme for your new{' '}
                                {config.title.toLowerCase()}. Only folders and
                                programmes can contain other files.
                            </p>
                        </div>
                    )}
                    {selectedType === 'programme' && (
                        <div className="grid gap-2">
                            <p className="text-sm text-muted-foreground">
                                Programmes are created at the root level and can
                                contain folders and files.
                            </p>
                        </div>
                    )}

                    {/* Password protection (Feature 2). Only real files can be
                        password protected — not containers (programmes/folders). */}
                    {selectedType !== 'programme' &&
                        selectedType !== 'folder' && (
                            <div className="grid gap-3 rounded-md border p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Lock className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <Label htmlFor="password-protect">
                                                Password protect this file
                                            </Label>
                                            <p className="text-xs text-muted-foreground">
                                                You&apos;ll be asked for this
                                                password each time the file is
                                                opened.
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        id="password-protect"
                                        checked={passwordProtect}
                                        onCheckedChange={(checked) => {
                                            setPasswordProtect(checked)
                                            if (!checked) {
                                                setPassword('')
                                                setConfirmPassword('')
                                            }
                                        }}
                                        disabled={createFileMutation.isPending}
                                    />
                                </div>

                                {passwordProtect && (
                                    <div className="grid gap-2">
                                        <Input
                                            type="password"
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            placeholder="Enter password"
                                            autoComplete="new-password"
                                            disabled={
                                                createFileMutation.isPending
                                            }
                                        />
                                        <Input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) =>
                                                setConfirmPassword(
                                                    e.target.value
                                                )
                                            }
                                            placeholder="Confirm password"
                                            autoComplete="new-password"
                                            disabled={
                                                createFileMutation.isPending
                                            }
                                        />
                                        {password.length > 0 &&
                                            password.length <
                                                MIN_PASSWORD_LENGTH && (
                                                <p className="text-xs text-red-500">
                                                    Password must be at least{' '}
                                                    {MIN_PASSWORD_LENGTH}{' '}
                                                    characters.
                                                </p>
                                            )}
                                        {confirmPassword.length > 0 &&
                                            !passwordsMatch && (
                                                <p className="text-xs text-red-500">
                                                    Passwords do not match.
                                                </p>
                                            )}
                                    </div>
                                )}
                            </div>
                        )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isUploading || createFileMutation.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={
                            (selectedType === 'upload'
                                ? !selectedFile ||
                                  !selectedParentId ||
                                  isUploading
                                : !fileName.trim() ||
                                  (selectedType !== 'programme' &&
                                      (selectedParentId === null ||
                                          editableFilesCount === 0)) ||
                                  (selectedType === 'programme' &&
                                      !canCreateProgramme)) ||
                            !passwordValid ||
                            createFileMutation.isPending
                        }
                    >
                        {isUploading || createFileMutation.isPending
                            ? 'Uploading...'
                            : `Create ${config.title}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

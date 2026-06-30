'use client'

import { useState, useEffect } from 'react'
import { X, Search, Trash2, ChevronDown, Lock, Unlock } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { api } from '~/trpc/react'
import { smartInvalidatePermissionCaches, comprehensivePermissionInvalidation, invalidateFileTreePermissions } from '~/lib/streamlined-cache-invalidation'

type SharePermission = 'view' | 'edit' | 'comment'

interface SharedUser {
    id: string
    name: string
    email: string
    permission: SharePermission
    isLoading?: boolean
}

interface InheritedUser {
    id: string
    name: string
    email: string
    permission: SharePermission
    sourceFileName: string
}

interface ShareModalProps {
    isOpen: boolean
    onClose: () => void
    filename: string
    fileId: number
}

const permissionLabels = {
    view: 'Viewer',
    edit: 'Editor',
    comment: 'Commenter',
}

const permissionDescriptions = {
    view: 'Can view',
    edit: 'Can edit',
    comment: 'Can comment',
}

export function ShareModal({
    isOpen,
    onClose,
    filename,
    fileId,
}: ShareModalProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([])
    const [inheritedUsers, setInheritedUsers] = useState<InheritedUser[]>([])

    // Get all users from the database
    const { data: allUsers = [], isLoading } = api.user.getAllUsers.useQuery()

    // Get utils for cache invalidation
    const utils = api.useUtils()

    // Use tRPC query with proper caching for file permissions
    const { 
        data: permissionsData, 
        isLoading: isLoadingPermissions,
        refetch: refetchPermissions 
    } = api.permissions.getFilePermissionsWithInherited.useQuery(
        { fileId },
        { 
            enabled: isOpen && !!fileId,
            staleTime: 5 * 60 * 1000, // 5 minutes cache
            refetchOnWindowFocus: false,
        }
    )

    // Process permissions data when it changes
    useEffect(() => {
        if (!permissionsData) {
            setSharedUsers([])
            setInheritedUsers([])
            return
        }

        // Process direct permissions
        const directPermissions = permissionsData.directPermissions || []
        const users: SharedUser[] = directPermissions.map((fp: any) => ({
            id: fp.userId,
            name: fp.user?.name || fp.user?.email || 'Unknown User',
            email: fp.user?.email || '',
            permission: fp.permission as SharePermission,
            isLoading: false,
        }))
        setSharedUsers(users)

        // Process inherited permissions
        const inheritedPerms: InheritedUser[] = (
            permissionsData.inheritedPermissions || []
        ).map((perm: any) => ({
            id: perm.user.id,
            name: perm.user.name || perm.user.email || 'Unknown User',
            email: perm.user.email || '',
            permission: perm.permission,
            sourceFileName: perm.sourceFile?.name || 'Unknown',
        }))
        setInheritedUsers(inheritedPerms)
    }, [permissionsData])
    // tRPC mutations for permission management with optimized cache invalidation
    const setPermissionMutation = api.permissions.setPermission.useMutation({
        onSuccess: async () => {
            console.log(
                `✏️ Permission set for file ${fileId}, starting cache invalidation...`
            )

            // Instant UI feedback with targeted cache invalidation
            await Promise.all([
                utils.permissions.getFilePermissionsWithInherited.invalidate({ fileId }),
                utils.permissions.batchCheckPermissions.invalidate(),
                utils.files.getFilteredFileTree.invalidate(),
            ])
            
            // Trigger refetch to get fresh data
            refetchPermissions()
            
            console.log(`✅ Cache invalidation completed for file ${fileId}`)
        },
        onError: (error) => {
            console.error('Error setting permission:', error)
        },
    })

    const removePermissionMutation =
        api.permissions.removePermission.useMutation({
            onSuccess: async () => {
                console.log(
                    `🗑️ Permission removed for file ${fileId}, starting cache invalidation...`
                )

                // Instant UI feedback with targeted cache invalidation
                await Promise.all([
                    utils.permissions.getFilePermissionsWithInherited.invalidate({ fileId }),
                    utils.permissions.batchCheckPermissions.invalidate(),
                    utils.files.getFilteredFileTree.invalidate(),
                ])
                
                // Trigger refetch to get fresh data
                refetchPermissions()
                
                console.log(`✅ Cache invalidation completed for file ${fileId}`)
            },
            onError: (error) => {
                console.error('Error removing permission:', error)
            },
        })

    // --- Password protection management (owner / admin only) ---
    const [newPassword, setNewPassword] = useState('')
    const [pwMessage, setPwMessage] = useState<string | null>(null)
    const { data: passwordMeta, refetch: refetchPasswordMeta } =
        api.files.getPasswordMeta.useQuery(
            { fileId },
            { enabled: isOpen && !!fileId, refetchOnWindowFocus: false }
        )

    const updatePassword = api.files.updateFilePassword.useMutation({
        onSuccess: async (res) => {
            setNewPassword('')
            setPwMessage(
                res.isPasswordProtected
                    ? 'Password updated.'
                    : 'Password protection removed.'
            )
            await Promise.all([
                refetchPasswordMeta(),
                utils.files.getFilteredFileTree.invalidate(),
            ])
        },
        onError: (error) => {
            setPwMessage(error.message || 'Could not update the password.')
        },
    })

    const handleSetPassword = () => {
        if (newPassword.length < 4) {
            setPwMessage('Password must be at least 4 characters.')
            return
        }
        setPwMessage(null)
        updatePassword.mutate({ fileId, password: newPassword })
    }

    const handleRemovePassword = () => {
        setPwMessage(null)
        updatePassword.mutate({ fileId, password: null })
    }

    // Filter users based on search query
    const filteredUsers = allUsers.filter(
        (user) =>
            (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email
                    ?.toLowerCase()
                    .includes(searchQuery.toLowerCase())) &&
            !sharedUsers.some((sharedUser) => sharedUser.id === user.id)
    )

    const handleAddUser = async (user: (typeof allUsers)[0]) => {
        const newSharedUser: SharedUser = {
            id: user.id,
            name: user.name || user.email,
            email: user.email,
            permission: 'view',
            isLoading: true,
        }

        // Optimistically add user to UI
        setSharedUsers((prev) => [...prev, newSharedUser])
        setSearchQuery('')

        try {
            await setPermissionMutation.mutateAsync({
                fileId,
                userId: user.id,
                permission: 'view',
            })

            // Update user loading state
            setSharedUsers((prev) =>
                prev.map((u) =>
                    u.id === user.id ? { ...u, isLoading: false } : u
                )
            )
        } catch (error) {
            // Remove user from UI if mutation failed
            setSharedUsers((prev) => prev.filter((u) => u.id !== user.id))
            console.error('Failed to add user:', error)
        }
    }

    const handlePermissionChange = async (
        userId: string,
        permission: SharePermission
    ) => {
        // Set loading state for this user
        setSharedUsers((prev) =>
            prev.map((user) =>
                user.id === userId ? { ...user, isLoading: true } : user
            )
        )

        try {
            await setPermissionMutation.mutateAsync({
                fileId,
                userId,
                permission,
            })

            // Update permission and clear loading state
            setSharedUsers((prev) =>
                prev.map((user) =>
                    user.id === userId
                        ? { ...user, permission, isLoading: false }
                        : user
                )
            )
        } catch (error) {
            // Clear loading state on error
            setSharedUsers((prev) =>
                prev.map((user) =>
                    user.id === userId ? { ...user, isLoading: false } : user
                )
            )
            console.error('Failed to update permission:', error)
        }
    }

    const handleRemoveUser = async (userId: string) => {
        // Set loading state for this user
        setSharedUsers((prev) =>
            prev.map((user) =>
                user.id === userId ? { ...user, isLoading: true } : user
            )
        )

        try {
            await removePermissionMutation.mutateAsync({
                fileId,
                userId,
            })

            // Remove user from UI
            setSharedUsers((prev) => prev.filter((user) => user.id !== userId))
        } catch (error) {
            // Clear loading state on error
            setSharedUsers((prev) =>
                prev.map((user) =>
                    user.id === userId ? { ...user, isLoading: false } : user
                )
            )
            console.error('Failed to remove user:', error)
        }
    }

    const handleCopyLink = () => {
        // In a real implementation, this would copy the shareable link
        navigator.clipboard.writeText(window.location.href)
        // You could show a toast here
    }

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((word) => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        Share "{filename}"
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Add people section */}
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Add people"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        {/* Search results */}
                        {searchQuery && (
                            <div className="max-h-40 overflow-y-auto border rounded-md">
                                {isLoading ? (
                                    <div className="p-3 text-sm text-muted-foreground">
                                        Loading users...
                                    </div>
                                ) : filteredUsers.length > 0 ? (
                                    filteredUsers.map((user) => (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-3 hover:bg-muted cursor-pointer"
                                            onClick={() => handleAddUser(user)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="text-xs">
                                                        {getInitials(
                                                            user.name ||
                                                                user.email
                                                        )}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-sm font-medium">
                                                        {user.name ||
                                                            user.email}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {user.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-3 text-sm text-muted-foreground text-center">
                                        No users found. They may not have been
                                        added to Safe Cities yet.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Shared users list */}
                    {(sharedUsers.length > 0 || isLoadingPermissions) && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">
                                People with access
                            </h4>

                            {isLoadingPermissions ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <div className="animate-spin h-4 w-4 border-2 border-primary rounded-full border-t-transparent"></div>
                                        <span className="text-sm">
                                            Loading permissions...
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sharedUsers.map((user) => (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-2 rounded border"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="text-xs">
                                                        {getInitials(user.name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-sm font-medium">
                                                        {user.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {user.email}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {user.isLoading ? (
                                                    <div className="flex items-center justify-center h-8 w-16">
                                                        <div className="animate-spin h-4 w-4 border-2 border-primary rounded-full border-t-transparent"></div>
                                                    </div>
                                                ) : (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            asChild
                                                        >
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-2"
                                                                disabled={
                                                                    user.isLoading
                                                                }
                                                            >
                                                                {
                                                                    permissionLabels[
                                                                        user
                                                                            .permission
                                                                    ]
                                                                }
                                                                <ChevronDown className="h-3 w-3" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    handlePermissionChange(
                                                                        user.id,
                                                                        'view'
                                                                    )
                                                                }
                                                            >
                                                                <div>
                                                                    <div className="font-medium">
                                                                        Viewer
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        Can view
                                                                    </div>
                                                                </div>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    handlePermissionChange(
                                                                        user.id,
                                                                        'comment'
                                                                    )
                                                                }
                                                            >
                                                                <div>
                                                                    <div className="font-medium">
                                                                        Commenter
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        Can view
                                                                        and
                                                                        comment
                                                                    </div>
                                                                </div>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    handlePermissionChange(
                                                                        user.id,
                                                                        'edit'
                                                                    )
                                                                }
                                                            >
                                                                <div>
                                                                    <div className="font-medium">
                                                                        Editor
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        Can
                                                                        view,
                                                                        comment,
                                                                        and edit
                                                                    </div>
                                                                </div>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        handleRemoveUser(
                                                            user.id
                                                        )
                                                    }
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    disabled={user.isLoading}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Inherited permissions section */}
                    {inheritedUsers.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                    Inherited permissions
                                </h4>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            <div className="space-y-2">
                                {inheritedUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        className="flex items-center justify-between p-3 rounded-md border border-dashed border-muted-foreground/20 bg-muted/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="text-xs bg-muted/50 text-muted-foreground/70">
                                                    {getInitials(user.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="space-y-0.5">
                                                <div className="text-sm font-medium text-muted-foreground">
                                                    {user.name}
                                                </div>
                                                <div className="text-xs text-muted-foreground/60">
                                                    {user.email}
                                                </div>
                                                <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                                                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
                                                    Inherited from "
                                                    {user.sourceFileName}"
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs text-muted-foreground/80 px-2 py-1 bg-muted/60 rounded-md border border-muted-foreground/10">
                                                {
                                                    permissionLabels[
                                                        user.permission
                                                    ]
                                                }
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Information about inherited permissions */}
                            <div className="rounded-md border border-blue-200/60 bg-blue-50/50 p-3 dark:border-blue-800/30 dark:bg-blue-950/20">
                                <div className="flex items-start gap-2">
                                    <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                                        <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                                    </div>
                                    <div className="text-xs text-blue-800 dark:text-blue-200">
                                        <span className="font-medium">
                                            Note:
                                        </span>{' '}
                                        These users have access through
                                        inheritance from parent folders. These
                                        are minimum permissions and can be
                                        overridden by granting higher
                                        permissions directly.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Password protection (owner / admin only) */}
                    {passwordMeta?.canManage && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    {passwordMeta.isPasswordProtected ? (
                                        <Lock className="h-4 w-4" />
                                    ) : (
                                        <Unlock className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    Password protection
                                </h4>
                                <div className="h-px flex-1 bg-border" />
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {passwordMeta.isPasswordProtected
                                    ? 'This file is password protected. Set a new password below to replace the current one, or remove protection. There is no way to recover the old password — only replace it.'
                                    : 'Add a password to require it before non-admins can open this file.'}
                            </p>

                            <div className="flex items-center gap-2">
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => {
                                        setNewPassword(e.target.value)
                                        if (pwMessage) setPwMessage(null)
                                    }}
                                    placeholder={
                                        passwordMeta.isPasswordProtected
                                            ? 'New password'
                                            : 'Set a password'
                                    }
                                    autoComplete="new-password"
                                    disabled={updatePassword.isPending}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSetPassword()
                                    }}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSetPassword}
                                    disabled={
                                        !newPassword || updatePassword.isPending
                                    }
                                >
                                    {passwordMeta.isPasswordProtected
                                        ? 'Change'
                                        : 'Set'}
                                </Button>
                                {passwordMeta.isPasswordProtected && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleRemovePassword}
                                        disabled={updatePassword.isPending}
                                    >
                                        Remove
                                    </Button>
                                )}
                            </div>

                            {pwMessage && (
                                <p className="text-xs text-muted-foreground">
                                    {pwMessage}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

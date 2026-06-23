'use client'

import { useState } from 'react'
import { Search, Trash2, ChevronDown, Users } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { api } from '~/trpc/react'
import { toast } from '~/hooks/use-toast'

type ProgrammePermission = 'view' | 'comment' | 'edit'

interface ProgrammeMembersPanelProps {
    isOpen: boolean
    onClose: () => void
    programmeId: number
    programmeName: string
}

const permissionLabels: Record<ProgrammePermission, string> = {
    view: 'Viewer',
    comment: 'Commenter',
    edit: 'Editor',
}

const permissionDescriptions: Record<ProgrammePermission, string> = {
    view: 'Can view',
    comment: 'Can view and comment',
    edit: 'Can view, comment, and edit',
}

export function ProgrammeMembersPanel({
    isOpen,
    onClose,
    programmeId,
    programmeName,
}: ProgrammeMembersPanelProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [pendingLevel, setPendingLevel] = useState<ProgrammePermission>('view')

    const utils = api.useUtils()

    const { data: allUsers = [] } = api.user.getAllUsers.useQuery(undefined, {
        enabled: isOpen,
    })

    const {
        data: members = [],
        isLoading: isLoadingMembers,
        refetch: refetchMembers,
    } = api.permissions.getProgrammeMembers.useQuery(
        { programmeId },
        { enabled: isOpen && !!programmeId, refetchOnWindowFocus: false }
    )

    const invalidateAccess = async () => {
        await Promise.all([
            utils.permissions.getProgrammeMembers.invalidate({ programmeId }),
            utils.permissions.batchCheckPermissions.invalidate(),
            utils.files.getFilteredFileTree.invalidate(),
        ])
        refetchMembers()
    }

    const assignMutation = api.permissions.assignUserToProgramme.useMutation({
        onSuccess: invalidateAccess,
        onError: (error) =>
            toast({
                title: 'Could not assign user',
                description: error.message,
                variant: 'destructive',
            }),
    })

    const removeMutation = api.permissions.removeUserFromProgramme.useMutation({
        onSuccess: invalidateAccess,
        onError: (error) =>
            toast({
                title: 'Could not remove user',
                description: error.message,
                variant: 'destructive',
            }),
    })

    const memberIds = new Set(members.map((m) => m.userId))

    const filteredUsers = allUsers.filter(
        (user) =>
            !memberIds.has(user.id) &&
            (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const handleAssign = (userId: string) => {
        assignMutation.mutate({
            programmeId,
            userId,
            permission: pendingLevel,
        })
        setSearchQuery('')
    }

    const handleChangeLevel = (
        userId: string,
        permission: ProgrammePermission
    ) => {
        assignMutation.mutate({ programmeId, userId, permission })
    }

    const handleRemove = (userId: string) => {
        removeMutation.mutate({ programmeId, userId })
    }

    const getInitials = (name: string) =>
        name
            .split(' ')
            .map((word) => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Members of &quot;{programmeName}&quot;
                    </DialogTitle>
                    <DialogDescription>
                        Assign people to this programme. They&apos;ll be able to
                        see it and everything inside it.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Add a member */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Add a person"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    className="pl-10"
                                />
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1 whitespace-nowrap"
                                    >
                                        {permissionLabels[pendingLevel]}
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {(
                                        ['view', 'comment', 'edit'] as const
                                    ).map((level) => (
                                        <DropdownMenuItem
                                            key={level}
                                            onClick={() =>
                                                setPendingLevel(level)
                                            }
                                        >
                                            <div>
                                                <div className="font-medium">
                                                    {permissionLabels[level]}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {
                                                        permissionDescriptions[
                                                            level
                                                        ]
                                                    }
                                                </div>
                                            </div>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {searchQuery && (
                            <div className="max-h-40 overflow-y-auto border rounded-md">
                                {filteredUsers.length > 0 ? (
                                    filteredUsers.map((user) => (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-3 hover:bg-muted cursor-pointer"
                                            onClick={() => handleAssign(user.id)}
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
                                                        {user.name || user.email}
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
                                        No matching users.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Current members */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">
                            People with access
                        </h4>
                        {isLoadingMembers ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <div className="animate-spin h-4 w-4 border-2 border-primary rounded-full border-t-transparent mr-2" />
                                <span className="text-sm">Loading members…</span>
                            </div>
                        ) : members.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No one is assigned yet.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {members.map((member) => {
                                    const name =
                                        member.user?.name ||
                                        member.user?.email ||
                                        'Unknown user'
                                    return (
                                        <div
                                            key={member.userId}
                                            className="flex items-center justify-between p-2 rounded border"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="text-xs">
                                                        {getInitials(name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-sm font-medium">
                                                        {name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {member.user?.email}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="gap-2"
                                                        >
                                                            {
                                                                permissionLabels[
                                                                    member.permission as ProgrammePermission
                                                                ]
                                                            }
                                                            <ChevronDown className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {(
                                                            [
                                                                'view',
                                                                'comment',
                                                                'edit',
                                                            ] as const
                                                        ).map((level) => (
                                                            <DropdownMenuItem
                                                                key={level}
                                                                onClick={() =>
                                                                    handleChangeLevel(
                                                                        member.userId,
                                                                        level
                                                                    )
                                                                }
                                                            >
                                                                <div>
                                                                    <div className="font-medium">
                                                                        {
                                                                            permissionLabels[
                                                                                level
                                                                            ]
                                                                        }
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {
                                                                            permissionDescriptions[
                                                                                level
                                                                            ]
                                                                        }
                                                                    </div>
                                                                </div>
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        handleRemove(
                                                            member.userId
                                                        )
                                                    }
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

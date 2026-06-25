'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '~/trpc/react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/table'
import { Badge } from '~/components/ui/badge'
import {
    MoreHorizontal,
    Search,
    UserPlus,
    RefreshCw,
    Trash2,
} from 'lucide-react'
import { useToast } from '~/hooks/use-toast'
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import { ThemeToggle } from '~/components/tiptap-templates/simple/theme-toggle'

export default function UsersPage() {
    const { toast } = useToast()
    const router = useRouter()
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
    const [userToDelete, setUserToDelete] = useState<{
        name: string
        email: string
    } | null>(null)
    const isMobile = useMobile()
    const { state } = useSidebar();

    // Check user permission
    const { data: userProfile, isLoading: isProfileLoading } =
        api.user.getProfile.useQuery()

    useEffect(() => {
        if (
            !isProfileLoading &&
            userProfile &&
            'role' in userProfile &&
            userProfile.role !== 'admin'
        ) {
            toast({
                title: 'Access Denied',
                description: 'You do not have permission to access this page.',
                variant: 'destructive',
            })
            router.push('/dashboard')
        }
    }, [userProfile, isProfileLoading, router, toast])

    const {
        data: usersData = [],
        refetch: refetchUsers,
        isLoading: isUsersLoading,
    } = api.user.getAllUsers.useQuery(undefined, {
        enabled:
            userProfile &&
            'role' in userProfile &&
            userProfile.role === 'admin',
    })

    const updateUserRole = api.user.updateUserRole.useMutation({
        onSuccess: async () => {
            toast({
                title: 'Role updated',
                description:
                    'For the change to fully take effect, the user must refresh their page or sign out and back in.',
                duration: 8000,
            })
            await refetchUsers()
        },
        onError: (error) => {
            toast({
                title: 'Error',
                description: error.message || 'Failed to update user role',
                variant: 'destructive',
            })
        },
    })

    const deleteUser = api.user.deleteUser.useMutation({
        onSuccess: async (data) => {
            toast({
                title: 'Success',
                description: data?.message || 'User deleted successfully',
            })
            await refetchUsers()
            setDeleteUserId(null)
            setUserToDelete(null)
        },
        onError: (error) => {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete user',
                variant: 'destructive',
            })
            setDeleteUserId(null)
            setUserToDelete(null)
        },
    })

    // Show loading state while checking permissions
    if (isProfileLoading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </div>
        )
    }

    const handleDeleteUser = (user: any) => {
        setDeleteUserId(user.id)
        setUserToDelete({ name: user.name, email: user.email })
    }

    const confirmDeleteUser = () => {
        if (deleteUserId) {
            deleteUser.mutate({ userId: deleteUserId })
        }
    }

    // Filter users based on role
    const filteredUsers = usersData.filter((user) => {
        if (roleFilter === 'all') return true
        return user.role === roleFilter
    })

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    {(state === 'collapsed' || isMobile) && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                        <p className="text-muted-foreground mt-1">
                            Manage users and their permissions
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mb-6">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search users..." className="pl-10" />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => refetchUsers()}
                        disabled={isUsersLoading}
                    >
                        <RefreshCw
                            className={`h-4 w-4 ${isUsersLoading ? 'animate-spin' : ''}`}
                        />
                    </Button>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Filter by role" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="unverified">
                                Unverified
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>All Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage
                                                    src={user.imageUrl ?? undefined}
                                                    alt={user.name || user.email}
                                                />
                                                <AvatarFallback className="text-sm">
                                                    {(user.name || user.email || 'U')
                                                        .charAt(0)
                                                        .toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-medium">
                                                    {user.name}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {user.email}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                user.role === 'admin'
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                        >
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                >
                                                    <MoreHorizontal size={16} />
                                                    <span className="sr-only">
                                                        Open menu
                                                    </span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        updateUserRole.mutate({
                                                            id: user.id,
                                                            role: 'user',
                                                        })
                                                    }
                                                >
                                                    Make User
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        updateUserRole.mutate({
                                                            id: user.id,
                                                            role: 'admin',
                                                        })
                                                    }
                                                >
                                                    Make Admin
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() =>
                                                        handleDeleteUser(user)
                                                    }
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete User
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Delete User Confirmation Dialog */}
            <AlertDialog
                open={deleteUserId !== null}
                onOpenChange={(open) => !open && setDeleteUserId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            Delete User Account
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3">
                                <p>
                                    Are you sure you want to permanently delete
                                    the user account for{' '}
                                    <span className="font-semibold">
                                        {userToDelete?.name}
                                    </span>{' '}
                                    ({userToDelete?.email})?
                                </p>
                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <p className="text-sm font-medium text-destructive mb-2">
                                        This action will:
                                    </p>
                                    <ul className="text-sm text-destructive/80 space-y-1 ml-4">
                                        <li>
                                            • Delete their Clerk authentication
                                            account
                                        </li>
                                        <li>
                                            • Remove all their data from the
                                            database
                                        </li>
                                        <li>
                                            • Delete all files, permissions, and
                                            comments associated with this user
                                        </li>
                                        <li>
                                            • Remove them from all shared
                                            documents and projects
                                        </li>
                                    </ul>
                                    <p className="text-sm font-medium text-destructive mt-2">
                                        This action cannot be undone.
                                    </p>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteUser.isPending}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteUser}
                            disabled={deleteUser.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteUser.isPending ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete User
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

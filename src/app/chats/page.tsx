'use client'

import { api } from '~/trpc/react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog'
import { MessageSquare, Search, Plus, Hash } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import { Checkbox } from '~/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { useUser } from '@clerk/nextjs'

// A row in the chat list — either a file chat or a standalone conversation.
type ChatListItem = {
    key: string
    href: string
    name: string
    lastContent: string | null
    lastAt: Date | null
    isStandalone: boolean
}

export default function ChatsPage() {
    const router = useRouter()
    const utils = api.useUtils()

    const {
        data: recentChats = [],
        isLoading,
        error,
    } = api.chat.getRecentChats.useQuery()
    const { data: conversations = [] } = api.chat.getConversations.useQuery()
    const { data: allUsers = [] } = api.user.getAllUsers.useQuery()
    const { user: currentUser } = useUser()

    const [searchQuery, setSearchQuery] = useState('')
    const [isNewChatOpen, setIsNewChatOpen] = useState(false)
    const [newChatTitle, setNewChatTitle] = useState('')
    const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
        new Set()
    )

    const isMobile = useMobile()
    const { state } = useSidebar()

    // Everyone except the current user (the creator is always added on the server).
    const selectableUsers = allUsers.filter((u) => u.id !== currentUser?.id)

    const toggleMember = (id: string) => {
        setSelectedMemberIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const createConversation = api.chat.createConversation.useMutation({
        onSuccess: (conversation) => {
            setIsNewChatOpen(false)
            setNewChatTitle('')
            setSelectedMemberIds(new Set())
            void utils.chat.getConversations.invalidate()
            if (conversation) router.push(`/chats/${conversation.id}`)
        },
    })

    const handleCreate = () => {
        if (selectedMemberIds.size === 0 || createConversation.isPending) return
        // Fall back to a name built from the chosen people if none was typed.
        const derivedTitle = selectableUsers
            .filter((u) => selectedMemberIds.has(u.id))
            .map((u) => u.name || u.email)
            .join(', ')
        createConversation.mutate({
            title: newChatTitle.trim() || derivedTitle || 'New chat',
            memberIds: Array.from(selectedMemberIds),
        })
    }

    // Merge file chats + standalone conversations into one list.
    const items: ChatListItem[] = [
        ...(recentChats || []).map((chat) => ({
            key: `file-${chat?.file?.id}`,
            href: `/${chat?.file?.type}s/${chat?.file?.id}`,
            name: chat?.file?.name || 'Untitled',
            lastContent: chat?.lastMessage?.content ?? null,
            lastAt: chat?.lastMessage?.createdAt
                ? new Date(chat.lastMessage.createdAt)
                : null,
            isStandalone: false,
        })),
        ...(conversations || []).map((item) => ({
            key: `convo-${item.conversation.id}`,
            href: `/chats/${item.conversation.id}`,
            name: item.conversation.title,
            lastContent: item.lastMessage?.content ?? null,
            lastAt: item.lastMessage?.createdAt
                ? new Date(item.lastMessage.createdAt)
                : new Date(item.conversation.createdAt),
            isStandalone: true,
        })),
    ]

    const filteredItems = items.filter(
        (item) =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.lastContent ?? '')
                .toLowerCase()
                .includes(searchQuery.toLowerCase())
    )

    const sortedItems = filteredItems.sort(
        (a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0)
    )

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {(state === 'collapsed' || isMobile) && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Chats
                        </h1>
                        <p className="mt-1 text-muted-foreground">
                            Collaborate with your team in real-time
                        </p>
                    </div>
                </div>

                <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus size={16} />
                            New chat
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>New chat</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                            Pick who to include. Only the people you choose (and
                            you) can see and post in this chat.
                        </p>
                        <Input
                            placeholder="Chat name (optional)"
                            value={newChatTitle}
                            onChange={(e) => setNewChatTitle(e.target.value)}
                        />

                        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
                            {selectableUsers.length === 0 && (
                                <p className="p-3 text-sm text-muted-foreground">
                                    No other people to add yet.
                                </p>
                            )}
                            {selectableUsers.map((person) => (
                                <label
                                    key={person.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                                >
                                    <Checkbox
                                        checked={selectedMemberIds.has(
                                            person.id
                                        )}
                                        onCheckedChange={() =>
                                            toggleMember(person.id)
                                        }
                                    />
                                    <Avatar className="h-7 w-7">
                                        <AvatarImage
                                            src={person.imageUrl ?? undefined}
                                        />
                                        <AvatarFallback>
                                            {(person.name || person.email)?.[0]?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                            {person.name || person.email}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {person.email}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>

                        <DialogFooter>
                            <span className="mr-auto self-center text-xs text-muted-foreground">
                                {selectedMemberIds.size} selected
                            </span>
                            <Button
                                onClick={handleCreate}
                                disabled={
                                    selectedMemberIds.size === 0 ||
                                    createConversation.isPending
                                }
                            >
                                {createConversation.isPending
                                    ? 'Creating…'
                                    : 'Create chat'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search chats..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Recent Chats</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {error && (
                        <div className="p-4 text-center text-destructive">
                            Failed to load chats. Please try refreshing the
                            page.
                        </div>
                    )}
                    {isLoading && (
                        <div className="flex h-32 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        </div>
                    )}
                    {!isLoading && !error && (
                        <div className="divide-y">
                            {sortedItems.map((item) => (
                                <Link
                                    key={item.key}
                                    href={item.href}
                                    className="flex cursor-pointer items-center gap-4 p-4 hover:bg-muted/50"
                                >
                                    <div className="flex-shrink-0">
                                        {item.isStandalone ? (
                                            <Hash className="h-12 w-12 text-primary" />
                                        ) : (
                                            <MessageSquare className="h-12 w-12 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="truncate font-medium">
                                                {item.name}
                                            </h3>
                                            <span className="text-xs text-muted-foreground">
                                                {item.lastAt &&
                                                    formatDistanceToNow(
                                                        item.lastAt,
                                                        { addSuffix: true }
                                                    )}
                                            </span>
                                        </div>
                                        <p className="truncate text-sm text-muted-foreground">
                                            {item.lastContent ||
                                                'No messages yet'}
                                        </p>
                                    </div>
                                </Link>
                            ))}

                            {sortedItems.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                        <MessageSquare
                                            size={24}
                                            className="text-muted-foreground"
                                        />
                                    </div>
                                    <h3 className="mt-4 text-lg font-medium">
                                        {searchQuery
                                            ? 'No chats found'
                                            : 'No chats yet'}
                                    </h3>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {searchQuery
                                            ? `No chats match "${searchQuery}". Try a different search term.`
                                            : 'Start a chat on any file, or click “New chat” for a standalone one.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

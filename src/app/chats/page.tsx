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

    const [searchQuery, setSearchQuery] = useState('')
    const [isNewChatOpen, setIsNewChatOpen] = useState(false)
    const [newChatTitle, setNewChatTitle] = useState('')

    const isMobile = useMobile()
    const { state } = useSidebar()

    const createConversation = api.chat.createConversation.useMutation({
        onSuccess: (conversation) => {
            setIsNewChatOpen(false)
            setNewChatTitle('')
            void utils.chat.getConversations.invalidate()
            if (conversation) router.push(`/chats/${conversation.id}`)
        },
    })

    const handleCreate = () => {
        if (!newChatTitle.trim() || createConversation.isPending) return
        createConversation.mutate({ title: newChatTitle.trim() })
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
                            Start a standalone chat that isn&apos;t tied to any
                            file. Everyone in your workspace can join it.
                        </p>
                        <Input
                            autoFocus
                            placeholder="Chat name (e.g. General, Announcements)"
                            value={newChatTitle}
                            onChange={(e) => setNewChatTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreate()
                            }}
                        />
                        <DialogFooter>
                            <Button
                                onClick={handleCreate}
                                disabled={
                                    !newChatTitle.trim() ||
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

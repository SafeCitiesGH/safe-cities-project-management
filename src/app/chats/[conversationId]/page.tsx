'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '~/trpc/react'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Send, ArrowLeft } from 'lucide-react'

export default function ConversationPage() {
    const params = useParams()
    const conversationId = Number(params?.conversationId as string)

    const [newMessage, setNewMessage] = useState('')
    const [isSending, setIsSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const { data: conversation } = api.chat.getConversation.useQuery(
        { conversationId },
        { enabled: !!conversationId && !isNaN(conversationId) }
    )

    const { data: messages = [], refetch: refetchMessages } =
        api.chat.getConversationMessages.useQuery(
            { conversationId },
            { enabled: !!conversationId && !isNaN(conversationId) }
        )

    const { mutate: sendMessage } = api.chat.sendMessage.useMutation({
        onSuccess: () => {
            setNewMessage('')
            setIsSending(false)
            void refetchMessages()
        },
        onError: () => setIsSending(false),
    })

    const handleSendMessage = () => {
        if (!newMessage.trim() || !conversationId || isNaN(conversationId))
            return
        setIsSending(true)
        sendMessage({ conversationId, content: newMessage.trim() })
    }

    // Poll for new messages while the tab is visible.
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.hidden) return
            void refetchMessages()
        }, 10 * 1000)
        return () => clearInterval(interval)
    }, [refetchMessages])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    return (
        <div className="container mx-auto flex h-[calc(100vh-2rem)] max-w-3xl flex-col p-6">
            <div className="mb-4 flex items-center gap-3">
                <Link href="/chats">
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                        <ArrowLeft size={18} />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">
                        {conversation?.title ?? 'Chat'}
                    </h1>
                    <p className="max-w-md truncate text-sm text-muted-foreground">
                        {conversation?.members
                            ?.map((m) => m.name || m.email)
                            .join(', ') || 'Private chat'}
                    </p>
                </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
                {messages.map((message) => (
                    <div key={message.id} className="flex gap-3">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback>
                                {message.user?.email?.[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                            <div className="flex items-start justify-between">
                                <span className="font-medium">
                                    {message.user?.email}
                                </span>
                                <span className="min-w-max pt-1.5 text-right text-xs text-muted-foreground">
                                    {new Date(
                                        message.createdAt
                                    ).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-sm">{message.content}</p>
                        </div>
                    </div>
                ))}
                {messages.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        No messages yet. Say hello 👋
                    </p>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="mt-4 flex gap-2">
                <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1"
                    disabled={isSending}
                />
                <Button
                    onClick={handleSendMessage}
                    size="icon"
                    className="h-10 w-10"
                    disabled={isSending}
                >
                    <Send size={18} />
                </Button>
            </div>
        </div>
    )
}

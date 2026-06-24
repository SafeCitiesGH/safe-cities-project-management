'use client'

import Link from 'next/link'
import { Bell, CalendarDays, Home, MessageSquare, Users } from 'lucide-react'
import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '~/components/ui/sidebar'

interface NavigationMenuProps {
    currentPath: string
    userRole?: string
}

const navigationItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Home, adminOnly: false },
    {
        href: '/notifications',
        label: 'Notifications',
        icon: Bell,
        adminOnly: false,
    },
    { href: '/chats', label: 'Chats', icon: MessageSquare, adminOnly: false },
    {
        href: '/google-calendar',
        label: 'Calendar',
        icon: CalendarDays,
        adminOnly: false,
    },
    { href: '/users', label: 'Users', icon: Users, adminOnly: true },
]

export function NavigationMenu({ currentPath, userRole }: NavigationMenuProps) {
    const filteredItems = navigationItems.filter((item) => {
        if (item.adminOnly && userRole !== 'admin') {
            return false
        }
        return true
    })

    return (
        <SidebarGroup>
            <SidebarMenu>
                {filteredItems.map((item) => {
                    const Icon = item.icon
                    return (
                        <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                                asChild
                                isActive={currentPath === item.href}
                                tooltip={item.label}
                            >
                                <Link href={item.href}>
                                    <Icon size={18} />
                                    <span>{item.label}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    )
                })}
            </SidebarMenu>
        </SidebarGroup>
    )
}

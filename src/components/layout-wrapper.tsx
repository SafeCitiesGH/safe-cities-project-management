'use client'

import { usePathname } from 'next/navigation'
import { AppSidebar } from '~/components/app-sidebar'
import { ChatSidebar } from '~/components/chat-sidebar'

interface LayoutWrapperProps {
    children: React.ReactNode
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
    const pathname = usePathname()

    // Routes that should not show the sidebar
    const noSidebarRoutes = ['/onboarding']
    const shouldHideSidebar = noSidebarRoutes.some((route) =>
        pathname.startsWith(route)
    )

    if (shouldHideSidebar) {
        return (
            <div className="app-shell min-h-screen w-full">
                <main className="w-full">{children}</main>
            </div>
        )
    }

    return (
        <div className="app-shell flex min-h-screen w-full">
            <AppSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <main className="flex-1 overflow-auto px-3 pb-4 pt-3 md:px-5 md:pb-5 md:pt-4">
                    {children}
                </main>
            </div>
            <ChatSidebar />
        </div>
    )
}

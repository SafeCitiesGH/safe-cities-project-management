'use client'

import { usePathname } from 'next/navigation'
import { AppSidebar } from '~/components/app-sidebar'
import { ChatSidebar } from '~/components/chat-sidebar'
import { AwaitingApprovalScreen } from '~/components/awaiting-approval-screen'
import { api } from '~/trpc/react'

interface LayoutWrapperProps {
    children: React.ReactNode
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
    const pathname = usePathname()

    // Authoritative approval check: read the role from the DATABASE (not the
    // login session, which can be stale for deleted/demoted users). If the
    // signed-in person isn't an approved user/admin, show the approval screen
    // in place — no redirect, so it can't loop with the middleware gate.
    const { data: profile, isLoading: isProfileLoading } =
        api.user.getProfile.useQuery(undefined, { staleTime: 30_000 })

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

    // Only gate once the profile has actually loaded, so verified users don't
    // see a flash. "Not approved" = role is anything other than user/admin
    // (covers 'unverified' and the deleted-user "not found" case, which returns
    // no role field). On a query error we fall through to the app, since the
    // server still enforces every permission.
    const role =
        profile && 'role' in profile ? (profile.role ?? undefined) : undefined
    const isApproved = role === 'user' || role === 'admin'
    if (!isProfileLoading && profile && !isApproved) {
        return <AwaitingApprovalScreen />
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

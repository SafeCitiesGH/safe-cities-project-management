'use client'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { ProgramCard } from '~/components/program-card'
import { RecentActivityList } from '~/components/recent-activity-list'
import { FileText, FolderKanban, Plus, Users, Waves, Folders } from 'lucide-react'
import { api } from '~/trpc/react'
import { FILE_TYPES } from '~/server/db/schema'
import { useState } from 'react'
import { NewFileDialog } from '~/components/new-file-dialog'
import { formatDistanceToNow } from 'date-fns'
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'

export default function DashboardPage() {
    const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false)
    const isMobile = useMobile()
    const { state } = useSidebar()

    // Get current user profile to check permissions
    const { data: userProfile } = api.user.getProfile.useQuery()

    const isAdmin = userProfile?.role! === 'admin'

    const { data: users, isLoading: isLoadingUsers } =
        api.user.getAllUsers.useQuery(undefined, {
            enabled: isAdmin,
        })
    const { data: programData, isLoading: isLoadingPrograms } =
        api.files.getProgramsWithDetails.useQuery({
            type: FILE_TYPES.PROGRAMME,
        })
    const { data: pagesInLast30Days, isLoading: isLoadingPages } =
        api.files.getPagesCreatedInLast30Days.useQuery()

    const { programs, childCounts, updateTimes } = programData ?? {}

    const { data: notificationData, isLoading: isLoadingNotifications } =
        api.notification.getAll.useQuery({ limit: 5 })

    const statCards = [
        {
            title: 'Total Programs',
            value: programs?.length,
            loading: isLoadingPrograms,
            description: 'Active programs in your workspace',
            icon: FolderKanban,
            glow: 'from-primary/18 via-primary/8 to-transparent',
        },
        {
            title: 'Users',
            value: users?.length,
            loading: isLoadingUsers,
            description: 'Total team members',
            icon: Users,
            glow: 'from-accent/40 via-primary/10 to-transparent',
        },
        {
            title: 'Pages Created',
            value: pagesInLast30Days,
            loading: isLoadingPages,
            description: 'In the last 30 days',
            icon: FileText,
            glow: 'from-secondary/60 via-accent/20 to-transparent',
        },
    ]

    return (
        <div className="container mx-auto p-6">
            <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    {(state === 'collapsed' || isMobile) && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Dashboard
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Coordinate programmes and planning with the Safe Cities palette.
                        </p>
                    </div>
                </div>
                {isAdmin && (
                    <Button
                        className="gap-2 shadow-sm"
                        onClick={() => setIsNewFileDialogOpen(true)}
                    >
                        <Plus size={16} />
                        New Program
                    </Button>
                )}
            </div>

            <NewFileDialog
                open={isNewFileDialogOpen}
                onOpenChange={setIsNewFileDialogOpen}
                fileType={FILE_TYPES.PROGRAMME}
            />

            {isAdmin && (
                <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {statCards.map((card) => {
                        const Icon = card.icon
                        return (
                            <Card
                                key={card.title}
                                className="min-h-[190px] border-border/70 bg-card/90"
                            >
                                <CardHeader className="relative pb-3">
                                    <div
                                        className={`absolute inset-x-6 top-5 h-20 rounded-full bg-gradient-to-r ${card.glow} blur-2xl`}
                                    />
                                    <div className="relative flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/75">
                                                Workspace
                                            </p>
                                            <CardTitle className="mt-2 text-sm font-medium">
                                                {card.title}
                                            </CardTitle>
                                        </div>
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-background/70 shadow-sm">
                                            <Icon size={18} className="text-primary" />
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="relative flex h-full flex-col justify-between">
                                    <div className="flex items-end justify-between gap-4">
                                        <div className="text-4xl font-semibold tracking-tight">
                                            {card.loading ? (
                                                <div className="h-10 w-20 animate-pulse rounded-2xl bg-muted" />
                                            ) : (
                                                card.value
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                            <Waves size={12} className="text-primary" />
                                            Live
                                        </div>
                                    </div>
                                    <p className="mt-5 max-w-[16rem] text-sm leading-6 text-muted-foreground">
                                        {card.description}
                                    </p>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <div className="mb-8 grid gap-6 md:grid-cols-7">
                <div className="md:col-span-4">
                    <h2 className="text-xl font-semibold mb-4">Programs</h2>
                    {isLoadingPrograms ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        </div>
                    ) : programs?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[400px] text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                <Folders
                                    size={24}
                                    className="text-muted-foreground"
                                />
                            </div>
                            <h3 className="mt-4 text-lg font-medium">
                                No programs yet
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                                Create your first program to get started with
                                organizing your workspace.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {programs?.map((program) => (
                                <ProgramCard
                                    key={program.id}
                                    programId={program.id}
                                    title={program.name}
                                    description="No description available"
                                    items={childCounts?.[program.id] ?? 0}
                                    lastUpdated={
                                        updateTimes?.[program.id]
                                            ? formatDistanceToNow(
                                                  new Date(
                                                      updateTimes[program.id]!
                                                  ),
                                                  { addSuffix: true }
                                              )
                                            : 'Never'
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
                <div className="md:col-span-3">
                    <h2 className="text-xl font-semibold mb-4">
                        Recent Activity
                    </h2>
                    <Card className="border-border/70 bg-card/85">
                        <CardContent className="p-0">
                            <RecentActivityList
                                notifications={
                                    notificationData?.notifications ?? []
                                }
                                isLoading={isLoadingNotifications}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

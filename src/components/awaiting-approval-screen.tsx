'use client'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Separator } from '~/components/ui/separator'
import {
    CheckCircle,
    Clock,
    Mail,
    Shield,
    Building2,
    Users,
    LogOut,
} from 'lucide-react'
import { SignOutButton } from '@clerk/nextjs'

/**
 * Full-screen "your account isn't approved yet" gate. Shown both at the
 * /onboarding route (middleware fast-path) and inline by LayoutWrapper whenever
 * the database says the signed-in user is not yet an approved user/admin —
 * which reliably covers brand-new signups, demoted users, and deleted users
 * still holding an old session, regardless of their (stale) login token.
 */
export function AwaitingApprovalScreen() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
            <div className="w-full max-w-full sm:max-w-xl space-y-8">
                {/* Header */}
                <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                            <Building2 className="w-6 h-6 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Safe Cities
                        </h1>
                    </div>
                    <p className="text-muted-foreground">
                        Project Management Platform
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Status Card */}
                    <Card className="relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
                        <CardHeader className="relative">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-warning/10">
                                    <Clock className="w-5 h-5 text-warning" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">
                                        Awaiting Approval
                                    </CardTitle>
                                    <CardDescription>
                                        An administrator needs to approve your
                                        account before you can access the
                                        workspace
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="relative space-y-6">
                            <div className="space-y-4">
                                <Badge variant="secondary" className="gap-2">
                                    <Shield className="w-3 h-3" />
                                    Pending administrator approval
                                </Badge>

                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    To keep the workspace secure, every new
                                    account is approved by an administrator
                                    before it gains access. You&apos;ll be able
                                    to sign in normally once you&apos;ve been
                                    approved.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Process Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="w-5 h-5" />
                                What happens next
                            </CardTitle>
                            <CardDescription>
                                Approving your account
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 mt-0.5">
                                        <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium">
                                            Account created
                                        </h4>
                                        <p className="text-xs text-muted-foreground">
                                            Your account has been created and is
                                            waiting for approval
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 mt-0.5">
                                        <Clock className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium">
                                            Awaiting approval
                                        </h4>
                                        <p className="text-xs text-muted-foreground">
                                            An administrator will review and
                                            approve your account
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <h4 className="text-sm font-medium">
                                    Need help?
                                </h4>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    size="sm"
                                    onClick={() =>
                                        window.open('mailto:safecitiessa@aol.com')
                                    }
                                >
                                    <Mail className="w-4 h-4 mr-2" />
                                    Contact Support
                                </Button>
                                <SignOutButton>
                                    <Button
                                        variant="destructive"
                                        className="w-full hover:bg-destructive/90"
                                        size="sm"
                                    >
                                        <LogOut size={16} className="w-4 h-4 mr-2" />
                                        Sign Out
                                    </Button>
                                </SignOutButton>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

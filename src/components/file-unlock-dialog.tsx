'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

interface FileUnlockDialogProps {
    fileId: number
    /** Display name of the file, shown in the prompt. */
    fileName?: string
    /**
     * Called with the verified password once the user enters it correctly.
     * The parent should pass this password into its files.getById query so the
     * protected content loads.
     */
    onUnlocked: (password: string) => void
}

/**
 * Blocking prompt shown when a non-admin opens a password-protected file.
 * Because no unlock state is cached server-side, this appears on every open.
 */
export function FileUnlockDialog({
    fileId,
    fileName,
    onUnlocked,
}: FileUnlockDialogProps) {
    const router = useRouter()
    const [password, setPassword] = useState('')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    // Whether the "Forgot password?" recovery panel is showing.
    const [showForgot, setShowForgot] = useState(false)

    // Only look up who may reset the password once the user asks to recover it.
    const { data: passwordMeta, isLoading: isMetaLoading } =
        api.files.getPasswordMeta.useQuery(
            { fileId },
            { enabled: showForgot, refetchOnWindowFocus: false }
        )

    const verifyMutation = api.files.verifyFilePassword.useMutation({
        onSuccess: (result) => {
            if (result.ok) {
                onUnlocked(password)
            } else {
                setErrorMessage('Incorrect password. Please try again.')
            }
        },
        onError: (error) => {
            setErrorMessage(
                error.message === 'Too many attempts. Please wait a moment.'
                    ? error.message
                    : 'Could not verify the password. Please try again.'
            )
        },
    })

    // Owner/admin recovery: clears the password so the file opens, then lets
    // the parent reload it. The user can set a fresh password later via Share.
    const resetMutation = api.files.updateFilePassword.useMutation({
        onSuccess: () => {
            onUnlocked('')
        },
        onError: (error) => {
            setErrorMessage(
                error.message || 'Could not reset the password. Please try again.'
            )
        },
    })

    const handleSubmit = () => {
        if (!password) return
        setErrorMessage(null)
        verifyMutation.mutate({ fileId, password })
    }

    const isBusy = verifyMutation.isPending || resetMutation.isPending

    return (
        <Dialog open>
            <DialogContent
                // Prevent dismissing without unlocking or going back.
                // The [&>button]:hidden rule hides the built-in close (X) so the
                // prompt can only be resolved via Unlock or Go back.
                className="[&>button]:hidden"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        Password required
                    </DialogTitle>
                    <DialogDescription>
                        {fileName
                            ? `"${fileName}" is password protected. Enter the password to open it.`
                            : 'This file is password protected. Enter the password to open it.'}
                    </DialogDescription>
                </DialogHeader>

                {!showForgot ? (
                    <>
                        <div className="grid gap-2 py-2">
                            <Input
                                type="password"
                                autoFocus
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value)
                                    if (errorMessage) setErrorMessage(null)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSubmit()
                                }}
                                placeholder="Enter password"
                                autoComplete="off"
                                disabled={isBusy}
                            />
                            {errorMessage && (
                                <p className="text-sm text-red-500">
                                    {errorMessage}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setErrorMessage(null)
                                    setShowForgot(true)
                                }}
                                className="text-left text-sm text-muted-foreground underline-offset-2 hover:underline"
                            >
                                Forgot password?
                            </button>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => router.back()}
                                disabled={isBusy}
                            >
                                Go back
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={!password || isBusy}
                            >
                                {verifyMutation.isPending
                                    ? 'Checking…'
                                    : 'Unlock'}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <div className="grid gap-3 py-2">
                            {isMetaLoading ? (
                                <p className="text-sm text-muted-foreground">
                                    Checking your access…
                                </p>
                            ) : passwordMeta?.canManage ? (
                                <p className="text-sm text-muted-foreground">
                                    You own this file (or you&apos;re an admin),
                                    so you can reset its password. Resetting
                                    removes the password and opens the file — you
                                    can set a new one afterwards from the
                                    file&apos;s Share menu.
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Only the person who created this file or an
                                    administrator can reset its password. Please
                                    ask them to reset it or share it with you.
                                </p>
                            )}
                            {errorMessage && (
                                <p className="text-sm text-red-500">
                                    {errorMessage}
                                </p>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setErrorMessage(null)
                                    setShowForgot(false)
                                }}
                                disabled={isBusy}
                            >
                                Back
                            </Button>
                            {passwordMeta?.canManage && (
                                <Button
                                    onClick={() => {
                                        setErrorMessage(null)
                                        resetMutation.mutate({
                                            fileId,
                                            password: null,
                                        })
                                    }}
                                    disabled={isBusy}
                                >
                                    {resetMutation.isPending
                                        ? 'Resetting…'
                                        : 'Reset & open'}
                                </Button>
                            )}
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

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
 * Blocking prompt shown when anyone (including admins) opens a
 * password-protected file. No unlock state is cached, so it appears on every
 * open. The file's owner or an admin can recover a forgotten password here —
 * either setting a new one or removing protection entirely.
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
    // New password entered in the recovery panel (owner/admin only).
    const [newPassword, setNewPassword] = useState('')

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

    // Owner/admin recovery: set a new password or clear it, then open the file.
    const resetMutation = api.files.updateFilePassword.useMutation({
        onError: (error) => {
            setErrorMessage(
                error.message || 'Could not update the password. Please try again.'
            )
        },
    })

    const handleSubmit = () => {
        if (!password) return
        setErrorMessage(null)
        verifyMutation.mutate({ fileId, password })
    }

    const handleSaveNew = async () => {
        if (newPassword.length < 4) {
            setErrorMessage('New password must be at least 4 characters.')
            return
        }
        setErrorMessage(null)
        try {
            await resetMutation.mutateAsync({ fileId, password: newPassword })
            onUnlocked(newPassword)
        } catch {
            // error surfaced via resetMutation.onError
        }
    }

    const handleRemove = async () => {
        setErrorMessage(null)
        try {
            await resetMutation.mutateAsync({ fileId, password: null })
            onUnlocked('')
        } catch {
            // error surfaced via resetMutation.onError
        }
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
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        You own this file (or you&apos;re an
                                        admin), so you can reset its password. Set
                                        a new one below, or remove protection
                                        entirely.
                                    </p>
                                    <Input
                                        type="password"
                                        autoFocus
                                        value={newPassword}
                                        onChange={(e) => {
                                            setNewPassword(e.target.value)
                                            if (errorMessage)
                                                setErrorMessage(null)
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveNew()
                                        }}
                                        placeholder="New password (min 4 characters)"
                                        autoComplete="new-password"
                                        disabled={isBusy}
                                    />
                                </>
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

                        <DialogFooter className="gap-2 sm:gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setErrorMessage(null)
                                    setNewPassword('')
                                    setShowForgot(false)
                                }}
                                disabled={isBusy}
                            >
                                Back
                            </Button>
                            {passwordMeta?.canManage && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={handleRemove}
                                        disabled={isBusy}
                                    >
                                        {resetMutation.isPending && !newPassword
                                            ? 'Removing…'
                                            : 'Remove protection'}
                                    </Button>
                                    <Button
                                        onClick={handleSaveNew}
                                        disabled={!newPassword || isBusy}
                                    >
                                        {resetMutation.isPending && newPassword
                                            ? 'Saving…'
                                            : 'Save & open'}
                                    </Button>
                                </>
                            )}
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

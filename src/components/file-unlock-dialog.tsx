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
                error.message ===
                    'Too many attempts. Please wait a moment.'
                    ? error.message
                    : 'Could not verify the password. Please try again.'
            )
        },
    })

    const handleSubmit = () => {
        if (!password) return
        setErrorMessage(null)
        verifyMutation.mutate({ fileId, password })
    }

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
                        disabled={verifyMutation.isPending}
                    />
                    {errorMessage && (
                        <p className="text-sm text-red-500">{errorMessage}</p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={verifyMutation.isPending}
                    >
                        Go back
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!password || verifyMutation.isPending}
                    >
                        {verifyMutation.isPending ? 'Checking…' : 'Unlock'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

'use client'

import { CalendarDays, Loader2, RefreshCcw } from 'lucide-react'
import { useState } from 'react'

import { Button, type ButtonProps } from '~/components/ui/button'

type GoogleConnectButtonProps = ButtonProps & {
    isConnected?: boolean
}

export function GoogleConnectButton({
    isConnected = false,
    children,
    onClick,
    ...props
}: GoogleConnectButtonProps) {
    const [isLoading, setIsLoading] = useState(false)

    const Icon = isLoading
        ? Loader2
        : isConnected
          ? RefreshCcw
          : CalendarDays

    return (
        <Button
            {...props}
            disabled={props.disabled || isLoading}
            onClick={(event) => {
                onClick?.(event)
                if (event.defaultPrevented) {
                    return
                }

                setIsLoading(true)
                window.location.href = '/api/google/auth?redirect=/calendar'
            }}
        >
            <Icon className={isLoading ? 'animate-spin' : undefined} />
            {children ?? (isConnected ? 'Reconnect' : 'Connect Google')}
        </Button>
    )
}

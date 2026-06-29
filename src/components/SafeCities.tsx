'use client'

import React from 'react'
import Image from 'next/image'
import icon from '~/app/icons/icon.jpg'
import { cn } from '~/lib/utils'

interface SafeCitiesProps {
    width?: number
    height?: number
    alt?: string
    className?: string
}

export function SafeCities({
    width = 88,
    height = 52,
    alt = 'Safe Cities Logo',
    className,
}: SafeCitiesProps) {
    return (
        <Image
            src={icon}
            width={width}
            height={height}
            alt={alt}
            className={cn('h-auto w-auto object-contain', className)}
            priority
        />
    )
}

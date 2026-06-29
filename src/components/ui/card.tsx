import * as React from "react"

import { cn } from "~/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "group/card relative overflow-hidden rounded-[calc(var(--radius)+0.55rem)] border border-border/70 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--card))_54%,hsl(var(--accent)/0.34)_100%)] text-card-foreground shadow-lg backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-xl",
      className
    )}
    {...props}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20" />
    <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-primary/12 blur-2xl transition-opacity duration-300 group-hover/card:opacity-100" />
    <div className="pointer-events-none absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-accent/45 blur-2xl transition-opacity duration-300 group-hover/card:opacity-100" />
    <div className="pointer-events-none absolute inset-[1px] rounded-[calc(var(--radius)+0.5rem)] border border-white/30 opacity-40 dark:border-white/8" />
    <div className="pointer-events-none absolute inset-x-5 top-0 h-8 rounded-b-[2rem] bg-white/25 blur-xl dark:bg-white/5" />
    {children}
  </div>
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

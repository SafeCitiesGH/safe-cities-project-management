import { ArrowUpRight, FileText } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"

interface ProgramCardProps {
  title: string
  description: string
  items: number
  lastUpdated: string
  programId: number
}

export function ProgramCard({ title, items, lastUpdated, programId }: ProgramCardProps) {
  return (
    <Link href={`/programs/${programId}`} className="block">
    <Card className="group transition-transform duration-200 hover:-translate-y-1 cursor-pointer">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-border/60 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Programme
            </div>
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 to-accent/70 text-primary shadow-sm">
            <ArrowUpRight size={16} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4 text-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <FileText size={14} className="text-primary" />
              <span>{items} items</span>
            </div>
            <p className="max-w-[14rem] text-sm leading-6 text-muted-foreground">
              Keep documents, sheets, and updates grouped under one programme space.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-2 text-right text-muted-foreground">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Activity
            </div>
            {lastUpdated === 'Loading...' ? 'Loading...' : `Updated ${lastUpdated}`}
          </div>
        </div>
      </CardContent>
    </Card>
    </Link>
  )
}

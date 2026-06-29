import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Bell } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

interface RecentActivityListProps {
  notifications: any[] | undefined;
  isLoading: boolean;
}

export function RecentActivityList({ notifications, isLoading }: RecentActivityListProps) {

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!notifications || notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Bell size={24} className="text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">No recent activity</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          When you or your team members make changes, they'll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {notifications.slice(0, 5).map((notification) => (
        <div key={notification.id} className="group flex items-start gap-3 bg-[linear-gradient(90deg,transparent_0%,hsl(var(--background)/0.16)_35%,transparent_100%)] p-4 transition-colors hover:bg-[linear-gradient(90deg,hsl(var(--primary)/0.05)_0%,hsl(var(--accent)/0.24)_100%)]">
          <Avatar className="h-9 w-9 ring-1 ring-border/60">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/70 text-foreground">
              {(notification.userName ?? "U").split(" ").map(n => n[0]).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm">
                <span className="font-medium">{notification.userName || "Unknown User"}</span>
              </p>
              <Badge variant="secondary" className="border border-border/60 bg-background/60 text-xs">
                {notification.type || "notification"}
              </Badge>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/40 px-3 py-2 shadow-sm transition-colors group-hover:border-border/80 group-hover:bg-background/55">
              <p className="text-sm text-muted-foreground">{notification.content}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground/75">
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

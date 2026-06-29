'use client'

import { Suspense, useMemo, useState, useEffect, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { CalendarDays, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Calendar } from '~/components/ui/calendar'
import type { DayContentProps } from 'react-day-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar'
import { useMobile } from '~/hooks/use-mobile'
import { toast } from '~/hooks/use-toast'
import { GoogleConnectButton } from '~/components/google-calendar/connect-button'

const calendarStyles = `
  .calendar-large {
    width: 100%;
    height: 100%;
    padding: 1.5rem;
  }

  .calendar-large .rdp {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  .calendar-large .rdp-months,
  .calendar-large .rdp-month {
    width: 100%;
    height: 100%;
  }

  .calendar-large .rdp-caption {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 64px;
    margin-bottom: 1rem;
  }

  .calendar-large .rdp-caption_label {
    font-size: 1.6rem;
    font-weight: 700;
  }

  .calendar-large .rdp-nav {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .calendar-large .rdp-nav_button {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    border: 1px solid hsl(var(--border));
    background: linear-gradient(145deg, hsl(var(--card)), hsl(var(--accent) / 0.35));
    box-shadow:
      0 12px 22px -16px hsl(var(--primary) / 0.35),
      inset 0 1px 0 hsl(0 0% 100% / 0.5);
  }

  .calendar-large .rdp-table {
    width: 100%;
    height: calc(100% - 90px);
    table-layout: fixed;
    border-collapse: collapse;
  }

  .calendar-large .rdp-head_cell {
    height: 44px;
    font-size: 0.9rem;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
  }

  .calendar-large .rdp-row {
    height: calc((100% - 44px) / 6);
  }

  .calendar-large .rdp-cell {
    height: 100%;
    border: 1px solid hsl(var(--border));
    padding: 4px;
    background: hsl(var(--background) / 0.35);
  }

  .calendar-large .rdp-day {
    width: 100%;
    height: 100%;
    min-height: 95px;
    border-radius: 18px;
    font-size: 1rem;
    font-weight: 600;
    background: linear-gradient(155deg, hsl(var(--card)), hsl(var(--accent) / 0.24));
    box-shadow:
      0 16px 24px -18px hsl(var(--primary) / 0.28),
      0 2px 8px -6px hsl(var(--foreground) / 0.12),
      inset 0 1px 0 hsl(0 0% 100% / 0.55);
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .calendar-large .rdp-day:hover {
    background: linear-gradient(155deg, hsl(var(--card)), hsl(var(--accent) / 0.42));
    transform: translateY(-1px);
    box-shadow:
      0 20px 28px -18px hsl(var(--primary) / 0.34),
      0 6px 12px -8px hsl(var(--foreground) / 0.12),
      inset 0 1px 0 hsl(0 0% 100% / 0.6);
  }

  .calendar-large .rdp-day_selected {
    background: linear-gradient(155deg, hsl(var(--primary) / 0.22), hsl(var(--accent) / 0.58));
    color: hsl(var(--foreground));
    box-shadow:
      0 22px 32px -18px hsl(var(--primary) / 0.42),
      inset 0 1px 0 hsl(0 0% 100% / 0.45);
  }

  .calendar-large .rdp-day_today {
    color: hsl(var(--primary));
  }

  .calendar-large .rdp-day_outside {
    color: hsl(var(--muted-foreground) / 0.45);
  }
`

type GoogleCalendarEvent = {
  id: string
  title: string
  description: string
  location: string
  start: string
  end: string
  htmlLink?: string
}

type GoogleCalendarStatus = {
  connected: boolean
  googleEmail: string | null
  connectedAt: string | null
}

function normalizeGoogleCalendarEvents(
  events: Array<Partial<GoogleCalendarEvent>>
): GoogleCalendarEvent[] {
  const deduped = new Map<string, GoogleCalendarEvent>()

  events.forEach((event) => {
    if (!event.start) {
      return
    }

    const id = event.id?.trim() || `${event.start}-${event.title ?? 'event'}`

    deduped.set(id, {
      id,
      title: event.title ?? '',
      description: event.description ?? '',
      location: event.location ?? '',
      start: event.start,
      end: event.end ?? event.start,
      htmlLink: event.htmlLink,
    })
  })

  return Array.from(deduped.values()).sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function getEventRangeForDate(date: Date) {
  const start = new Date(date)
  start.setHours(9, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    start: toLocalDateTime(start),
    end: toLocalDateTime(end),
  }
}

function getDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function GoogleCalendarPageContent() {
  const searchParams = useSearchParams()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([])
  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus>({
    connected: false,
    googleEmail: null,
    connectedAt: null,
  })
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [start, setStart] = useState(getEventRangeForDate(new Date()).start)
  const [end, setEnd] = useState(getEventRangeForDate(new Date()).end)
  const isMobile = useMobile()
  const { state } = useSidebar()

  const eventsByDate = useMemo(() => {
    const map = new Map<string, GoogleCalendarEvent[]>()
    events.forEach((event) => {
      const key = event.start.split('T')[0] ?? ''
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    })
    return map
  }, [events])

  const selectedEvents = useMemo(
    () => eventsByDate.get(getDateKey(selectedDate)) ?? [],
    [eventsByDate, selectedDate]
  )

  const nextEvent = useMemo(() => {
    const now = Date.now()
    return events
      .map((event) => ({ event, time: new Date(event.start).getTime() }))
      .filter((item) => item.time >= now)
      .sort((a, b) => a.time - b.time)[0]?.event
  }, [events])

  const googleState = searchParams.get('google')
  const googleDetail = searchParams.get('detail')

  useEffect(() => {
    if (googleState === 'connected') {
      toast({ title: 'Google Calendar connected' })
    } else if (googleState === 'reconnected') {
      toast({ title: 'Google Calendar reconnected' })
    } else if (googleState === 'error') {
      toast({
        title: 'Google connection failed',
        description: googleDetail
          ? decodeURIComponent(googleDetail)
          : 'The Google OAuth flow did not complete successfully.',
        variant: 'destructive',
      })
    }
  }, [googleDetail, googleState])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setIsLoadingEvents(true)

        const statusRes = await fetch('/api/google/status', {
          cache: 'no-store',
        })

        if (!statusRes.ok) {
          if (mounted) {
            setGoogleStatus({
              connected: false,
              googleEmail: null,
              connectedAt: null,
            })
          }
          return
        }

        const statusData = (await statusRes.json()) as GoogleCalendarStatus

        if (mounted) {
          setGoogleStatus(statusData)
        }

        if (!statusData.connected) {
          if (mounted) {
            setEvents([])
          }
          return
        }

        const res = await fetch('/api/google/events/list', {
          cache: 'no-store',
        })

        if (res.status === 409) {
          if (mounted) {
            setGoogleStatus({
              connected: false,
              googleEmail: null,
              connectedAt: null,
            })
            setEvents([])
          }
          return
        }

        if (!res.ok) {
          throw new Error('Failed to load events')
        }

        const data = (await res.json()) as Array<Partial<GoogleCalendarEvent>>
        const parsed = normalizeGoogleCalendarEvents(data)

        if (mounted) setEvents(parsed)
      } catch (err) {
        console.error('Error loading events:', err)
        toast({
          title: 'Failed to load calendar events',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        })
      } finally {
        if (mounted) {
          setIsLoadingEvents(false)
        }
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  function formatTimeRange(e: GoogleCalendarEvent) {
    try {
      return `${format(new Date(e.start), 'p')} - ${format(new Date(e.end), 'p')}`
    } catch {
      return ''
    }
  }

  const openAddEventDialog = (date: Date) => {
    if (!googleStatus.connected) {
      toast({
        title: 'Connect Google Calendar first',
        description: 'This account has not connected a Google Calendar yet.',
        variant: 'destructive',
      })
      return
    }

    const range = getEventRangeForDate(date)
    setSelectedDate(date)
    setTitle('')
    setDescription('')
    setLocation('')
    setStart(range.start)
    setEnd(range.end)
    setLastMessage(null)
    setIsDialogOpen(true)
  }

  const handleDateSelect = (date?: Date) => {
    if (!date) return
    openAddEventDialog(date)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' })
      return
    }

    const startDate = new Date(start)
    const endDate = new Date(end)

    if (endDate <= startDate) {
      toast({
        title: 'Invalid time range',
        description: 'End time must be after the start time.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    setLastMessage(null)

    try {
      const response = await fetch('/api/google/events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, location, start, end }),
      })
      const data = (await response.json()) as Partial<GoogleCalendarEvent> & {
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to create event')
      }

      setEvents((prev) => normalizeGoogleCalendarEvents([...prev, data]))
      setLastMessage('Event created successfully.')
      toast({ title: 'Google Calendar event created' })
      setIsDialogOpen(false)
    } catch (error) {
      setLastMessage('Failed to create event. Check the console for details.')
      toast({
        title: 'Error creating event',
        description: error instanceof Error ? error.message : 'Unable to create event',
        variant: 'destructive',
      })
      console.error('Google Calendar event error:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Delete this event?')) return
    const previous = events
    setEvents((prev) => prev.filter((e) => e.id !== eventId))
    try {
      const res = await fetch('/api/google/events/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId }),
      })
      let data: { error?: string; message?: string } | null = null
      try {
        data = (await res.json()) as { error?: string; message?: string }
      } catch {
        data = null
      }
      if (!res.ok) throw new Error(data?.error ?? data?.message ?? 'Failed to delete')
      toast({ title: 'Event deleted' })
    } catch (err) {
      setEvents(previous)
      toast({ title: 'Failed to delete event', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  const CustomDayContent = ({ date }: DayContentProps) => {
    const count = eventsByDate.get(getDateKey(date))?.length ?? 0

    return (
      <div className="relative flex h-full w-full flex-col items-center pt-4">
        <span>{date.getDate()}</span>

        {count > 0 && (
          <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <style>{calendarStyles}</style>
      <div className="px-6 py-4 border-b bg-card shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {(state === 'collapsed' || isMobile) && <SidebarTrigger />}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Google Calendar</h1>
              <p className="text-sm text-muted-foreground mt-1">Manage your events seamlessly</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openAddEventDialog(selectedDate)}
                className="gap-2"
                disabled={!googleStatus.connected}
              >
                <Plus size={16} />
                Add event
              </Button>
              <GoogleConnectButton
                size="sm"
                variant="outline"
                className="gap-2"
                isConnected={googleStatus.connected}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <div className="grid gap-6 h-full grid-cols-1 lg:grid-cols-3">
          <Card className="lg:col-span-2 flex min-h-[720px] flex-col overflow-hidden rounded-[2rem]">
            <CardHeader className="border-b px-7 py-6">
              <CardTitle className="text-xl">Calendar</CardTitle>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-7">
              <div className="calendar-large h-full w-full">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  showOutsideDays
                  components={{ DayContent: CustomDayContent }}
                  className="w-full max-h-[200px] p-0"
                  classNames={{
                    months: "h-full w-full",
                    month: "h-full w-full",
                    caption: "relative mb-2 flex items-center justify-center",
                    caption_label: "text-2xl font-bold",
                    nav: "absolute left-0 right-0 top-0 flex items-center justify-between",
                    nav_button: "h-8 w-8 rounded-xl border border-border/70 bg-background/70 shadow-sm hover:bg-accent/60",
                    nav_button_previous: "absolute left-0",
                    nav_button_next: "absolute right-0",
                    table: "w-full table-fixed border-collapse",
                    head_row: "grid grid-cols-7",
                    head_cell:
                      "flex h-10 items-center justify-center text-sm font-semibold uppercase text-muted-foreground",
                    row: "grid grid-cols-7",
                    cell:
                      "relative h-[88px] border border-border/70 bg-background/25 p-1 text-center",
                    day:
                      "h-full w-full rounded-2xl p-0 text-base font-semibold shadow-sm hover:bg-muted",
                    day_selected: "bg-primary/20 text-foreground shadow-md hover:bg-primary/25",
                    day_today: "text-primary",
                    day_outside: "text-muted-foreground/40",
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col overflow-hidden rounded-[2rem]">
            <CardHeader className="border-b pb-3 px-6 pt-6">
              <div className="space-y-1">
                <CardTitle className="text-lg">Events</CardTitle>
                <p className="text-sm text-muted-foreground">{format(selectedDate, 'EEE, MMM d, yyyy')}</p>
                <p className="text-sm text-muted-foreground">
                  {googleStatus.connected
                    ? `Connected as ${googleStatus.googleEmail ?? 'Google account'}`
                    : 'No Google Calendar connected for this Clerk user yet.'}
                </p>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-5">
              {!googleStatus.connected ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <CalendarDays className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Connect Google Calendar to load and manage events from this user&apos;s primary calendar.
                  </p>
                  <GoogleConnectButton isConnected={false} />
                </div>
              ) : isLoadingEvents ? (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-sm text-muted-foreground">Loading events...</p>
                </div>
              ) : selectedEvents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-sm text-muted-foreground">No events on this date.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-input/80 bg-[linear-gradient(155deg,hsl(var(--card)),hsl(var(--accent)/0.26))] p-4 shadow-[0_18px_36px_-24px_hsl(var(--primary)/0.34),0_6px_12px_-8px_hsl(var(--foreground)/0.12)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{event.title}</p>
                          <p className="text-sm text-muted-foreground">{formatTimeRange(event)}</p>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          {event.htmlLink ? (
                            <a href={event.htmlLink} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
                              View
                            </a>
                          ) : null}
                          <Button variant="ghost" onClick={() => handleDeleteEvent(event.id)} className="text-sm text-destructive">
                            Delete
                          </Button>
                        </div>
                      </div>
                      {event.location ? <p className="text-sm text-muted-foreground mt-2">Location: {event.location}</p> : null}
                      {event.description ? <p className="text-sm text-muted-foreground mt-2">{event.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}

              {googleStatus.connected && nextEvent && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">NEXT EVENT</p>
                  <div className="rounded-2xl border border-border/70 bg-[linear-gradient(155deg,hsl(var(--card)),hsl(var(--accent)/0.22))] p-4 shadow-[0_18px_30px_-22px_hsl(var(--primary)/0.28)]">
                    <p className="font-semibold text-sm">{nextEvent.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(nextEvent.start), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-muted-foreground">{formatTimeRange(nextEvent)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add event for {format(selectedDate, 'MMM d, yyyy')}</DialogTitle>
            <DialogDescription>Add a new Google Calendar event for the selected date.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-title">Event title</Label>
              <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-location">Location</Label>
              <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-description">Description</Label>
              <Textarea id="event-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-start">Start</Label>
                <Input id="event-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">End</Label>
                <Input id="event-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            {lastMessage ? <p className="text-sm text-muted-foreground">{lastMessage}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving} className="gap-2">{isSaving ? 'Saving...' : 'Save event'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function GoogleCalendarPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <GoogleCalendarPageContent />
    </Suspense>
  )
}

import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id || body.eventId || null;
    if (!id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    await calendar.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID || "primary", eventId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Google Calendar delete error:", error);
    return NextResponse.json({ error: "Failed to delete event", details: String(error) }, { status: 500 });
  }
}

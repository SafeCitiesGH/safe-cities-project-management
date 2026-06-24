import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const now = new Date().toISOString();

    const res = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      timeMin: now,
      maxResults: 2500,
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = (res.data.items || []).map((it) => ({
      id: it.id,
      title: it.summary || "",
      description: it.description || "",
      location: it.location || "",
      start: it.start?.dateTime || it.start?.date || null,
      end: it.end?.dateTime || it.end?.date || null,
      htmlLink: it.htmlLink,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("Google Calendar list error:", error);
    return NextResponse.json({ error: "Failed to list events", details: String(error) }, { status: 500 });
  }
}

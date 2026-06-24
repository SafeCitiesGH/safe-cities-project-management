import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.title || !body.start || !body.end) {
      return NextResponse.json(
        { error: "Missing title, start, or end" },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const event = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      requestBody: {
        summary: body.title,
        description: body.description || "",
        location: body.location || "",
        start: {
          dateTime: new Date(body.start).toISOString(),
          timeZone: "Africa/Johannesburg",
        },
        end: {
          dateTime: new Date(body.end).toISOString(),
          timeZone: "Africa/Johannesburg",
        },
      },
    });

    return NextResponse.json(event.data);
  } catch (error) {
    console.error("Google Calendar create error:", error);
    return NextResponse.json(
      { error: "Failed to create event", details: String(error) },
      { status: 500 }
    );
  }
}
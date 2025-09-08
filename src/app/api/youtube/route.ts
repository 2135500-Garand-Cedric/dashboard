import { NextResponse } from "next/server";

export async function GET() {
  const channelId = "UCn1icliVp7N5EcLosJ-zJXg";
  const apiKey = process.env.YOUTUBE_API_KEY;

  const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
  }
}

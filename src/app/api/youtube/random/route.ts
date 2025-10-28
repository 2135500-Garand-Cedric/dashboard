import { NextResponse } from "next/server";

export async function GET() {
  const channelId = "UCn1icliVp7N5EcLosJ-zJXg";
  const apiKey = process.env.YOUTUBE_API_KEY;

  const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=50`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items?.length) {
      return NextResponse.json({ error: "No videos found" }, { status: 404 });
    }

    // Pick a random video
    const randomIndex = Math.floor(Math.random() * data.items.length);
    const randomVideo = data.items[randomIndex];

    return NextResponse.json({ items: [randomVideo] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
  }
}

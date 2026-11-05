import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { isOwnerSession } from "./owner-policy";

// Check inside each handler, before reading input, accessing data, or fetching
// external services. Page layouts alone do not protect API endpoints.
export async function requireOwner(request?: Request): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!isOwnerSession(session)) {
    return NextResponse.json({ error: "You cannot use this app." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(process.env.NEXTAUTH_URL || request.url).origin;
    if ((origin && origin !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }
  }
  return null;
}

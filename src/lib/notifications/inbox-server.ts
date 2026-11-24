import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import {
  InboxError,
  inboxCommand,
  inboxCount,
  listInbox,
  notificationDetail,
} from "./inbox-api.mjs";
import { notificationHeaders } from "./server";

export async function inboxHandler(request: Request, action: string, id?: string) {
  try {
    const userId = OWNER_DATABASE_USER_ID;
    let data;
    if (action === "list")
      data = await listInbox(prisma, userId, new URL(request.url).searchParams);
    else if (action === "count") data = await inboxCount(prisma, userId);
    else if (action === "detail") data = await notificationDetail(prisma, userId, id);
    else {
      const header = request.headers.get("If-Match") || "";
      const revision = /^"[1-9]\d*"$/.test(header) ? Number(header.slice(1, -1)) : null;
      data = await inboxCommand(prisma, userId, {
        id,
        revision,
        key: request.headers.get("Idempotency-Key") || "",
        action,
        body: await request.json(),
      });
    }
    return NextResponse.json(data, { headers: notificationHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof InboxError
            ? error.message
            : error instanceof SyntaxError
              ? "Enter a valid request."
              : "Unable to load or update notifications. Please try again.",
      },
      {
        status:
          error instanceof InboxError ? error.status : error instanceof SyntaxError ? 400 : 503,
        headers: notificationHeaders,
      },
    );
  }
}

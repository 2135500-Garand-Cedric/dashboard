import { getActor } from "@/lib/accounts/access";
import { sameOrigin, smallJson } from "@/lib/accounts/security";
import { initializeJapanese } from "@/lib/accounts/onboarding";
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Cross-site request denied." }, { status: 403 });
  try {
    const result = await initializeJapanese(actor.id, await smallJson(request));
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "Unable to finish setup. Check your name and timezone, then retry; a completed setup will not be copied twice.",
      },
      { status: 400 },
    );
  }
}

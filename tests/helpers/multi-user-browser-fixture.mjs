import { PrismaClient } from "../../src/generated/prisma/index.js";
import { accountModules } from "./accounts.mjs";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
if (process.env.NODE_ENV === "production")
  throw Error("Browser fixtures are not allowed in production.");
const db = new PrismaClient();
const modules = accountModules(db),
  security = modules.load("src/lib/accounts/security.ts"),
  identity = modules.load("src/lib/accounts/identity.ts"),
  adapter = modules.load("src/lib/accounts/adapter.ts").dashboardAdapter;
try {
  if (process.argv[2] === "setup") {
    const owner = await db.user.findUniqueOrThrow({ where: { id: 1 } });
    if (owner.role !== "OWNER") throw Error("Owner migration missing.");
    const tag = `Browser-${randomUUID()}`,
      invite = security.newToken();
    await db.userInvitation.create({
      data: {
        label: tag,
        tokenHash: security.hashToken(invite),
        expires: new Date(Date.now() + 3600000),
      },
    });
    if (
      !(await identity.authorizeIdentity({
        provider: "github",
        subject: tag,
        email: null,
        verified: false,
        name: tag,
        invite,
      }))
    )
      throw Error("Fixture registration failed.");
    const member = await db.authAccount.findUnique({
      where: { provider_providerAccountId: { provider: "github", providerAccountId: tag } },
    });
    const ownerToken = security.newToken(),
      memberToken = security.newToken();
    await adapter.createSession({
      userId: "1",
      sessionToken: ownerToken,
      expires: new Date(Date.now() + 3600000),
    });
    await adapter.createSession({
      userId: String(member.userId),
      sessionToken: memberToken,
      expires: new Date(Date.now() + 3600000),
    });
    console.log(JSON.stringify({ tag, invite, ownerToken, memberToken, memberId: member.userId }));
  } else if (process.argv[2] === "cleanup") {
    const fixture = JSON.parse(fs.readFileSync(0, "utf8"));
    if (
      !Number.isInteger(fixture.memberId) ||
      fixture.memberId <= 1 ||
      !/^Browser-[a-f0-9-]{36}$/.test(fixture.tag)
    )
      throw Error("Invalid fixture.");
    const invites = await db.userInvitation.findMany({
      where: { label: { startsWith: fixture.tag } },
      select: { id: true },
    });
    await db.auditEvent.deleteMany({
      where: {
        OR: [
          { userId: fixture.memberId },
          {
            category: "AUTH",
            entityType: "invitation",
            entityId: { in: invites.map((i) => i.id) },
          },
        ],
      },
    });
    await db.authSession.deleteMany({
      where: { tokenHash: security.hashToken(fixture.ownerToken) },
    });
    await db.authLinkIntent.deleteMany({ where: { userId: fixture.memberId } });
    await db.vocabulary.deleteMany({ where: { userId: fixture.memberId } });
    await db.category.deleteMany({ where: { userId: fixture.memberId } });
    await db.user.delete({ where: { id: fixture.memberId } });
    await db.userInvitation.deleteMany({ where: { id: { in: invites.map((i) => i.id) } } });
  } else throw Error("Choose setup or cleanup.");
} finally {
  await db.$disconnect();
}

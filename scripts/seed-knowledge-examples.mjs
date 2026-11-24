import { createHash } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { loadWorkServices } from "./helpers/work-services.mjs";

if (process.env.NODE_ENV !== "development" || process.env.ALLOW_KNOWLEDGE_EXAMPLES !== "1") {
  throw new Error(
    "Run explicitly in development with ALLOW_KNOWLEDGE_EXAMPLES=1. Never run on production.",
  );
}

// Stable mutation keys make reruns safe, including a retry after a lost response.
// Existing examples and any later manual edits are never overwritten.
function command(name) {
  const bytes = createHash("sha256").update(`knowledge-examples:v1:${name}`).digest();
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return {
    requestKey: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  };
}
const db = new PrismaClient({ log: [] });
try {
  const { knowledge, server, projects } = loadWorkServices(db);
  const project = await projects.createProject(
    {
      name: "[Example] IT documentation library",
      objective: "Fictional project for exploring Knowledge articles and their task links.",
      summary: "Sample data only. No real maintenance or troubleshooting has been performed.",
    },
    command("project"),
  );
  const vpnTask = await server.createTodo(
    {
      title: "[Example] Investigate a VPN connection failure",
      description: "Fictional incident used to demonstrate linking a reusable guide to a task.",
      projectId: project.id,
    },
    command("vpn-task"),
  );
  const backupTask = await server.createTodo(
    {
      title: "[Example] Review a failed backup notification",
      description:
        "Fictional task for testing documentation links. There is no actual backup failure.",
      projectId: project.id,
    },
    command("backup-task"),
  );
  async function article(key, data) {
    return knowledge.saveArticle(
      null,
      { tags: ["knowledge-demo", "Example"], ...data },
      command(`article:${key}`),
    );
  }
  const checklist = await article("checklist", {
    title: "[Example] Troubleshooting evidence checklist",
    type: "REFERENCE",
    summary: "Standalone reference with a checklist, table, quote, and a safe code example.",
    tags: ["knowledge-demo", "Reference", "Troubleshooting"],
    body: `## Purpose

This fictional reference is intentionally standalone: it has no links to articles, tasks, or projects.

## Before changing anything

- [ ] Record the exact error message.
- [ ] Note the device, application version, and time of the failure.
- [ ] Check whether one person or several people are affected.
- [x] Keep a short record of checks already completed.

## Evidence to capture

| Information | Example |
| --- | --- |
| Symptom | A connection times out |
| Error identifier | DEMO_CONNECTION_TIMEOUT |
| Scope | One demonstration laptop |
| Recent change | A fictional software update |

> A useful note explains what was checked and what the result was.

## Example of a diagnostic note

\`\`\`text
Symptom: demo connection failed
Scope: one test device
Check: compare another connection
Result: issue could not be reproduced on the second device
\`\`\`

The text above is sample documentation, not a record of work actually performed.
`,
  });
  const laptop = await article("laptop", {
    title: "[Example] Prepare a laptop for a new colleague",
    type: "PROCEDURE",
    summary: "Standalone procedure with ordered steps, prerequisites, and verification.",
    tags: ["knowledge-demo", "Onboarding", "Procedure"],
    body: `## Purpose

Demonstrate a procedure article without linking it to any other records.

## Prerequisites

- A demonstration laptop and a test user.
- An approved list of applications.
- Confirmation of who will receive the device.

## Steps

1. Record the device identifier in the appropriate inventory.
2. Install the approved applications.
3. Check that the test user can sign in.
4. Verify network access and any required peripherals.
5. Record the handover details in the actual onboarding task.

## Verification

- [ ] Applications launch successfully.
- [ ] Network and printing checks are complete.
- [ ] The recipient knows how to request assistance.

## Recovery

If a check fails, keep the device available for investigation and record the failed step before continuing.

This is fictional example content. Adapt a real procedure to your own environment before using it.
`,
  });
  const vpn = await article("vpn", {
    title: "[Example] VPN stops connecting after an update",
    type: "TROUBLESHOOTING",
    summary: "Troubleshooting guide linked to a sample incident and another article.",
    tags: ["knowledge-demo", "VPN", "Network"],
    taskId: vpnTask.id,
    body: `## Symptoms

A fictional test laptop shows \`DEMO_VPN_TIMEOUT\` after an application update.

## Environment

- Demonstration laptop.
- Test VPN profile.
- No real account details or credentials.

## Checks

1. Use the [troubleshooting evidence checklist](/knowledge/${checklist.id}).
2. Confirm that ordinary network access works.
3. Compare the behavior on another test device.
4. Record the application version and exact error.

## Cause

In this fictional incident, the saved test profile no longer matched the updated client.

## Example resolution

The demonstration profile was corrected and the test connection was checked again. This is an illustrative outcome, not an instruction to change a real VPN profile.

## Verification

- [x] The test connection succeeds.
- [x] The original error no longer appears.

## Related work

The task is linked in Related work. Its notes and status stay separate from this reusable guide.
`,
  });
  const printer = await article("printer", {
    title: "[Example] Printer jobs remain in the queue",
    type: "TROUBLESHOOTING",
    summary: "Article-to-article links and backlinks, without any task or project association.",
    tags: ["knowledge-demo", "Printing", "Troubleshooting"],
    body: `## Symptoms

A demonstration print job stays queued while another test device can print.

## Checks

Use the [evidence checklist](/knowledge/${checklist.id}) to record the symptom and affected device.

1. Check whether the correct demonstration printer is selected.
2. Compare the queue status with another device.
3. Note any visible error before changing the queue.

## Example cause and outcome

The fictional device had an outdated test printer configuration. Correcting the demonstration configuration resolved the sample incident.

## Verification

- [x] A test page prints.
- [x] A second job leaves the queue normally.

## Related procedure

Printing verification is also part of [preparing a laptop](/knowledge/${laptop.id}). This article has no linked work records; its links are only to other Knowledge articles.
`,
  });
  const backup = await article("backup", {
    title: "[Example] Investigate a failed backup notification",
    type: "PROCEDURE",
    summary: "Example linked directly to both a project and a task, with a diagnostic log snippet.",
    tags: ["knowledge-demo", "Backups", "Procedure"],
    taskId: backupTask.id,
    projectId: project.id,
    body: `## Purpose

Demonstrate how a procedure can be shared by a project and its tasks. No actual backup failure has been detected.

## Prerequisites

Locate the relevant backup job and its most recent execution record. Use the [evidence checklist](/knowledge/${checklist.id}) before making changes.

## Steps

1. Read the most recent job result.
2. Compare its start and finish times with a successful run.
3. Note the reported error and whether other jobs were affected.
4. Record the investigation in the linked task.
5. Verify recovery using your approved backup and restore procedure.

## Fictional log excerpt

\`\`\`text
Job: demonstration-nightly-copy
Result: failed
Reason: DEMO_DESTINATION_UNAVAILABLE
Next action: check the demonstration destination
\`\`\`

## Verification

- [ ] A later job completes successfully.
- [ ] The backup can be restored in an isolated environment.

The direct project link remains even if the task is later moved to another project.
`,
  });
  const retired = await article("archived", {
    title: "[Example] Retired laptop handover notes",
    type: "REFERENCE",
    summary: "Archived example for testing filters and stable links to retired documentation.",
    archived: true,
    tags: ["knowledge-demo", "Archived", "Onboarding"],
    body: `## Retired example

This fictional article starts archived so you can test the Archived filter and the restore action.

It is retained for historical reference. The current example procedure is [Prepare a laptop for a new colleague](/knowledge/${laptop.id}).

Archiving an article does not remove its content or break its links.
`,
  });
  const hub = await article("hub", {
    title: "[Example] Start here — IT knowledge library",
    type: "REFERENCE",
    summary:
      "Pinned starting point for exploring standalone articles, backlinks, work links, and archived content.",
    pinned: true,
    projectId: project.id,
    body: `## Explore the examples

These are fictional examples for trying the Knowledge module. Search for \`knowledge-demo\` to find them all.

### Standalone articles

- [Troubleshooting evidence checklist](/knowledge/${checklist.id}): reference, table, checklist, and code block. No outgoing links or related work.
- [Prepare a laptop](/knowledge/${laptop.id}): procedure with no outgoing links or related work.

### Articles linked to other articles

- [Printer jobs remain queued](/knowledge/${printer.id}): links to two articles, with no task or project association.
- [VPN stops connecting](/knowledge/${vpn.id}): links to a reference article and a sample task. It appears under the project's From project tasks section.

### Articles linked to work

- [Investigate a failed backup](/knowledge/${backup.id}): linked directly to both a task and the sample project.
- This starting page is linked directly to the sample project, without a task association.

### Archived documentation

- [Retired laptop handover notes](/knowledge/${retired.id}): an archived article that is still reachable through its stable link.

## Things to try

- [ ] Open an article and inspect its backlinks.
- [ ] Open a related task and find its Documentation section.
- [ ] Open the sample project and compare direct links with From project tasks.
- [ ] Filter by type, tag, or Archived.
- [ ] Edit an example, then inspect or restore a previous revision.

No receipts, finance records, calendar events, or real task notes are changed by these examples.
`,
  });
  console.log(
    JSON.stringify(
      {
        articles: [hub, checklist, laptop, vpn, printer, backup, retired].map(({ id, title }) => ({
          id,
          title,
        })),
        projectId: project.id,
        taskIds: [vpnTask.id, backupTask.id],
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Knowledge examples could not be confirmed. Rerun to resume safely; existing records are preserved. No private content was logged.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

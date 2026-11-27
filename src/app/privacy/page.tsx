export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-3xl font-bold">Account privacy</h1>
      <p>
        This is an invitation-only Japanese learning service operated by the person who invited you.
      </p>
      <p>
        We store your provider’s account identifier, available verified email, display name,
        timezone, login/session information, vocabulary, practice results and rewards. We do not
        receive or store your Google or GitHub password. Your provider identity is used to sign you
        in; no Gmail, calendar or repository access is requested.
      </p>
      <p>
        Your vocabulary and progress belong to your dashboard account. Starter vocabulary is an
        independent copy you can edit or delete. Other learners cannot access your records. The host
        administrator can access the database and backups; this service does not provide end-to-end
        encryption against its operator.
      </p>
      <p>
        Accounts and learning records are retained while your account exists. Contact the person who
        invited you to request an export or deletion. Suspension removes access but does not erase
        records. Security/activity logs normally expire after 180 days; denied sign-in records
        expire after 30 days. No advertising or report email is enabled for member accounts.
      </p>
      <p>
        Backups follow the host’s backup schedule and may retain older copies after deletion. The
        operator must reapply deletion requests after a restore. Ask the inviter about current
        backup retention before adding sensitive information.
      </p>
      <p>Updated November 26, 2026. Contact your inviter for support or privacy requests.</p>
    </main>
  );
}

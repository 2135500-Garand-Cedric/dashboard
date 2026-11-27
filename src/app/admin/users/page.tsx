import { requireOwnerPage } from "@/lib/accounts/owner-page";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import UserManagement from "@/components/accounts/UserManagement";
export default async function Page() {
  await requireOwnerPage();
  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <Link
          href="/settings"
          className="inline-flex items-center rounded-lg border border-card-border px-3 py-2 text-sm"
        >
          ← Back to settings
        </Link>
        <UserManagement />
      </div>
    </ProtectedLayout>
  );
}

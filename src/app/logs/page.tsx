import { requireOwnerPage } from "@/lib/accounts/owner-page";
import ProtectedLayout from "@/components/ProtectedLayout";
import AuditLog from "@/components/audit/AuditLog";
export const metadata = { title: "Activity logs" };
export default async function Page() {
  await requireOwnerPage();
  return (
    <ProtectedLayout>
      <AuditLog />
    </ProtectedLayout>
  );
}

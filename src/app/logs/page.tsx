import ProtectedLayout from "@/components/ProtectedLayout";
import AuditLog from "@/components/audit/AuditLog";
export const metadata = { title: "Activity logs" };
export default function Page() {
  return (
    <ProtectedLayout>
      <AuditLog />
    </ProtectedLayout>
  );
}

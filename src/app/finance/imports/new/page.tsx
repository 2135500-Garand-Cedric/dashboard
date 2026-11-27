import { requireOwnerPage } from "@/lib/accounts/owner-page";
import StatementUpload from "@/components/finance/StatementUpload";
export default async function NewImportPage() {
  await requireOwnerPage();
  return <StatementUpload />;
}

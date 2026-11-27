import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { TemplatesPage } from "@/components/knowledge/Templates";
export default async function Page() {
  await requireOwnerPage();
  return <TemplatesPage />;
}

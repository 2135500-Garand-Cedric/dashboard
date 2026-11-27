import { requireOwnerPage } from "@/lib/accounts/owner-page";
import CategoriesManager from "@/components/finance/CategoriesManager";

export default async function CategoriesPage() {
  await requireOwnerPage();
  return <CategoriesManager />;
}

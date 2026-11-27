import { requireOwnerPage } from "@/lib/accounts/owner-page";
import NotificationInbox from "@/components/notifications/NotificationInbox";
export default async function InboxPage() {
  await requireOwnerPage();
  return <NotificationInbox />;
}

import { requireOwnerPage } from "@/lib/accounts/owner-page";
import NotificationInbox from "@/components/notifications/NotificationInbox";
export default async function ReminderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  return <NotificationInbox id={(await params).id} />;
}

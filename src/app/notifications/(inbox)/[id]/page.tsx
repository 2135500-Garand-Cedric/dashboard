import NotificationInbox from "@/components/notifications/NotificationInbox";
export default async function ReminderPage({ params }: { params: Promise<{ id: string }> }) {
  return <NotificationInbox id={(await params).id} />;
}

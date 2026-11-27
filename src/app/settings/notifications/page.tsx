import { requireOwnerPage } from "@/lib/accounts/owner-page";
import SettingsSection from "@/components/settings/SettingsSection";
import NotificationSettings from "@/components/notifications/NotificationSettings";
export default async function Page() {
  await requireOwnerPage();
  return (
    <SettingsSection title="Notifications">
      <NotificationSettings />
    </SettingsSection>
  );
}

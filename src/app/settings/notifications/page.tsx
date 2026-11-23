import SettingsSection from "@/components/settings/SettingsSection";
import NotificationSettings from "@/components/notifications/NotificationSettings";
export default function Page() {
  return (
    <SettingsSection title="Notifications">
      <NotificationSettings />
    </SettingsSection>
  );
}

import SettingsSection from "@/components/settings/SettingsSection";
import EmailSettings from "@/components/settings/EmailSettings";
export default function Page() {
  return (
    <SettingsSection title="Email">
      <EmailSettings />
    </SettingsSection>
  );
}

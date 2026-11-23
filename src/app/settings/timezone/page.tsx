import SettingsSection from "@/components/settings/SettingsSection";
import TimeZoneSettings from "@/components/settings/TimeZoneSettings";
export default function Page() {
  return (
    <SettingsSection title="Display timezone">
      <TimeZoneSettings />
    </SettingsSection>
  );
}

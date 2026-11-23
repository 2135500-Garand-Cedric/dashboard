import SettingsSection from "@/components/settings/SettingsSection";
import BirthdaySettings from "@/components/calendar/BirthdaySettings";
export default function Page() {
  return (
    <SettingsSection title="Birthdays">
      <BirthdaySettings />
    </SettingsSection>
  );
}

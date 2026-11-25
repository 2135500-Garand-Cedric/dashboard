import SettingsSection from "@/components/settings/SettingsSection";
import PeopleManager from "@/components/settings/PeopleManager";

export default function Page() {
  return (
    <SettingsSection title="People">
      <PeopleManager />
    </SettingsSection>
  );
}

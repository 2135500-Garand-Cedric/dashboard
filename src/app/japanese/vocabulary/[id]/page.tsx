import JapaneseAccess from "@/components/JapaneseAccess";
import PageClient from "./PageClient";
export default function Page() {
  return (
    <JapaneseAccess capability="japanese.vocabulary.read">
      <PageClient />
    </JapaneseAccess>
  );
}

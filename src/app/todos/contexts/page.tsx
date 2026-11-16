import { redirect } from "next/navigation";
export default function DirectoryRedirect() {
  redirect("/todos/manage#contexts");
}

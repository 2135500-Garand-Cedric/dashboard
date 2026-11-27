import { requireOwnerPage } from "@/lib/accounts/owner-page";
import ProjectList from "@/components/projects/ProjectList";
export default async function ProjectsPage() {
  await requireOwnerPage();
  return <ProjectList />;
}

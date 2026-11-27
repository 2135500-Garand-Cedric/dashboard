import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { notFound } from "next/navigation";
import ProjectWorkspace from "@/components/projects/ProjectWorkspace";
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <ProjectWorkspace id={Number(id)} />;
}

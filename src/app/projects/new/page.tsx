"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProjectEditor from "@/components/projects/ProjectEditor";
export default function NewProjectPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8 pt-12 md:pt-2">
      <Link
        href="/projects"
        className="inline-block rounded-lg border border-card-border px-4 py-2"
      >
        ← Back
      </Link>
      <h1 className="text-2xl font-bold">Create project</h1>
      <ProjectEditor
        onSaved={(project) => router.push(`/projects/${project.id}`)}
        onCancel={() => router.push("/projects")}
      />
    </div>
  );
}

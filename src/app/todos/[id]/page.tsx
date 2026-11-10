"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TaskDetails from "@/components/work/TaskDetails";
export default function TodoPage() {
  const params = useParams(), router = useRouter(), query = useSearchParams();
  const requested = query.get("returnTo") || "/todos";
  const back = /^\/todos(?:\?[^#]*)?$/.test(requested) ? requested : "/todos";
  return <div className="mx-auto pt-12 md:pt-6 min-w-0 max-w-[1600px] rounded-xl border border-card-border bg-card-bg"><TaskDetails key={String(params.id)} todoId={Number(params.id)} onClose={() => router.push(back)} /></div>;
}

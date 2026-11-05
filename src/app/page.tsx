import Dashboard from "@/components/Dashboard";
import ProtectedLayout from "@/components/ProtectedLayout";

export default function HomePage() {
  return <ProtectedLayout><Dashboard /></ProtectedLayout>;
}

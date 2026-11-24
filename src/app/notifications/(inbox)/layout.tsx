import ProtectedLayout from "@/components/ProtectedLayout";
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}

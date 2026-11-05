import ProtectedLayout from "@/components/ProtectedLayout";
import FinanceNavigation from "@/components/finance/FinanceNavigation";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout><div className={`w-full min-w-0 space-y-6 pb-6 ${process.env.NODE_ENV === "development" ? "pt-24 md:pt-6" : "pt-12 md:pt-2"}`}><h1 className="text-3xl font-bold">Finance</h1><FinanceNavigation />{children}</div></ProtectedLayout>;
}

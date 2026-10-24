import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";

// صفحة السوق: /us أو /sa
export default async function MarketPage({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  if (market !== "us" && market !== "sa") notFound();
  return <Dashboard market={market} />;
}

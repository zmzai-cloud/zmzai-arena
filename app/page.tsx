import { TrustBanner } from "@/components/TrustBanner";
import { KpiCards } from "@/components/KpiCards";
import { Leaderboard } from "@/components/Leaderboard";

export default function Home() {
  return (
    <>
      <TrustBanner />
      <KpiCards />
      <Leaderboard />
    </>
  );
}

import { TrustBanner } from "@/components/TrustBanner";
import { KpiCards } from "@/components/KpiCards";
import { Leaderboard } from "@/components/Leaderboard";
import { StressTest } from "@/components/StressTest";

export default function Home() {
  return (
    <>
      <TrustBanner />
      <KpiCards />
      <Leaderboard />
      <StressTest />
    </>
  );
}

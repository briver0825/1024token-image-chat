import { MarketPageClient } from "@/components/chat/market-page-client";
import { marketItemToResponse } from "@/lib/server/market-api";
import { getDefaultMarketStore } from "@/lib/server/market-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const result = await getDefaultMarketStore().listMarketItems({
    limit: 24,
  });

  return (
    <MarketPageClient
      initialItems={result.items.map(marketItemToResponse)}
      initialNextCursor={result.nextCursor}
    />
  );
}

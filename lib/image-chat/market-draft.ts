import type { MarketDraft } from "@/lib/image-chat/types";

export const MARKET_DRAFT_STORAGE_KEY = "image-chat.market-draft";

export function createMarketDraft(input: Omit<MarketDraft, "createdAt">): MarketDraft {
  return {
    ...input,
    createdAt: new Date().toISOString(),
  };
}

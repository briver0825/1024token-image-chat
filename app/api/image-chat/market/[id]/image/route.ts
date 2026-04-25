import {
  createMarketErrorResponse,
  MarketRequestError,
} from "@/lib/server/market-api";
import { getDefaultMarketStore } from "@/lib/server/market-store";

export const runtime = "nodejs";

type MarketItemImageRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: MarketItemImageRouteContext
) {
  const { id } = await params;
  const store = getDefaultMarketStore();
  const item = await store.getMarketItem(id);

  if (!item) {
    return createMarketErrorResponse(
      new MarketRequestError(404, "not_found", "市场作品不存在。")
    );
  }

  const imageBuffer = await store.readMarketItemImage(item);

  return new Response(new Uint8Array(imageBuffer), {
    headers: {
      "content-type": item.imageMimeType,
      "content-length": String(imageBuffer.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

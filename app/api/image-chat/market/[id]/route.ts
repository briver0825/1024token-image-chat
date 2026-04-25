import {
  createMarketErrorResponse,
  MarketRequestError,
} from "@/lib/server/market-api";
import { getDefaultMarketStore } from "@/lib/server/market-store";

export const runtime = "nodejs";

type MarketItemRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getAdminToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-image-chat-admin-token")?.trim() ?? "";
}

export async function DELETE(
  request: Request,
  { params }: MarketItemRouteContext
) {
  const configuredToken = process.env.IMAGE_CHAT_MARKET_ADMIN_TOKEN?.trim();
  const requestToken = getAdminToken(request);

  if (!configuredToken || requestToken !== configuredToken) {
    return createMarketErrorResponse(
      new MarketRequestError(401, "unauthorized", "管理员口令无效。")
    );
  }

  const { id } = await params;
  const deleted = await getDefaultMarketStore().deleteMarketItem(id);

  if (!deleted) {
    return createMarketErrorResponse(
      new MarketRequestError(404, "not_found", "市场作品不存在。")
    );
  }

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
    },
  });
}

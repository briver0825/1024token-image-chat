import {
  createMarketErrorResponse,
  createMarketItemResponse,
  jsonNoStoreHeaders,
  marketItemToResponse,
  MarketRequestError,
  parseCreateMarketItemForm,
} from "@/lib/server/market-api";
import { getDefaultMarketStore } from "@/lib/server/market-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const cursor = url.searchParams.get("cursor");
  const result = await getDefaultMarketStore().listMarketItems({
    limit,
    cursor,
  });

  return Response.json(
    {
      items: result.items.map(marketItemToResponse),
      nextCursor: result.nextCursor,
    },
    {
      headers: jsonNoStoreHeaders(),
    }
  );
}

export async function POST(request: Request) {
  try {
    const input = await parseCreateMarketItemForm(await request.formData());
    const item = await getDefaultMarketStore().createMarketItem(input);

    return Response.json(createMarketItemResponse(item), {
      status: 201,
      headers: jsonNoStoreHeaders(),
    });
  } catch (error) {
    if (error instanceof MarketRequestError) {
      return createMarketErrorResponse(error);
    }

    console.error(error);

    return Response.json(
      {
        error: {
          code: "provider_unavailable",
          message: "焚决市场暂时不可用，请稍后重试。",
        },
      },
      {
        status: 500,
        headers: jsonNoStoreHeaders(),
      }
    );
  }
}

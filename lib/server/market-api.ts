import { z } from "zod";

import {
  createProviderGenerationRequest,
  normalizeGenerationSettings,
} from "@/lib/image-chat/generation-settings";
import {
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  type CreateMarketItemResponse,
  type GenerationSettings,
  type MarketItemRecord,
  type MarketItemResponse,
} from "@/lib/image-chat/types";

const DEFAULT_MARKET_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MARKET_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const generationSettingsSchema = z.object({
  aspectRatio: z.enum(IMAGE_ASPECT_RATIO_OPTIONS).optional(),
  resolution: z.enum(IMAGE_RESOLUTION_OPTIONS).optional(),
  size: z.enum(IMAGE_SIZE_OPTIONS).optional(),
  quality: z.enum(IMAGE_QUALITY_OPTIONS).optional(),
  outputFormat: z.enum(IMAGE_OUTPUT_FORMAT_OPTIONS),
  outputCompression: z.number().int().min(0).max(100).optional(),
});

export class MarketRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: "invalid_request" | "not_found" | "unauthorized",
    message: string
  ) {
    super(message);
    this.name = "MarketRequestError";
  }
}

export function jsonNoStoreHeaders() {
  return {
    "cache-control": "no-store",
  };
}

export function createMarketErrorResponse(error: MarketRequestError) {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    {
      status: error.status,
      headers: jsonNoStoreHeaders(),
    }
  );
}

export function getMarketMaxImageBytes() {
  const configured = Number.parseInt(
    process.env.IMAGE_CHAT_MARKET_MAX_IMAGE_BYTES ?? "",
    10
  );

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MARKET_MAX_IMAGE_BYTES;
}

export function marketItemToResponse(item: MarketItemRecord): MarketItemResponse {
  return {
    id: item.id,
    prompt: item.prompt,
    settings: item.settings,
    ...(item.model ? { model: item.model } : {}),
    image: {
      url: `/api/image-chat/market/${item.id}/image`,
      mimeType: item.imageMimeType,
      width: item.imageWidth,
      height: item.imageHeight,
      bytes: item.imageBytes,
      sha256: item.imageSha256,
    },
    createdAt: item.createdAt,
  };
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseDimension(value: string, label: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new MarketRequestError(400, "invalid_request", `${label} 必须为正整数。`);
  }

  return parsed;
}

function parseSettings(value: string): GenerationSettings {
  try {
    const parsed = generationSettingsSchema.parse(JSON.parse(value));

    createProviderGenerationRequest(parsed);

    return normalizeGenerationSettings(parsed);
  } catch {
    throw new MarketRequestError(400, "invalid_request", "settings 格式无效。");
  }
}

function assertMarketImageFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File)) {
    throw new MarketRequestError(400, "invalid_request", "image 不能为空。");
  }

  const mimeType = value.type.toLowerCase();

  if (!SUPPORTED_MARKET_IMAGE_TYPES.has(mimeType)) {
    throw new MarketRequestError(
      400,
      "invalid_request",
      "image 仅支持 PNG、JPEG 或 WebP。"
    );
  }

  return value;
}

export async function parseCreateMarketItemForm(formData: FormData) {
  const prompt = getFormString(formData, "prompt");

  if (!prompt) {
    throw new MarketRequestError(400, "invalid_request", "prompt 不能为空。");
  }

  const settings = parseSettings(getFormString(formData, "settings"));
  const image = assertMarketImageFile(formData.get("image"));
  const maxImageBytes = getMarketMaxImageBytes();

  if (image.size > maxImageBytes) {
    throw new MarketRequestError(
      413,
      "invalid_request",
      `image 不能超过 ${maxImageBytes} 字节。`
    );
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());

  if (imageBuffer.byteLength > maxImageBytes) {
    throw new MarketRequestError(
      413,
      "invalid_request",
      `image 不能超过 ${maxImageBytes} 字节。`
    );
  }

  return {
    prompt,
    settings,
    model: getFormString(formData, "model") || undefined,
    imageBuffer,
    imageMimeType: image.type.toLowerCase(),
    imageWidth: parseDimension(getFormString(formData, "width"), "width"),
    imageHeight: parseDimension(getFormString(formData, "height"), "height"),
  };
}

export function createMarketItemResponse(
  item: MarketItemRecord
): CreateMarketItemResponse {
  return {
    item: marketItemToResponse(item),
  };
}

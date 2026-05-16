import { z } from "zod";

import {
  DEFAULT_IMAGE_QUALITY,
  createProviderGenerationRequest,
  resolveImageSize,
} from "@/lib/image-chat/generation-settings";
import {
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  MAX_REFERENCE_IMAGES,
  type GenerateErrorResponse,
  type GenerateRequest,
  type ParsedGenerateTaskRequest,
  type GenerateSuccessResponse,
  type ImageGenerationResult,
  type ImageOutputFormat,
} from "@/lib/image-chat/types";

const DEFAULT_PROVIDER_TIMEOUT_MS = 180_000;
const MIN_PROVIDER_TIMEOUT_MS = 1_000;

const referenceImageSchema = z.object({
  b64: z.string().transform((value) => value.trim()),
  mimeType: z.string().transform((value) => value.trim()),
});

const generateRequestSchema = z
  .object({
    prompt: z.string().transform((value) => value.trim()),
    aspectRatio: z.enum(IMAGE_ASPECT_RATIO_OPTIONS).optional(),
    resolution: z.enum(IMAGE_RESOLUTION_OPTIONS).optional(),
    size: z.enum(IMAGE_SIZE_OPTIONS).optional(),
    quality: z.enum(IMAGE_QUALITY_OPTIONS).optional(),
    outputFormat: z.enum(IMAGE_OUTPUT_FORMAT_OPTIONS),
    outputCompression: z.number().int().min(0).max(100).optional(),
    referenceImage: referenceImageSchema.optional(),
    referenceImages: z.array(referenceImageSchema).max(MAX_REFERENCE_IMAGES).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt 不能为空",
        path: ["prompt"],
      });
    }

    if (!value.aspectRatio && !value.size) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "aspectRatio 不能为空",
        path: ["aspectRatio"],
      });
    }

    if (!value.resolution && !value.size) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolution 不能为空",
        path: ["resolution"],
      });
    }

    const referenceImages = [
      ...(value.referenceImage ? [value.referenceImage] : []),
      ...(value.referenceImages ?? []),
    ];

    if (referenceImages.length > MAX_REFERENCE_IMAGES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `referenceImages 最多支持 ${MAX_REFERENCE_IMAGES} 张`,
        path: ["referenceImages"],
      });
    }

    referenceImages.forEach((referenceImage, index) => {
      if (!referenceImage.b64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "referenceImages.b64 不能为空",
          path: ["referenceImages", index, "b64"],
        });
      }

      if (!/^image\/(png|jpeg|webp)$/i.test(referenceImage.mimeType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "referenceImages.mimeType 仅支持 png/jpeg/webp",
          path: ["referenceImages", index, "mimeType"],
        });
      }
    });
  });

export class InputValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: unknown
  ) {
    const providerMessage =
      extractProviderErrorMessage(body) ??
      `Provider request failed with status ${status}`;

    super(providerMessage);
    this.name = "ProviderHttpError";
  }
}

function compactErrorMessage(message: string) {
  return message.trim();
}

function extractStringField(
  body: Record<string, unknown>,
  fieldName: string
) {
  const value = body[fieldName];

  return typeof value === "string" ? compactErrorMessage(value) : null;
}

function extractProviderErrorMessage(body: unknown): string | null {
  if (typeof body === "string") {
    const message = compactErrorMessage(body);

    return message || null;
  }

  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const directMessage =
    extractStringField(record, "message") ??
    extractStringField(record, "detail") ??
    extractStringField(record, "error_description");

  if (directMessage) {
    return directMessage;
  }

  const errorValue = record.error;

  if (typeof errorValue === "string") {
    const message = compactErrorMessage(errorValue);

    return message || null;
  }

  if (errorValue && typeof errorValue === "object") {
    const errorRecord = errorValue as Record<string, unknown>;

    return (
      extractStringField(errorRecord, "message") ??
      extractStringField(errorRecord, "detail") ??
      extractStringField(errorRecord, "code")
    );
  }

  return null;
}

function createProviderUnavailableMessage(reason?: string) {
  const normalizedReason = reason ? compactErrorMessage(reason) : "";

  if (!normalizedReason) {
    return "图片服务暂时不可用，请稍后重试。";
  }

  return `图片服务暂时不可用：${normalizedReason}`;
}

export function parseGenerateRequest(input: unknown): ParsedGenerateTaskRequest {
  const result = generateRequestSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.issues[0];
    const pathLabel =
      typeof issue?.path?.[0] === "string" ? `${issue.path[0]}: ` : "";

    throw new InputValidationError(
      `${pathLabel}${issue?.message ?? "invalid_request"}`
    );
  }

  const parsed = result.data;
  const providerSettings = createProviderGenerationRequest({
    ...(parsed.size ? { size: parsed.size } : {}),
    ...(parsed.aspectRatio ? { aspectRatio: parsed.aspectRatio } : {}),
    ...(parsed.resolution ? { resolution: parsed.resolution } : {}),
    outputFormat: parsed.outputFormat,
    ...(parsed.quality ? { quality: parsed.quality } : {}),
  });
  const referenceImages = [
    ...(parsed.referenceImage ? [parsed.referenceImage] : []),
    ...(parsed.referenceImages ?? []),
  ];

  return {
    prompt: parsed.prompt,
    aspectRatio: providerSettings.aspectRatio,
    resolution: providerSettings.resolution,
    outputFormat: providerSettings.outputFormat,
    size: providerSettings.size,
    quality: providerSettings.quality,
    ...(referenceImages.length ? { referenceImages } : {}),
  };
}

export function stripReferenceImage(
  request: ParsedGenerateTaskRequest
): GenerateRequest {
  return {
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    outputFormat: request.outputFormat,
    size: request.size,
    quality: request.quality ?? DEFAULT_IMAGE_QUALITY,
  };
}

function outputFormatToMimeType(format: ImageOutputFormat) {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}

function parseSize(size: GenerateRequest["size"]) {
  const [width, height] = size.split("x").map((value) => Number.parseInt(value, 10));

  return {
    width,
    height,
  };
}

export function mapProviderResult({
  providerData,
  request,
  createdAt,
  requestId,
  latencyMs,
}: {
  providerData: {
    created?: number;
    data?: Array<{
      b64_json?: string;
    }>;
  };
  request: GenerateRequest;
  createdAt: string;
  requestId?: string;
  latencyMs?: number;
}): ImageGenerationResult {
  const imagePayload = providerData.data?.[0]?.b64_json;

  if (!imagePayload) {
    throw new ProviderHttpError(502, {
      error: {
        message: "Provider response did not include image data.",
      },
    });
  }

  const { width, height } = parseSize(request.size);

  return {
    image: {
      b64: imagePayload,
      mimeType: outputFormatToMimeType(request.outputFormat),
      width,
      height,
    },
    params: request,
    createdAt,
    providerMeta: {
      ...(providerData.created ? { created: providerData.created } : {}),
      ...(requestId ? { requestId } : {}),
      ...(typeof latencyMs === "number" ? { latencyMs } : {}),
    },
  };
}

export function mapProviderSuccess({
  providerData,
  request,
  assistantMessageId,
  createdAt,
  requestId,
  latencyMs,
}: {
  providerData: {
    created?: number;
    data?: Array<{
      b64_json?: string;
    }>;
  };
  request: GenerateRequest;
  assistantMessageId: string;
  createdAt: string;
  requestId?: string;
  latencyMs?: number;
}): GenerateSuccessResponse {
  return {
    assistantMessageId,
    ...mapProviderResult({
      providerData,
      request,
      createdAt,
      requestId,
      latencyMs,
    }),
  };
}

export async function normalizeProviderError(error: unknown): Promise<{
  status: number;
  error: GenerateErrorResponse["error"];
}> {
  if (error instanceof InputValidationError) {
    return {
      status: 400,
      error: {
        code: "invalid_request",
        message: error.message,
      },
    };
  }

  if (error instanceof ProviderHttpError) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: error.status,
        error: {
          code: "unauthorized",
          message: error.message
            ? `上游鉴权失败：${error.message}`
            : "上游鉴权失败，请检查 API Key 或 Base URL。",
        },
      };
    }

    if (error.status === 429) {
      return {
        status: 429,
        error: {
          code: "rate_limited",
          message: error.message
            ? `图片生成过于频繁：${error.message}`
            : "图片生成过于频繁，请稍后再试。",
        },
      };
    }

    if (error.status >= 400 && error.status < 500) {
      return {
        status: error.status,
        error: {
          code: "invalid_request",
          message: error.message || "图片生成请求无效，请检查输入内容。",
        },
      };
    }

    return {
      status: 502,
      error: {
        code: "provider_unavailable",
        message: createProviderUnavailableMessage(error.message),
      },
    };
  }

  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return {
      status: 504,
      error: {
        code: "provider_timeout",
        message: "图片生成超时，请稍后重试。",
      },
    };
  }

  return {
    status: 502,
    error: {
      code: "provider_unavailable",
      message: createProviderUnavailableMessage(
        error instanceof Error ? error.message : undefined
      ),
    },
  };
}

export function resolveProviderTimeoutMs(rawValue?: string) {
  if (!rawValue) {
    return DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < MIN_PROVIDER_TIMEOUT_MS) {
    return DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  return parsedValue;
}

export function buildProviderRequestBody(
  model: string,
  request: GenerateRequest
) {
  return {
    model,
    prompt: request.prompt,
    size: request.size ?? resolveImageSize(request),
    quality: request.quality ?? DEFAULT_IMAGE_QUALITY,
    output_format: request.outputFormat,
  };
}

export function buildImageGenerationEndpoint(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL("images/generations", normalizedBaseUrl).toString();
}

export function buildImageEditEndpoint(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL("images/edits", normalizedBaseUrl).toString();
}

function base64ToUint8Array(base64: string) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function mimeTypeToExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

export function buildProviderRequestInit(
  model: string,
  request: ParsedGenerateTaskRequest
): {
  endpointPath: "generations" | "edits";
  headers?: HeadersInit;
  body: BodyInit;
} {
  const baseRequest = stripReferenceImage(request);
  const referenceImages = [
    ...(request.referenceImage ? [request.referenceImage] : []),
    ...(request.referenceImages ?? []),
  ];

  if (referenceImages.length === 0) {
    return {
      endpointPath: "generations",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(buildProviderRequestBody(model, baseRequest)),
    };
  }

  const formData = new FormData();

  formData.set("model", model);
  formData.set("prompt", request.prompt);
  formData.set("size", baseRequest.size);
  formData.set("quality", baseRequest.quality);
  formData.set("output_format", request.outputFormat);

  referenceImages.forEach((referenceImage, index) => {
    formData.append(
      "image[]",
      new File(
        [base64ToUint8Array(referenceImage.b64)],
        `reference-${index + 1}.${mimeTypeToExtension(referenceImage.mimeType)}`,
        {
          type: referenceImage.mimeType,
        }
      )
    );
  });

  return {
    endpointPath: "edits",
    body: formData,
  };
}

export async function parseProviderResponse(response: Response) {
  const text = await response.text();
  let body: unknown = {};

  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch (error) {
      if (!response.ok) {
        body = {
          error: {
            message: text,
          },
        };
      } else {
        throw new ProviderHttpError(502, {
          error: {
            message:
              error instanceof Error
                ? `Provider response was not valid JSON: ${error.message}`
                : "Provider response was not valid JSON.",
          },
        });
      }
    }
  }

  if (!response.ok) {
    throw new ProviderHttpError(response.status, body);
  }

  return body as {
    created?: number;
    data?: Array<{
      b64_json?: string;
    }>;
  };
}

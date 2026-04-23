import { z } from "zod";

import {
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  type GenerateErrorResponse,
  type GenerateRequest,
  type GenerateTaskRequest,
  type GenerateSuccessResponse,
  type ImageGenerationResult,
  type ImageOutputFormat,
} from "@/lib/image-chat/types";

const DEFAULT_PROVIDER_TIMEOUT_MS = 180_000;
const MIN_PROVIDER_TIMEOUT_MS = 1_000;

const generateRequestSchema = z
  .object({
    prompt: z.string().transform((value) => value.trim()),
    size: z.enum(IMAGE_SIZE_OPTIONS),
    quality: z.enum(IMAGE_QUALITY_OPTIONS),
    outputFormat: z.enum(IMAGE_OUTPUT_FORMAT_OPTIONS),
    outputCompression: z.number().int().min(0).max(100).optional(),
    referenceImage: z
      .object({
        b64: z.string().transform((value) => value.trim()),
        mimeType: z.string().transform((value) => value.trim()),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt 不能为空",
        path: ["prompt"],
      });
    }

    if (value.outputFormat === "png" && value.outputCompression !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "compression 仅支持 jpeg/webp",
        path: ["outputCompression"],
      });
    }

    if (value.referenceImage) {
      if (!value.referenceImage.b64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "referenceImage.b64 不能为空",
          path: ["referenceImage", "b64"],
        });
      }

      if (!/^image\/(png|jpeg|webp)$/i.test(value.referenceImage.mimeType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "referenceImage.mimeType 仅支持 png/jpeg/webp",
          path: ["referenceImage", "mimeType"],
        });
      }
    }
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
      typeof body === "object" &&
      body &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : `Provider request failed with status ${status}`;

    super(providerMessage);
    this.name = "ProviderHttpError";
  }
}

export function parseGenerateRequest(input: unknown): GenerateTaskRequest {
  const result = generateRequestSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.issues[0];
    const pathLabel =
      typeof issue?.path?.[0] === "string" ? `${issue.path[0]}: ` : "";

    throw new InputValidationError(
      `${pathLabel}${issue?.message ?? "invalid_request"}`
    );
  }

  return result.data;
}

export function stripReferenceImage(
  request: GenerateTaskRequest
): GenerateRequest {
  return {
    prompt: request.prompt,
    size: request.size,
    quality: request.quality,
    outputFormat: request.outputFormat,
    ...(request.outputCompression !== undefined
      ? { outputCompression: request.outputCompression }
      : {}),
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
          message: "上游鉴权失败，请检查 API Key 或 Base URL。",
        },
      };
    }

    if (error.status === 429) {
      return {
        status: 429,
        error: {
          code: "rate_limited",
          message: "图片生成过于频繁，请稍后再试。",
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
      message: "图片服务暂时不可用，请稍后重试。",
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
    size: request.size,
    quality: request.quality,
    output_format: request.outputFormat,
    ...(request.outputCompression !== undefined
      ? { output_compression: request.outputCompression }
      : {}),
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
  request: GenerateTaskRequest
): {
  endpointPath: "generations" | "edits";
  headers?: HeadersInit;
  body: BodyInit;
} {
  const baseRequest = stripReferenceImage(request);

  if (!request.referenceImage) {
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
  formData.set("size", request.size);
  formData.set("quality", request.quality);
  formData.set("output_format", request.outputFormat);

  if (request.outputCompression !== undefined) {
    formData.set("output_compression", String(request.outputCompression));
  }

  formData.set(
    "image",
    new File(
      [base64ToUint8Array(request.referenceImage.b64)],
      `reference.${mimeTypeToExtension(request.referenceImage.mimeType)}`,
      {
        type: request.referenceImage.mimeType,
      }
    )
  );

  return {
    endpointPath: "edits",
    body: formData,
  };
}

export async function parseProviderResponse(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

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

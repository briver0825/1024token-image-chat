import { describe, expect, it } from "vitest";

import {
  ProviderHttpError,
  buildProviderRequestInit,
  mapProviderSuccess,
  normalizeProviderError,
  parseGenerateRequest,
  parseProviderResponse,
  resolveProviderTimeoutMs,
  type GenerateRequest,
} from "@/lib/server/image-generation";

const validRequest: GenerateRequest = {
  prompt: "一只坐在霓虹雨夜里的黑猫",
  size: "1024x1024",
  quality: "high",
  outputFormat: "png",
};

describe("parseGenerateRequest", () => {
  it("trims prompt and keeps valid options", () => {
    expect(
      parseGenerateRequest({
        ...validRequest,
        prompt: "  一只坐在霓虹雨夜里的黑猫  ",
      })
    ).toEqual(validRequest);
  });

  it("rejects blank prompt and unsupported options", () => {
    expect(() =>
      parseGenerateRequest({
        ...validRequest,
        prompt: "   ",
      })
    ).toThrow("prompt");

    expect(() =>
      parseGenerateRequest({
        ...validRequest,
        size: "800x800",
      })
    ).toThrow("size");
  });

  it("rejects compression when output format is png", () => {
    expect(() =>
      parseGenerateRequest({
        ...validRequest,
        outputCompression: 80,
      })
    ).toThrow("compression");
  });

  it("accepts up to 16 reference images and rejects extras", () => {
    const referenceImages = Array.from({ length: 16 }, (_, index) => ({
      b64: `cmVmZXJlbmNl-${index}`,
      mimeType: "image/png",
    }));

    expect(
      parseGenerateRequest({
        ...validRequest,
        referenceImages,
      })
    ).toMatchObject({
      ...validRequest,
      referenceImages,
    });

    expect(() =>
      parseGenerateRequest({
        ...validRequest,
        referenceImages: [
          ...referenceImages,
          {
            b64: "ZXh0cmE=",
            mimeType: "image/png",
          },
        ],
      })
    ).toThrow("16");
  });
});

describe("buildProviderRequestInit", () => {
  it("uses the official image[] multipart field for multiple reference images", () => {
    const requestInit = buildProviderRequestInit("gpt-image-2", {
      ...validRequest,
      referenceImages: [
        {
          b64: "Zmlyc3Q=",
          mimeType: "image/png",
        },
        {
          b64: "c2Vjb25k",
          mimeType: "image/jpeg",
        },
      ],
    });

    expect(requestInit.endpointPath).toBe("edits");
    expect(requestInit.body).toBeInstanceOf(FormData);

    const body = requestInit.body as FormData;
    const images = body.getAll("image[]");

    expect(images).toHaveLength(2);
    expect(body.get("image")).toBeNull();
    expect(images[0]).toBeInstanceOf(File);
    expect(images[1]).toBeInstanceOf(File);
    expect((images[0] as File).type).toBe("image/png");
    expect((images[1] as File).type).toBe("image/jpeg");
  });
});

describe("normalizeProviderError", () => {
  it("maps upstream 429 responses and keeps the provider reason", async () => {
    const error = new ProviderHttpError(429, {
      error: {
        message: "Too many requests",
      },
    });

    await expect(normalizeProviderError(error)).resolves.toEqual({
      status: 429,
      error: {
        code: "rate_limited",
        message: "图片生成过于频繁：Too many requests",
      },
    });
  });

  it("keeps the upstream message for provider-side failures", async () => {
    const error = new ProviderHttpError(500, {
      error: {
        message: "model gpt-image-x is not available for this account",
      },
    });

    await expect(normalizeProviderError(error)).resolves.toEqual({
      status: 502,
      error: {
        code: "provider_unavailable",
        message:
          "图片服务暂时不可用：model gpt-image-x is not available for this account",
      },
    });
  });

  it("keeps network error details for provider unavailable failures", async () => {
    await expect(
      normalizeProviderError(new TypeError("fetch failed: connect ECONNREFUSED"))
    ).resolves.toEqual({
      status: 502,
      error: {
        code: "provider_unavailable",
        message: "图片服务暂时不可用：fetch failed: connect ECONNREFUSED",
      },
    });
  });
});

describe("parseProviderResponse", () => {
  it("uses a non-JSON upstream error body as the provider failure reason", async () => {
    await expect(
      parseProviderResponse(
        new Response("upstream gateway refused the model request", {
          status: 502,
          statusText: "Bad Gateway",
        })
      )
    ).rejects.toThrow("upstream gateway refused the model request");
  });
});

describe("mapProviderSuccess", () => {
  it("normalizes provider image payloads into the app response", () => {
    expect(
      mapProviderSuccess({
        providerData: {
          created: 1_745_398_400,
          data: [{ b64_json: "ZmFrZS1pbWFnZQ==" }],
        },
        request: {
          ...validRequest,
          outputFormat: "webp",
          outputCompression: 75,
        },
        assistantMessageId: "assistant-1",
        createdAt: "2026-04-23T12:00:00.000Z",
      })
    ).toEqual({
      assistantMessageId: "assistant-1",
      image: {
        b64: "ZmFrZS1pbWFnZQ==",
        mimeType: "image/webp",
        width: 1024,
        height: 1024,
      },
      params: {
        ...validRequest,
        outputFormat: "webp",
        outputCompression: 75,
      },
      createdAt: "2026-04-23T12:00:00.000Z",
      providerMeta: {
        created: 1_745_398_400,
      },
    });
  });
});

describe("resolveProviderTimeoutMs", () => {
  it("uses a longer default timeout for image generation", () => {
    expect(resolveProviderTimeoutMs(undefined)).toBe(180_000);
  });

  it("accepts a valid env override and ignores invalid values", () => {
    expect(resolveProviderTimeoutMs("240000")).toBe(240_000);
    expect(resolveProviderTimeoutMs("oops")).toBe(180_000);
    expect(resolveProviderTimeoutMs("500")).toBe(180_000);
  });
});

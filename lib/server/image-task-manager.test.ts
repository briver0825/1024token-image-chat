import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createImageGenerationTask,
  getImageGenerationTaskStatus,
  resetImageGenerationTasksForTest,
} from "@/lib/server/image-task-manager";
import type {
  GenerateRequest,
  ProviderConnectionConfig,
} from "@/lib/image-chat/types";

const request: GenerateRequest = {
  prompt: "一只站在星际港口里的机械狐狸",
  size: "1024x1024",
  quality: "high",
  outputFormat: "png",
};

const providerConfig: ProviderConnectionConfig = {
  apiKey: "sk-test",
  baseUrl: "https://provider.example/v1",
  model: "gpt-image-2",
};

afterEach(() => {
  resetImageGenerationTasksForTest();
});

describe("image-task-manager", () => {
  it("returns queued immediately and later exposes a completed result", async () => {
    const created = createImageGenerationTask({
      request,
      providerConfig,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            created: 1_745_398_400,
            data: [{ b64_json: "ZmFrZS1pbWFnZQ==" }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_123",
            },
          }
        )
      ),
    });

    expect(created).toMatchObject({
      taskId: expect.any(String),
      status: "queued",
      createdAt: expect.any(String),
    });

    expect(getImageGenerationTaskStatus(created.taskId)).toMatchObject({
      taskId: created.taskId,
      status: expect.stringMatching(/queued|processing/),
    });

    await vi.waitFor(() => {
      expect(getImageGenerationTaskStatus(created.taskId)).toMatchObject({
        taskId: created.taskId,
        status: "completed",
        image: {
          b64: "ZmFrZS1pbWFnZQ==",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
        },
        params: request,
        providerMeta: {
          created: 1_745_398_400,
          requestId: "req_123",
        },
      });
    });
  });

  it("stores a normalized failed status when upstream returns an error", async () => {
    const created = createImageGenerationTask({
      request,
      providerConfig,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Too many requests",
            },
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      ),
    });

    await vi.waitFor(() => {
      expect(getImageGenerationTaskStatus(created.taskId)).toMatchObject({
        taskId: created.taskId,
        status: "failed",
        error: {
          code: "rate_limited",
          message: "图片生成过于频繁：Too many requests",
        },
      });
    });
  });

  it("uses the edits endpoint with multipart form data when reference images are provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          created: 1_745_398_400,
          data: [{ b64_json: "ZmFrZS1pbWFnZQ==" }],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const created = createImageGenerationTask({
      request: {
        ...request,
        referenceImages: [
          {
            b64: "ZmFrZS1yZWZlcmVuY2U=",
            mimeType: "image/png",
          },
          {
            b64: "c2Vjb25kLXJlZmVyZW5jZQ==",
            mimeType: "image/webp",
          },
        ],
      },
      providerConfig,
      fetchImpl,
    });

    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    const [endpoint, init] = fetchImpl.mock.calls[0] as [string, RequestInit];

    expect(endpoint).toBe("https://provider.example/v1/images/edits");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer sk-test",
    });
    expect(init.body).toBeInstanceOf(FormData);

    const body = init.body as FormData;
    const images = body.getAll("image[]");

    expect(body.get("model")).toBe("gpt-image-2");
    expect(body.get("prompt")).toBe(request.prompt);
    expect(body.get("size")).toBe(request.size);
    expect(body.get("quality")).toBe(request.quality);
    expect(body.get("output_format")).toBe(request.outputFormat);
    expect(body.get("image")).toBeNull();
    expect(images).toHaveLength(2);
    expect(images[0]).toBeInstanceOf(File);
    expect(images[1]).toBeInstanceOf(File);
    expect((images[0] as File).type).toBe("image/png");
    expect((images[1] as File).type).toBe("image/webp");

    await vi.waitFor(() => {
      expect(getImageGenerationTaskStatus(created.taskId)).toMatchObject({
        taskId: created.taskId,
        status: "completed",
      });
    });
  });
});

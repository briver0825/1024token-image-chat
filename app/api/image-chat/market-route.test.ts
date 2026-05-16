import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function setMarketDataDir() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "image-chat-market-api-"));
  tempDirs.push(dataDir);
  process.env.IMAGE_CHAT_MARKET_DATA_DIR = dataDir;
  process.env.IMAGE_CHAT_MARKET_MAX_IMAGE_BYTES = "32";
  process.env.IMAGE_CHAT_MARKET_ADMIN_TOKEN = "secret-token";
  vi.resetModules();
}

function createMarketForm(overrides: Partial<{
  prompt: string;
  settings: string;
  model: string;
  width: string;
  height: string;
  image: File;
}> = {}) {
  const formData = new FormData();

  formData.set("prompt", overrides.prompt ?? "霓虹雨夜中的机械猫");
  formData.set(
    "settings",
    overrides.settings ??
      JSON.stringify({
        size: "1024x1024",
        quality: "high",
        outputFormat: "png",
      })
  );
  formData.set("model", overrides.model ?? "gpt-image-2");
  formData.set("width", overrides.width ?? "1024");
  formData.set("height", overrides.height ?? "1024");
  formData.set(
    "image",
    overrides.image ??
      new File([Buffer.from("fake-png-image")], "image.png", {
        type: "image/png",
      })
  );

  return formData;
}

async function createMarketItem() {
  const { POST } = await import("@/app/api/image-chat/market/route");
  const response = await POST(
    {
      formData: async () => createMarketForm(),
    } as Request
  );
  const body = await response.json();

  return {
    response,
    body,
  };
}

beforeEach(async () => {
  await setMarketDataDir();
});

afterEach(async () => {
  delete process.env.IMAGE_CHAT_MARKET_DATA_DIR;
  delete process.env.IMAGE_CHAT_MARKET_MAX_IMAGE_BYTES;
  delete process.env.IMAGE_CHAT_MARKET_ADMIN_TOKEN;
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      })
    )
  );
});

describe("/api/image-chat/market", () => {
  it("creates a public market item and lists it with an image URL", async () => {
    const { GET } = await import("@/app/api/image-chat/market/route");
    const { response, body } = await createMarketItem();

    expect(response.status).toBe(201);
    expect(body.item).toMatchObject({
      prompt: "霓虹雨夜中的机械猫",
      model: "gpt-image-2",
      settings: {
        size: "1024x1024",
        quality: "high",
        outputFormat: "png",
      },
      image: {
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        bytes: 14,
      },
    });
    expect(body.item.image.url).toBe(
      `/api/image-chat/market/${body.item.id}/image`
    );

    const listResponse = await GET(
      new Request("http://localhost/api/image-chat/market?limit=10")
    );
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [
        {
          id: body.item.id,
          prompt: "霓虹雨夜中的机械猫",
        },
      ],
      nextCursor: null,
    });
  });

  it("rejects unsupported files and files over the configured byte limit", async () => {
    const { POST } = await import("@/app/api/image-chat/market/route");

    const unsupportedResponse = await POST(
      {
        formData: async () =>
          createMarketForm({
          image: new File(["plain text"], "note.txt", {
            type: "text/plain",
          }),
          }),
      } as Request
    );
    const oversizedResponse = await POST(
      {
        formData: async () =>
          createMarketForm({
          image: new File([Buffer.alloc(33, 1)], "image.png", {
            type: "image/png",
          }),
          }),
      } as Request
    );

    expect(unsupportedResponse.status).toBe(400);
    await expect(unsupportedResponse.json()).resolves.toMatchObject({
      error: {
        code: "invalid_request",
      },
    });
    expect(oversizedResponse.status).toBe(413);
  });
});

describe("/api/image-chat/market/[id]", () => {
  it("serves item images and allows admin-token soft deletion", async () => {
    const { body } = await createMarketItem();
    const { GET: GET_IMAGE } = await import(
      "@/app/api/image-chat/market/[id]/image/route"
    );
    const { DELETE } = await import("@/app/api/image-chat/market/[id]/route");
    const { GET } = await import("@/app/api/image-chat/market/route");

    const imageResponse = await GET_IMAGE(
      new Request(`http://localhost${body.item.image.url}`),
      {
        params: Promise.resolve({ id: body.item.id }),
      }
    );
    await expect(imageResponse.text()).resolves.toBe("fake-png-image");

    const rejectedDelete = await DELETE(
      new Request(`http://localhost/api/image-chat/market/${body.item.id}`, {
        method: "DELETE",
        headers: {
          "x-image-chat-admin-token": "wrong-token",
        },
      }),
      {
        params: Promise.resolve({ id: body.item.id }),
      }
    );
    expect(rejectedDelete.status).toBe(401);

    const acceptedDelete = await DELETE(
      new Request(`http://localhost/api/image-chat/market/${body.item.id}`, {
        method: "DELETE",
        headers: {
          "x-image-chat-admin-token": "secret-token",
        },
      }),
      {
        params: Promise.resolve({ id: body.item.id }),
      }
    );
    expect(acceptedDelete.status).toBe(204);

    const listResponse = await GET(
      new Request("http://localhost/api/image-chat/market?limit=10")
    );
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });
  });
});

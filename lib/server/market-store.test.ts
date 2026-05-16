import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMarketStore,
  type CreateMarketItemInput,
} from "@/lib/server/market-store";

const baseInput = {
  prompt: "霓虹雨夜中的机械猫",
  settings: {
    size: "1024x1024",
    quality: "high",
    outputFormat: "png",
  },
  model: "gpt-image-2",
  imageBuffer: Buffer.from("fake-png-image"),
  imageMimeType: "image/png",
  imageWidth: 1024,
  imageHeight: 1024,
} satisfies CreateMarketItemInput;

const tempDirs: string[] = [];

async function createTempStore() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "image-chat-market-"));
  tempDirs.push(dataDir);

  return {
    dataDir,
    store: createMarketStore({ dataDir }),
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      })
    )
  );
});

describe("createMarketStore", () => {
  it("uses a project-local data directory by default when no env override is configured", async () => {
    const originalCwd = process.cwd();
    const originalDataDir = process.env.IMAGE_CHAT_MARKET_DATA_DIR;
    const cwd = await mkdtemp(path.join(tmpdir(), "image-chat-market-cwd-"));
    tempDirs.push(cwd);

    delete process.env.IMAGE_CHAT_MARKET_DATA_DIR;
    process.chdir(cwd);

    try {
      const store = createMarketStore();

      expect(store.dataDir).toBe(
        path.join(process.cwd(), "data", "image-chat-market")
      );
      await expect(stat(store.imagesDir)).resolves.toMatchObject({
        isDirectory: expect.any(Function),
      });
    } finally {
      process.chdir(originalCwd);

      if (originalDataDir === undefined) {
        delete process.env.IMAGE_CHAT_MARKET_DATA_DIR;
      } else {
        process.env.IMAGE_CHAT_MARKET_DATA_DIR = originalDataDir;
      }
    }
  });

  it("creates a market item, stores the image file, and lists public items newest first", async () => {
    const { dataDir, store } = await createTempStore();

    const older = await store.createMarketItem({
      ...baseInput,
      createdAt: "2026-04-26T08:00:00.000Z",
    });
    const newer = await store.createMarketItem({
      ...baseInput,
      prompt: "暮色里的未来城市",
      imageBuffer: Buffer.from("different-png-image"),
      createdAt: "2026-04-26T09:00:00.000Z",
    });

    await expect(
      readFile(path.join(dataDir, "images", older.imageFileName), "utf8")
    ).resolves.toBe("fake-png-image");

    await expect(store.listMarketItems({ limit: 10 })).resolves.toMatchObject({
      items: [
        {
          id: newer.id,
          prompt: "暮色里的未来城市",
          imageMimeType: "image/png",
          imageWidth: 1024,
          imageHeight: 1024,
          model: "gpt-image-2",
        },
        {
          id: older.id,
          prompt: "霓虹雨夜中的机械猫",
        },
      ],
      nextCursor: null,
    });
  });

  it("deduplicates repeated image hashes without creating another public listing", async () => {
    const { store } = await createTempStore();

    const first = await store.createMarketItem({
      ...baseInput,
      createdAt: "2026-04-26T08:00:00.000Z",
    });
    const duplicate = await store.createMarketItem({
      ...baseInput,
      prompt: "同一张图的另一个提示词",
      createdAt: "2026-04-26T09:00:00.000Z",
    });

    expect(duplicate.id).toBe(first.id);
    await expect(store.listMarketItems({ limit: 10 })).resolves.toMatchObject({
      items: [
        {
          id: first.id,
          prompt: "霓虹雨夜中的机械猫",
        },
      ],
      nextCursor: null,
    });
  });

  it("paginates visible items and excludes soft-deleted records", async () => {
    const { store } = await createTempStore();
    const first = await store.createMarketItem({
      ...baseInput,
      imageBuffer: Buffer.from("first"),
      createdAt: "2026-04-26T08:00:00.000Z",
    });
    const second = await store.createMarketItem({
      ...baseInput,
      prompt: "第二张",
      imageBuffer: Buffer.from("second"),
      createdAt: "2026-04-26T09:00:00.000Z",
    });
    const third = await store.createMarketItem({
      ...baseInput,
      prompt: "第三张",
      imageBuffer: Buffer.from("third"),
      createdAt: "2026-04-26T10:00:00.000Z",
    });

    await store.deleteMarketItem(second.id);

    await expect(store.getMarketItem(second.id)).resolves.toBeNull();
    await expect(store.listMarketItems({ limit: 1 })).resolves.toMatchObject({
      items: [
        {
          id: third.id,
          prompt: "第三张",
        },
      ],
      nextCursor: "1",
    });
    await expect(store.listMarketItems({ limit: 1, cursor: "1" })).resolves.toMatchObject({
      items: [
        {
          id: first.id,
          prompt: "霓虹雨夜中的机械猫",
        },
      ],
      nextCursor: null,
    });
  });
});

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  type GenerationSettings,
  type ImageOutputFormat,
  type MarketItemRecord,
} from "@/lib/image-chat/types";
import { createUuid } from "@/lib/shared/uuid";

function getDefaultMarketDataDir() {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "image-chat-market"
  );
}

const DEFAULT_LIST_LIMIT = 24;
const MAX_LIST_LIMIT = 60;

type SqliteRunResult = {
  changes: number;
};

type SqliteStatement = {
  all: (...values: unknown[]) => unknown[];
  get: (...values: unknown[]) => unknown;
  run: (...values: unknown[]) => SqliteRunResult;
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

type DatabaseSyncConstructor = new (filename: string) => SqliteDatabase;
const SqliteDatabaseSync = DatabaseSync as DatabaseSyncConstructor;

type MarketItemRow = {
  id: string;
  prompt: string;
  settings_json: string;
  model: string | null;
  image_file_name: string;
  image_mime_type: string;
  image_bytes: number;
  image_width: number;
  image_height: number;
  image_sha256: string;
  created_at: string;
  deleted_at: string | null;
};

export type CreateMarketItemInput = {
  prompt: string;
  settings: GenerationSettings;
  model?: string;
  imageBuffer: Buffer;
  imageMimeType: string;
  imageWidth: number;
  imageHeight: number;
  createdAt?: string;
};

export type ListMarketItemsOptions = {
  limit?: number;
  cursor?: string | null;
};

export type ListMarketItemsResult = {
  items: MarketItemRecord[];
  nextCursor: string | null;
};

type MarketStoreOptions = {
  dataDir?: string;
};

function isMarketItemRow(row: unknown): row is MarketItemRow {
  return Boolean(row && typeof row === "object" && "id" in row);
}

function parseSettings(settingsJson: string): GenerationSettings {
  const parsed = JSON.parse(settingsJson) as Partial<GenerationSettings>;

  return {
    size: IMAGE_SIZE_OPTIONS.includes(parsed.size as never)
      ? (parsed.size as GenerationSettings["size"])
      : "1024x1024",
    quality: IMAGE_QUALITY_OPTIONS.includes(parsed.quality as never)
      ? (parsed.quality as GenerationSettings["quality"])
      : "high",
    outputFormat: IMAGE_OUTPUT_FORMAT_OPTIONS.includes(
      parsed.outputFormat as never
    )
      ? (parsed.outputFormat as ImageOutputFormat)
      : "png",
    ...(typeof parsed.outputCompression === "number"
      ? { outputCompression: parsed.outputCompression }
      : {}),
  };
}

function mapMarketItemRow(row: MarketItemRow): MarketItemRecord {
  return {
    id: row.id,
    prompt: row.prompt,
    settings: parseSettings(row.settings_json),
    ...(row.model ? { model: row.model } : {}),
    imageFileName: row.image_file_name,
    imageMimeType: row.image_mime_type,
    imageBytes: row.image_bytes,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    imageSha256: row.image_sha256,
    createdAt: row.created_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  };
}

function normalizeCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

function getImageExtension(mimeType: string) {
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

function createImageHash(buffer: Buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function resolveDataDir(dataDir?: string) {
  const configuredDataDir =
    dataDir ?? process.env.IMAGE_CHAT_MARKET_DATA_DIR?.trim();

  if (!configuredDataDir) {
    return getDefaultMarketDataDir();
  }

  if (path.isAbsolute(configuredDataDir)) {
    return configuredDataDir;
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), configuredDataDir);
}

function createDatabase(databasePath: string) {
  const database = new SqliteDatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS market_items (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      model TEXT,
      image_file_name TEXT NOT NULL,
      image_mime_type TEXT NOT NULL,
      image_bytes INTEGER NOT NULL,
      image_width INTEGER NOT NULL,
      image_height INTEGER NOT NULL,
      image_sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS market_items_visible_created_idx
      ON market_items (deleted_at, created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS market_items_active_hash_idx
      ON market_items (image_sha256, deleted_at);
  `);

  return database;
}

export function createMarketStore(options: MarketStoreOptions = {}) {
  const dataDir = resolveDataDir(options.dataDir);
  const imagesDir = path.join(dataDir, "images");

  mkdirSync(imagesDir, {
    recursive: true,
  });

  const database = createDatabase(path.join(dataDir, "market.sqlite"));

  return {
    dataDir,
    imagesDir,

    async createMarketItem(input: CreateMarketItemInput) {
      const imageSha256 = createImageHash(input.imageBuffer);
      const existingRow = database
        .prepare(
          `
            SELECT *
            FROM market_items
            WHERE image_sha256 = ? AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `
        )
        .get(imageSha256);

      if (isMarketItemRow(existingRow)) {
        return mapMarketItemRow(existingRow);
      }

      const id = createUuid();
      const createdAt = input.createdAt ?? new Date().toISOString();
      const imageFileName = `${id}.${getImageExtension(input.imageMimeType)}`;

      await writeFile(path.join(imagesDir, imageFileName), input.imageBuffer);

      database
        .prepare(
          `
            INSERT INTO market_items (
              id,
              prompt,
              settings_json,
              model,
              image_file_name,
              image_mime_type,
              image_bytes,
              image_width,
              image_height,
              image_sha256,
              created_at,
              deleted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
          `
        )
        .run(
          id,
          input.prompt,
          JSON.stringify(input.settings),
          input.model ?? null,
          imageFileName,
          input.imageMimeType,
          input.imageBuffer.byteLength,
          input.imageWidth,
          input.imageHeight,
          imageSha256,
          createdAt
        );

      const created = await this.getMarketItem(id);

      if (!created) {
        throw new Error("市场作品创建失败。");
      }

      return created;
    },

    async listMarketItems(
      options: ListMarketItemsOptions = {}
    ): Promise<ListMarketItemsResult> {
      const limit = normalizeLimit(options.limit);
      const offset = normalizeCursor(options.cursor);
      const rows = database
        .prepare(
          `
            SELECT *
            FROM market_items
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
          `
        )
        .all(limit + 1, offset)
        .filter(isMarketItemRow);
      const visibleRows = rows.slice(0, limit);

      return {
        items: visibleRows.map(mapMarketItemRow),
        nextCursor: rows.length > limit ? String(offset + limit) : null,
      };
    },

    async getMarketItem(id: string): Promise<MarketItemRecord | null> {
      const row = database
        .prepare(
          `
            SELECT *
            FROM market_items
            WHERE id = ? AND deleted_at IS NULL
            LIMIT 1
          `
        )
        .get(id);

      return isMarketItemRow(row) ? mapMarketItemRow(row) : null;
    },

    async readMarketItemImage(item: Pick<MarketItemRecord, "imageFileName">) {
      return readFile(path.join(imagesDir, item.imageFileName));
    },

    async deleteMarketItem(id: string, deletedAt = new Date().toISOString()) {
      const result = database
        .prepare(
          `
            UPDATE market_items
            SET deleted_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `
        )
        .run(deletedAt, id);

      return result.changes > 0;
    },
  };
}

let defaultMarketStore: ReturnType<typeof createMarketStore> | null = null;

export function getDefaultMarketStore() {
  defaultMarketStore ??= createMarketStore();
  return defaultMarketStore;
}

export function resetDefaultMarketStoreForTests() {
  defaultMarketStore = null;
}

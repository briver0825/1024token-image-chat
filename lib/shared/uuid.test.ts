import { describe, expect, it } from "vitest";

import { createUuid } from "@/lib/shared/uuid";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

describe("createUuid", () => {
  it("falls back when crypto.randomUUID is unavailable but getRandomValues exists", () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues<T extends ArrayBufferView | null>(array: T) {
          if (!array || !("byteLength" in array)) {
            return array;
          }

          const view = new Uint8Array(
            array.buffer,
            array.byteOffset,
            array.byteLength
          );

          for (let index = 0; index < view.length; index += 1) {
            view[index] = (index * 17 + 23) % 256;
          }

          return array;
        },
      },
    });

    try {
      const uuid = createUuid();

      expect(isUuidLike(uuid)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("still returns a string when crypto is completely unavailable", () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });

    try {
      const uuid = createUuid();

      expect(typeof uuid).toBe("string");
      expect(uuid.length).toBeGreaterThan(20);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });
});

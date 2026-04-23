import { generateKeyPairSync } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  decryptConnectionConfig,
  getPublicKeyResponse,
  resetConfigEncryptionContextForTests,
} from "@/lib/server/config-encryption";

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");
  const binary = Buffer.from(base64, "base64");

  return binary.buffer.slice(
    binary.byteOffset,
    binary.byteOffset + binary.byteLength
  );
}

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

async function encryptConfigForServer(
  publicKeyPem: string,
  payload: Record<string, string>
) {
  const encoder = new TextEncoder();
  const aesKey = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    encoder.encode(JSON.stringify(payload))
  );

  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );
  const rawAesKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
  const wrappedKey = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    rawAesKey
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
  };
}

describe("config-encryption", () => {
  beforeEach(() => {
    resetConfigEncryptionContextForTests();
  });

  it("returns a public key response and decrypts a client envelope", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    process.env.IMAGE_CHAT_CONFIG_PRIVATE_KEY = privateKey
      .export({
        type: "pkcs8",
        format: "pem",
      })
      .toString();

    const publicKeyResponse = getPublicKeyResponse();
    const envelope = await encryptConfigForServer(publicKeyResponse.publicKey, {
      apiKey: "sk-user-demo",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
    });

    await expect(
      decryptConnectionConfig({
        keyId: publicKeyResponse.keyId,
        ...envelope,
      })
    ).resolves.toEqual({
      apiKey: "sk-user-demo",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
    });
  });

  it("rejects encrypted payloads for the wrong key id", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    process.env.IMAGE_CHAT_CONFIG_PRIVATE_KEY = privateKey
      .export({
        type: "pkcs8",
        format: "pem",
      })
      .toString();

    const publicKeyResponse = getPublicKeyResponse();
    const envelope = await encryptConfigForServer(publicKeyResponse.publicKey, {
      apiKey: "sk-user-demo",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
    });

    await expect(
      decryptConnectionConfig({
        keyId: "wrong-key-id",
        ...envelope,
      })
    ).rejects.toThrow("keyId");
  });
});

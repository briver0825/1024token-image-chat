import {
  constants,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  type KeyObject,
} from "node:crypto";

import { z } from "zod";

import type {
  EncryptedConnectionPayload,
  ProviderConnectionConfig,
  PublicKeyResponse,
} from "@/lib/image-chat/types";
import { InputValidationError } from "@/lib/server/image-generation";

const RSA_OAEP_HASH = "sha256";
const AES_ALGORITHM = "aes-256-gcm";
const GCM_TAG_LENGTH_BYTES = 16;

const encryptedConnectionSchema = z.object({
  keyId: z.string().min(1, "keyId 不能为空"),
  wrappedKey: z.string().min(1, "wrappedKey 不能为空"),
  iv: z.string().min(1, "iv 不能为空"),
  ciphertext: z.string().min(1, "ciphertext 不能为空"),
});

const providerConnectionConfigSchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey 不能为空"),
  baseUrl: z.string().trim().url("baseUrl 必须是合法 URL"),
  model: z.string().trim().min(1, "model 不能为空"),
});

type ConfigEncryptionContext = {
  keyId: string;
  publicKeyPem: string;
  privateKey: KeyObject;
};

let cachedContext: ConfigEncryptionContext | null = null;

function normalizePem(pemValue: string) {
  return pemValue.replace(/\\n/g, "\n").trim();
}

function toBase64Buffer(value: string, fieldName: string) {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new InputValidationError(`${fieldName} 不是合法 base64`);
  }
}

function createContextFromPrivateKeyPem(privateKeyPem: string) {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyPem = createPublicKey(privateKey)
    .export({
      type: "spki",
      format: "pem",
    })
    .toString();
  const keyId = createHash("sha256").update(publicKeyPem).digest("hex");

  return {
    keyId,
    publicKeyPem,
    privateKey,
  } satisfies ConfigEncryptionContext;
}

function loadContext(): ConfigEncryptionContext {
  if (cachedContext) {
    return cachedContext;
  }

  const configuredPrivateKey = process.env.IMAGE_CHAT_CONFIG_PRIVATE_KEY?.trim();

  if (configuredPrivateKey) {
    cachedContext = createContextFromPrivateKeyPem(normalizePem(configuredPrivateKey));
    return cachedContext;
  }

  if (process.env.NODE_ENV !== "production") {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    cachedContext = createContextFromPrivateKeyPem(
      privateKey
        .export({
          type: "pkcs8",
          format: "pem",
        })
        .toString()
    );

    return cachedContext;
  }

  throw new Error(
    "服务端缺少 IMAGE_CHAT_CONFIG_PRIVATE_KEY，无法为前端下发加密公钥。"
  );
}

function parseEncryptedConnectionPayload(input: unknown): EncryptedConnectionPayload {
  const result = encryptedConnectionSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new InputValidationError(issue?.message ?? "encryptedConfig 非法");
  }

  return result.data;
}

function parseProviderConnectionConfig(input: unknown): ProviderConnectionConfig {
  const result = providerConnectionConfigSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new InputValidationError(issue?.message ?? "provider config 非法");
  }

  return result.data;
}

export function getPublicKeyResponse(): PublicKeyResponse {
  const context = loadContext();

  return {
    keyId: context.keyId,
    algorithm: "RSA-OAEP-256+A256GCM",
    publicKey: context.publicKeyPem,
  };
}

export async function decryptConnectionConfig(
  encryptedConfig: unknown
): Promise<ProviderConnectionConfig> {
  const context = loadContext();
  const parsedPayload = parseEncryptedConnectionPayload(encryptedConfig);

  if (parsedPayload.keyId !== context.keyId) {
    throw new InputValidationError("keyId 与当前服务端公钥不匹配");
  }

  const wrappedKey = toBase64Buffer(parsedPayload.wrappedKey, "wrappedKey");
  const iv = toBase64Buffer(parsedPayload.iv, "iv");
  const ciphertext = toBase64Buffer(parsedPayload.ciphertext, "ciphertext");

  if (ciphertext.byteLength <= GCM_TAG_LENGTH_BYTES) {
    throw new InputValidationError("ciphertext 长度无效");
  }

  let plaintext: string;

  try {
    const aesKey = privateDecrypt(
      {
        key: context.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: RSA_OAEP_HASH,
      },
      wrappedKey
    );
    const encryptedBytes = ciphertext.subarray(0, -GCM_TAG_LENGTH_BYTES);
    const authTag = ciphertext.subarray(-GCM_TAG_LENGTH_BYTES);
    const decipher = createDecipheriv(AES_ALGORITHM, aesKey, iv);

    decipher.setAuthTag(authTag);

    plaintext = Buffer.concat([
      decipher.update(encryptedBytes),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new InputValidationError("encryptedConfig 解密失败");
  }

  try {
    return parseProviderConnectionConfig(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof InputValidationError) {
      throw error;
    }

    throw new InputValidationError("解密后的 provider config 非法");
  }
}

export function resetConfigEncryptionContextForTests() {
  cachedContext = null;
  delete process.env.IMAGE_CHAT_CONFIG_PRIVATE_KEY;
}

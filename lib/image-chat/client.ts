import type {
  CreateMarketItemResponse,
  EncryptedConnectionPayload,
  GenerateErrorResponse,
  GenerateTaskRequest,
  GenerateTaskCreateResponse,
  GenerateTaskStatusResponse,
  GenerationSettings,
  ProviderConnectionConfig,
  PublicKeyResponse,
} from "@/lib/image-chat/types";

export class ImageGenerationRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ImageGenerationRequestError";
  }
}

let cachedPublicKeyResponse: PublicKeyResponse | null = null;

function stripPemHeader(pem: string) {
  return pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function isValidConnectionConfig(config: ProviderConnectionConfig) {
  return (
    config.apiKey.trim().length > 0 &&
    config.baseUrl.trim().length > 0 &&
    config.model.trim().length > 0
  );
}

async function importPublicKey(publicKeyPem: string) {
  const binaryKey = Uint8Array.from(atob(stripPemHeader(publicKeyPem)), (character) =>
    character.charCodeAt(0)
  );

  return crypto.subtle.importKey(
    "spki",
    binaryKey,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );
}

export async function fetchImageChatPublicKey(forceRefresh = false) {
  if (cachedPublicKeyResponse && !forceRefresh) {
    return cachedPublicKeyResponse;
  }

  const response = await fetch("/api/image-chat/public-key", {
    cache: "no-store",
  });
  const body = (await response.json()) as
    | PublicKeyResponse
    | GenerateErrorResponse;

  if (!response.ok) {
    const errorBody = body as GenerateErrorResponse;

    throw new ImageGenerationRequestError(
      errorBody.error?.message ?? "无法获取前端加密公钥。",
      response.status,
      errorBody.error?.code
    );
  }

  cachedPublicKeyResponse = body as PublicKeyResponse;

  return cachedPublicKeyResponse;
}

export async function encryptConnectionConfig(
  config: ProviderConnectionConfig,
  publicKeyResponse: PublicKeyResponse
): Promise<EncryptedConnectionPayload> {
  if (!isValidConnectionConfig(config)) {
    throw new ImageGenerationRequestError("请先填写 API Key、Base URL 和模型。", 400);
  }

  const rsaKey = await importPublicKey(publicKeyResponse.publicKey);
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
    new TextEncoder().encode(
      JSON.stringify({
        apiKey: config.apiKey.trim(),
        baseUrl: config.baseUrl.trim(),
        model: config.model.trim(),
      })
    )
  );
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrappedKey = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    rsaKey,
    rawAesKey
  );

  return {
    keyId: publicKeyResponse.keyId,
    wrappedKey: arrayBufferToBase64(wrappedKey),
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

export async function createImageGenerationTask(
  payload: GenerateTaskRequest,
  connectionConfig: ProviderConnectionConfig,
  publicKeyResponse?: PublicKeyResponse
): Promise<GenerateTaskCreateResponse> {
  const resolvedPublicKeyResponse =
    publicKeyResponse ?? (await fetchImageChatPublicKey());
  const encryptedConfig = await encryptConnectionConfig(
    connectionConfig,
    resolvedPublicKeyResponse
  );
  const response = await fetch("/api/image-chat/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      encryptedConfig,
    }),
  });

  const body = (await response.json()) as
    | GenerateTaskCreateResponse
    | GenerateErrorResponse;

  if (!response.ok) {
    const errorBody = body as GenerateErrorResponse;

    throw new ImageGenerationRequestError(
      errorBody.error?.message ?? "图片生成失败，请稍后再试。",
      response.status,
      errorBody.error?.code
    );
  }

  return body as GenerateTaskCreateResponse;
}

export async function fetchImageGenerationTaskStatus(
  taskId: string
): Promise<GenerateTaskStatusResponse> {
  const response = await fetch(
    `/api/image-chat/generate?taskId=${encodeURIComponent(taskId)}`,
    {
      cache: "no-store",
    }
  );

  const body = (await response.json()) as
    | GenerateTaskStatusResponse
    | GenerateErrorResponse;

  if (!response.ok) {
    const errorBody = body as GenerateErrorResponse;

    throw new ImageGenerationRequestError(
      errorBody.error?.message ?? "无法获取图片生成状态，请稍后再试。",
      response.status,
      errorBody.error?.code
    );
  }

  return body as GenerateTaskStatusResponse;
}

export async function createMarketItem(payload: {
  prompt: string;
  settings: GenerationSettings;
  model?: string;
  image: Blob;
  width: number;
  height: number;
}): Promise<CreateMarketItemResponse> {
  const formData = new FormData();

  formData.set("prompt", payload.prompt);
  formData.set("settings", JSON.stringify(payload.settings));
  formData.set("width", String(payload.width));
  formData.set("height", String(payload.height));

  if (payload.model?.trim()) {
    formData.set("model", payload.model.trim());
  }

  formData.set("image", payload.image, "image-chat-market-image");

  const response = await fetch("/api/image-chat/market", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as
    | CreateMarketItemResponse
    | GenerateErrorResponse;

  if (!response.ok) {
    const errorBody = body as GenerateErrorResponse;

    throw new ImageGenerationRequestError(
      errorBody.error?.message ?? "提交焚决市场失败，请稍后再试。",
      response.status,
      errorBody.error?.code
    );
  }

  return body as CreateMarketItemResponse;
}

export const IMAGE_SIZE_OPTIONS = [
  "1024x1024",
  "1024x768",
  "768x1024",
  "1024x576",
  "576x1024",
  "2048x2048",
  "2048x1536",
  "1536x2048",
  "2048x1152",
  "1152x2048",
  "1536x1024",
  "1024x1536",
  "2880x2880",
  "3328x2496",
  "2496x3328",
  "3840x2160",
  "2160x3840",
] as const;

export const IMAGE_ASPECT_RATIO_OPTIONS = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
] as const;

export const IMAGE_RESOLUTION_OPTIONS = ["1k", "2k", "4k"] as const;
export const IMAGE_QUALITY_OPTIONS = ["low", "medium", "high", "auto"] as const;

export const IMAGE_OUTPUT_FORMAT_OPTIONS = ["png", "jpeg", "webp"] as const;
export const MAX_REFERENCE_IMAGES = 16;

export type ImageSize = (typeof IMAGE_SIZE_OPTIONS)[number];
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIO_OPTIONS)[number];
export type ImageResolution = (typeof IMAGE_RESOLUTION_OPTIONS)[number];
export type ImageQuality = (typeof IMAGE_QUALITY_OPTIONS)[number];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMAT_OPTIONS)[number];

export type GenerationSettings = {
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  outputFormat: ImageOutputFormat;
  size?: ImageSize;
  quality?: ImageQuality;
  outputCompression?: number;
};

export type GenerateRequest = Omit<GenerationSettings, "size" | "quality" | "outputCompression"> & {
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
};

export type GenerateClientRequest = GenerationSettings & {
  prompt: string;
};

export type GenerateReferenceImage = {
  b64: string;
  mimeType: string;
};

export type GenerateTaskRequest = GenerateClientRequest & {
  referenceImages?: GenerateReferenceImage[];
  referenceImage?: GenerateReferenceImage;
};

export type ParsedGenerateTaskRequest = GenerateRequest & {
  referenceImages?: GenerateReferenceImage[];
  referenceImage?: GenerateReferenceImage;
};

export type ProviderConnectionConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type PublicKeyResponse = {
  keyId: string;
  algorithm: "RSA-OAEP-256+A256GCM";
  publicKey: string;
};

export type EncryptedConnectionPayload = {
  keyId: string;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
};

export type GenerateRequestEnvelope = GenerateTaskRequest & {
  encryptedConfig: EncryptedConnectionPayload;
};

export type ImageGenerationResult = {
  image: {
    b64: string;
    mimeType: string;
    width: number;
    height: number;
  };
  params: GenerateRequest;
  createdAt: string;
  providerMeta?: {
    created?: number;
    requestId?: string;
    latencyMs?: number;
  };
};

export type GenerateSuccessResponse = ImageGenerationResult & {
  assistantMessageId: string;
};

export type GenerateErrorResponse = {
  error: {
    code:
      | "invalid_request"
      | "unauthorized"
      | "rate_limited"
      | "provider_unavailable"
      | "provider_timeout"
      | "task_not_found";
    message: string;
  };
};

export type ImageGenerationTaskStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type GenerateTaskCreateResponse = {
  taskId: string;
  status: "queued";
  createdAt: string;
};

export type GenerateTaskPendingResponse = {
  taskId: string;
  status: "queued" | "processing";
  createdAt: string;
};

export type GenerateTaskSuccessResponse = ImageGenerationResult & {
  taskId: string;
  status: "completed";
};

export type GenerateTaskFailureResponse = {
  taskId: string;
  status: "failed";
  createdAt: string;
  error: GenerateErrorResponse["error"];
};

export type GenerateTaskStatusResponse =
  | GenerateTaskPendingResponse
  | GenerateTaskSuccessResponse
  | GenerateTaskFailureResponse;

export type ConversationRecord = {
  id: string;
  title: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationSummaryRecord = ConversationRecord & {
  messageCount: number;
};

export type MessageRole = "user" | "assistant";
export type MessageStatus = "pending" | "completed" | "failed";

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: MessageRole;
  status: MessageStatus;
  prompt: string;
  settings?: GenerationSettings;
  assetId?: string;
  referenceAssetId?: string;
  referenceAssetIds?: string[];
  errorMessage?: string;
  remoteTaskId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ImageAssetRecord = {
  id: string;
  conversationId: string;
  messageId: string;
  contentHash?: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
};

export type ImageGalleryRecord = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  prompt: string;
  settings?: GenerationSettings;
  contentHash?: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
};

export type MarketItemRecord = {
  id: string;
  prompt: string;
  settings: GenerationSettings;
  model?: string;
  imageFileName: string;
  imageMimeType: string;
  imageBytes: number;
  imageWidth: number;
  imageHeight: number;
  imageSha256: string;
  createdAt: string;
  deletedAt?: string;
};

export type MarketItemResponse = {
  id: string;
  prompt: string;
  settings: GenerationSettings;
  model?: string;
  image: {
    url: string;
    mimeType: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
  };
  createdAt: string;
};

export type CreateMarketItemResponse = {
  item: MarketItemResponse;
};

export type MarketDraft = {
  prompt: string;
  settings: GenerationSettings;
  sourceMarketItemId?: string;
  model?: string;
  createdAt: string;
};

export type ConversationDetail = {
  conversation: ConversationSummaryRecord;
  messages: MessageRecord[];
  assets: ImageAssetRecord[];
};

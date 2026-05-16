import {
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  type GenerationSettings,
  type ImageAspectRatio,
  type ImageOutputFormat,
  type ImageQuality,
  type ImageResolution,
  type ImageSize,
} from "@/lib/image-chat/types";

export const DEFAULT_IMAGE_QUALITY: ImageQuality = "high";

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  aspectRatio: "1:1",
  resolution: "1k",
  outputFormat: "png",
};

const SIZE_BY_RATIO_AND_RESOLUTION = {
  "16:9": {
    "1k": "1024x576",
    "2k": "2048x1152",
    "4k": "3840x2160",
  },
  "4:3": {
    "1k": "1024x768",
    "2k": "2048x1536",
    "4k": "3328x2496",
  },
  "1:1": {
    "1k": "1024x1024",
    "2k": "2048x2048",
    "4k": "2880x2880",
  },
  "3:4": {
    "1k": "768x1024",
    "2k": "1536x2048",
    "4k": "2496x3328",
  },
  "9:16": {
    "1k": "576x1024",
    "2k": "1152x2048",
    "4k": "2160x3840",
  },
} as const satisfies Record<ImageAspectRatio, Record<ImageResolution, ImageSize>>;

const LEGACY_SIZE_SETTINGS: Partial<
  Record<ImageSize, Pick<GenerationSettings, "aspectRatio" | "resolution">>
> = {
  "1024x1024": {
    aspectRatio: "1:1",
    resolution: "1k",
  },
  "2048x2048": {
    aspectRatio: "1:1",
    resolution: "2k",
  },
  "2880x2880": {
    aspectRatio: "1:1",
    resolution: "4k",
  },
  "3328x2496": {
    aspectRatio: "4:3",
    resolution: "4k",
  },
  "2496x3328": {
    aspectRatio: "3:4",
    resolution: "4k",
  },
  "1536x1024": {
    aspectRatio: "4:3",
    resolution: "2k",
  },
  "1024x1536": {
    aspectRatio: "3:4",
    resolution: "2k",
  },
  "3840x2160": {
    aspectRatio: "16:9",
    resolution: "4k",
  },
  "2160x3840": {
    aspectRatio: "9:16",
    resolution: "4k",
  },
};

function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return IMAGE_ASPECT_RATIO_OPTIONS.includes(value as ImageAspectRatio);
}

function isImageResolution(value: unknown): value is ImageResolution {
  return IMAGE_RESOLUTION_OPTIONS.includes(value as ImageResolution);
}

function isImageSize(value: unknown): value is ImageSize {
  return IMAGE_SIZE_OPTIONS.includes(value as ImageSize);
}

function isImageQuality(value: unknown): value is ImageQuality {
  return IMAGE_QUALITY_OPTIONS.includes(value as ImageQuality);
}

function isImageOutputFormat(value: unknown): value is ImageOutputFormat {
  return IMAGE_OUTPUT_FORMAT_OPTIONS.includes(value as ImageOutputFormat);
}

export function resolveImageSize({
  aspectRatio,
  resolution,
}: Pick<GenerationSettings, "aspectRatio" | "resolution">): ImageSize {
  return SIZE_BY_RATIO_AND_RESOLUTION[aspectRatio][resolution];
}

export function normalizeGenerationSettings(
  settings: Partial<GenerationSettings> | undefined
): GenerationSettings {
  if (settings && "aspectRatio" in settings && !isImageAspectRatio(settings.aspectRatio)) {
    throw new Error("aspectRatio 无效");
  }

  if (settings && "resolution" in settings && !isImageResolution(settings.resolution)) {
    throw new Error("resolution 无效");
  }

  const legacySize = isImageSize(settings?.size) ? settings.size : undefined;
  const legacySettings = legacySize ? LEGACY_SIZE_SETTINGS[legacySize] : undefined;
  const aspectRatio = isImageAspectRatio(settings?.aspectRatio)
    ? settings.aspectRatio
    : legacySettings?.aspectRatio ?? DEFAULT_GENERATION_SETTINGS.aspectRatio;
  const resolution = isImageResolution(settings?.resolution)
    ? settings.resolution
    : legacySettings?.resolution ?? DEFAULT_GENERATION_SETTINGS.resolution;
  const outputFormat = isImageOutputFormat(settings?.outputFormat)
    ? settings.outputFormat
    : DEFAULT_GENERATION_SETTINGS.outputFormat;

  return {
    aspectRatio,
    resolution,
    outputFormat,
    ...(isImageQuality(settings?.quality) && settings.quality !== DEFAULT_IMAGE_QUALITY
      ? { quality: settings.quality }
      : {}),
  };
}

export function createProviderGenerationRequest(
  settings: Partial<GenerationSettings>
): GenerationSettings & {
  size: ImageSize;
  quality: ImageQuality;
} {
  const normalizedSettings = normalizeGenerationSettings(settings);

  return {
    ...normalizedSettings,
    size: resolveImageSize(normalizedSettings),
    quality: settings.quality ?? DEFAULT_IMAGE_QUALITY,
  };
}

export function formatGenerationSettings(settings: GenerationSettings) {
  const normalizedSettings = normalizeGenerationSettings(settings);

  return [
    normalizedSettings.resolution.toUpperCase(),
    normalizedSettings.aspectRatio,
    normalizedSettings.outputFormat.toUpperCase(),
  ].join(" · ");
}

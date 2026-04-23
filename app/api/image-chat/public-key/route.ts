import { getPublicKeyResponse } from "@/lib/server/config-encryption";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(getPublicKeyResponse());
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "服务端无法提供配置加密公钥。";

    return Response.json(
      {
        error: {
          code: "provider_unavailable",
          message,
        },
      },
      {
        status: 500,
      }
    );
  }
}

export async function computeBlobSha256(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return `sha256:${Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("")}`;
}

export function dedupeItemsByContentHash<
  T extends {
    id: string;
    contentHash?: string;
  },
>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.contentHash ?? `id:${item.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

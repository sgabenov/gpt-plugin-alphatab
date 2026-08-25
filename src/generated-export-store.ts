import { randomUUID } from "node:crypto";

export const GENERATED_EXPORT_DOWNLOAD_ROUTE_PREFIX = "/downloads/generated";
export const MAX_GENERATED_EXPORT_BYTES = 2 * 1024 * 1024;
export const GENERATED_EXPORT_TTL_SECONDS = 60 * 60;

export interface GeneratedExport {
  id: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  createdAt: string;
  expiresAt: string;
}

export interface GeneratedExportStoreOptions {
  now?: () => number;
  createId?: () => string;
}

function safeFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return sanitized || "score.svg";
}

export class InMemoryGeneratedExportStore {
  readonly #items = new Map<string, GeneratedExport>();
  readonly #now: () => number;
  readonly #createId: () => string;

  constructor(options: GeneratedExportStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  create(filename: string, mimeType: string, bytes: Uint8Array): GeneratedExport {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_GENERATED_EXPORT_BYTES) {
      throw new Error(`Generated exports must contain between 1 and ${MAX_GENERATED_EXPORT_BYTES} bytes.`);
    }
    this.#removeExpired();
    const now = this.#now();
    const item: GeneratedExport = {
      id: this.#createId(),
      filename: safeFilename(filename),
      mimeType,
      bytes: Uint8Array.from(bytes),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + GENERATED_EXPORT_TTL_SECONDS * 1000).toISOString()
    };
    this.#items.set(item.id, item);
    return item;
  }

  get(id: string): GeneratedExport | undefined {
    this.#removeExpired();
    const item = this.#items.get(id);
    return item ? { ...item, bytes: Uint8Array.from(item.bytes) } : undefined;
  }

  #removeExpired(): void {
    const now = this.#now();
    for (const [id, item] of this.#items) {
      if (Date.parse(item.expiresAt) <= now) this.#items.delete(id);
    }
  }
}

export function generatedExportDownloadPath(id: string): string {
  return `${GENERATED_EXPORT_DOWNLOAD_ROUTE_PREFIX}/${encodeURIComponent(id)}`;
}

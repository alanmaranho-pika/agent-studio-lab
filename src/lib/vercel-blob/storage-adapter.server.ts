import type { IssuedSignedToken } from "@vercel/blob";

type StorageError = { message: string };
type StorageResult<T> = Promise<{ data: T; error: null } | { data: null; error: StorageError }>;

type UploadOptions = {
  contentType?: string;
  upsert?: boolean;
};

type SignedUrlOptions = {
  transform?: {
    height?: number;
    quality?: number;
    resize?: string;
    width?: number;
  };
};

type StoredFile = {
  name: string;
};

const PRIVATE_ACCESS = "private" as const;
const DEFAULT_SIGNED_URL_TTL = 60 * 60 * 24 * 7;
const SIGNED_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let signedToken:
  | {
      expiresAt: number;
      value: IssuedSignedToken;
    }
  | undefined;
let signedTokenPromise: Promise<IssuedSignedToken> | undefined;

async function blobSdk(): Promise<typeof import("@vercel/blob")> {
  return import("@vercel/blob");
}

function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  return token;
}

function errorResult(error: unknown): { data: null; error: StorageError } {
  return {
    data: null,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function uploadBody(bytes: Uint8Array | ArrayBuffer | Blob | string): ArrayBuffer | Blob | string {
  if (!(bytes instanceof Uint8Array)) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getSignedToken(ttlSeconds: number): Promise<IssuedSignedToken> {
  const now = Date.now();
  const requestedExpiry = now + Math.max(ttlSeconds, DEFAULT_SIGNED_URL_TTL) * 1000;
  if (
    signedToken &&
    signedToken.expiresAt - SIGNED_TOKEN_REFRESH_BUFFER_MS > now &&
    signedToken.expiresAt >= now + ttlSeconds * 1000
  ) {
    return signedToken.value;
  }

  if (!signedTokenPromise) {
    signedTokenPromise = blobSdk().then(({ issueSignedToken }) => issueSignedToken({
      pathname: "*",
      operations: ["get"],
      token: blobToken(),
      validUntil: requestedExpiry,
    })).then((value) => {
      signedToken = { value, expiresAt: value.validUntil };
      signedTokenPromise = undefined;
      return value;
    }, (error) => {
      signedTokenPromise = undefined;
      throw error;
    });
  }
  return signedTokenPromise;
}

async function createPrivateSignedUrl(path: string, ttlSeconds: number): Promise<string> {
  const validUntil = Date.now() + ttlSeconds * 1000;
  const token = await getSignedToken(ttlSeconds);
  const { presignUrl } = await blobSdk();
  const result = await presignUrl(token, {
    access: PRIVATE_ACCESS,
    operation: "get",
    pathname: normalizePath(path),
    validUntil: Math.min(validUntil, token.validUntil),
  });
  return result.presignedUrl;
}

class VercelBlobBucket {
  async upload(
    path: string,
    bytes: Uint8Array | ArrayBuffer | Blob | string,
    options: UploadOptions = {},
  ): StorageResult<{ fullPath: string; path: string }> {
    try {
      const pathname = normalizePath(path);
      const { put } = await blobSdk();
      await put(pathname, uploadBody(bytes), {
        access: PRIVATE_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: options.upsert ?? false,
        contentType: options.contentType,
        token: blobToken(),
      });
      return { data: { fullPath: pathname, path: pathname }, error: null };
    } catch (error) {
      return errorResult(error);
    }
  }

  async createSignedUrl(
    path: string,
    expiresIn = DEFAULT_SIGNED_URL_TTL,
    _options?: SignedUrlOptions,
  ): StorageResult<{ signedUrl: string }> {
    try {
      return {
        data: { signedUrl: await createPrivateSignedUrl(path, expiresIn) },
        error: null,
      };
    } catch (error) {
      return errorResult(error);
    }
  }

  async createSignedUrls(
    paths: string[],
    expiresIn = DEFAULT_SIGNED_URL_TTL,
  ): StorageResult<Array<{ error: null; path: string; signedUrl: string }>> {
    try {
      const data = await Promise.all(
        paths.map(async (path) => ({
          error: null,
          path,
          signedUrl: await createPrivateSignedUrl(path, expiresIn),
        })),
      );
      return { data, error: null };
    } catch (error) {
      return errorResult(error);
    }
  }

  async remove(paths: string[]): StorageResult<null> {
    try {
      if (paths.length > 0) {
        const { del } = await blobSdk();
        await del(paths.map(normalizePath), { token: blobToken() });
      }
      return { data: null, error: null };
    } catch (error) {
      return errorResult(error);
    }
  }

  async copy(sourcePath: string, destinationPath: string): StorageResult<{ path: string }> {
    try {
      const { copy: copyBlob } = await blobSdk();
      const result = await copyBlob(normalizePath(sourcePath), normalizePath(destinationPath), {
        access: PRIVATE_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: true,
        token: blobToken(),
      });
      return { data: { path: result.pathname }, error: null };
    } catch (error) {
      return errorResult(error);
    }
  }

  async list(
    prefix = "",
    options: { limit?: number } = {},
  ): StorageResult<StoredFile[]> {
    try {
      const normalizedPrefix = normalizePath(prefix).replace(/\/+$/, "");
      const searchPrefix = normalizedPrefix ? `${normalizedPrefix}/` : "";
      const files: StoredFile[] = [];
      let cursor: string | undefined;

      do {
        const { list } = await blobSdk();
        const page = await list({
          cursor,
          limit: Math.min(options.limit ?? 1000, 1000),
          prefix: searchPrefix,
          token: blobToken(),
        });
        files.push(
          ...page.blobs.map((blob) => ({
            name: blob.pathname.slice(searchPrefix.length),
          })),
        );
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && files.length < (options.limit ?? 1000));

      return { data: files.slice(0, options.limit ?? 1000), error: null };
    } catch (error) {
      return errorResult(error);
    }
  }
}

export type VercelBlobStorage = {
  from(bucket: string): VercelBlobBucket;
};

export function createVercelBlobStorage(): VercelBlobStorage {
  const bucket = new VercelBlobBucket();
  return {
    // The former Supabase bucket maps to this project's dedicated Blob store.
    from: () => bucket,
  };
}

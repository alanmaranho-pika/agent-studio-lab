import { createClient } from "@supabase/supabase-js";
import { list as listBlobs, put } from "@vercel/blob";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const SUPABASE_URL = "https://igsepvhlwuasodrkadug.supabase.co";
const BUCKET = "project-assets";
const execute = process.argv.includes("--execute");

if (existsSync(".env.local")) loadEnvFile(".env.local");

const supabaseKey = process.env.MY_SUPABASE_SERVICE_ROLE_KEY;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
if (!supabaseKey) throw new Error("MY_SUPABASE_SERVICE_ROLE_KEY is missing");
if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN is missing");

const supabase = createClient(SUPABASE_URL, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function listSupabaseFolder(prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        files.push({
          contentType:
            typeof item.metadata?.mimetype === "string"
              ? item.metadata.mimetype
              : "application/octet-stream",
          path,
          size: Number(item.metadata?.size ?? 0),
        });
      } else {
        files.push(...(await listSupabaseFolder(path)));
      }
    }
    if (data.length < 1000) break;
  }
  return files;
}

async function listAllBlobs() {
  const blobs = [];
  let cursor;
  do {
    const page = await listBlobs({ cursor, limit: 1000, token: blobToken });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function mapConcurrent(items, concurrency, task) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

const sourceFiles = await listSupabaseFolder();
const sourceBytes = sourceFiles.reduce((sum, file) => sum + file.size, 0);
console.log(
  JSON.stringify(
    {
      action: execute ? "copy" : "dry-run",
      sourceBytes,
      sourceFiles: sourceFiles.length,
    },
    null,
    2,
  ),
);

if (!execute) {
  console.log("Dry run only. Re-run with --execute to copy and verify.");
  process.exit(0);
}

let copied = 0;
await mapConcurrent(sourceFiles, 4, async (file) => {
  const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
  if (error || !data) throw error ?? new Error(`Download failed: ${file.path}`);
  await put(file.path, data, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: file.contentType,
    token: blobToken,
  });
  copied += 1;
  console.log(`[${copied}/${sourceFiles.length}] ${file.path}`);
});

const destination = await listAllBlobs();
const destinationByPath = new Map(destination.map((blob) => [blob.pathname, blob]));
const missing = sourceFiles.filter((file) => !destinationByPath.has(file.path));
const sizeMismatches = sourceFiles.filter((file) => {
  const blob = destinationByPath.get(file.path);
  return blob && file.size > 0 && blob.size !== file.size;
});
const copiedBytes = sourceFiles.reduce(
  (sum, file) => sum + (destinationByPath.get(file.path)?.size ?? 0),
  0,
);

console.log(
  JSON.stringify(
    {
      copiedBytes,
      copiedFiles: sourceFiles.length - missing.length,
      destinationFiles: destination.length,
      missing: missing.map((file) => file.path),
      sizeMismatches: sizeMismatches.map((file) => ({
        actual: destinationByPath.get(file.path)?.size,
        expected: file.size,
        path: file.path,
      })),
      sourceBytes,
      sourceFiles: sourceFiles.length,
      verified: missing.length === 0 && sizeMismatches.length === 0,
    },
    null,
    2,
  ),
);

if (missing.length > 0 || sizeMismatches.length > 0) process.exitCode = 1;

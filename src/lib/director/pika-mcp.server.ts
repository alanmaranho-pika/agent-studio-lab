/**
 * Pika MCP client wrapper.
 *
 * Workers have no persistent connections, so we spin up a fresh
 * `@modelcontextprotocol/sdk` client per request. Each request:
 *   1. Grabs the current user's Pika access token (refreshing if needed).
 *   2. Opens a Streamable HTTP transport with `Authorization: Bearer …`.
 *   3. Calls `listTools` or `callTool`.
 *   4. Closes the client.
 *
 * Tool name convention: every Pika MCP tool is exposed to the Director
 * agent with a `pika_` prefix, matching Suite. A small blocklist hides
 * tools that don't belong in Director (captions render, HTML→PNG, Figma,
 * social scrape — the latter is wrapped by our own `produce_references`
 * tool internally).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type Anthropic from "@anthropic-ai/sdk";

import { getAccessToken, pikaResourceUrl } from "./pika-oauth.server";

const TOOL_PREFIX = "pika_";

// Suite hides these from the agent surface; keep parity so prompt behavior
// matches. `pika_scrape_*` is only surfaced via our own wrapper tools.
const BLOCKLIST = new Set([
  "add_captions",
  "html_to_png",
  "figma",
  "scrape_social",
  "scrape_url",
]);

export function isPikaTool(name: string): boolean {
  return name.startsWith(TOOL_PREFIX);
}

async function makeClient(userId: string): Promise<Client | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;
  const transport = new StreamableHTTPClientTransport(
    new URL(pikaResourceUrl()),
    {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const client = new Client({
    name: "Pika Director (Lovable)",
    version: "0.1.0",
  });
  await client.connect(transport);
  return client;
}

/**
 * Anthropic rejects top-level oneOf/allOf/anyOf on tool input_schema, and
 * requires `type: "object"`. Collapse unions to their first branch, coerce
 * shape.
 */
function sanitizeForAnthropic(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const s = schema as Record<string, unknown>;
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    if (Array.isArray(s[key]) && (s[key] as unknown[]).length > 0) {
      return sanitizeForAnthropic((s[key] as unknown[])[0]);
    }
  }
  if (s.type !== "object") {
    return {
      type: "object",
      properties: (s.properties as Record<string, unknown>) ?? {},
      ...(s.required ? { required: s.required } : {}),
    };
  }
  return s;
}

/**
 * Fetch the Pika tool catalog, translate to Anthropic tool schema, drop
 * blocklisted tools, prefix names. Returns [] when the user isn't
 * connected. Never throws — a Pika outage should not break the agent.
 */
export async function getPikaToolDefs(
  userId: string,
): Promise<{
  defs: Anthropic.Tool[];
  hiddenSchemas: Record<string, Anthropic.Tool["input_schema"]>;
}> {
  let client: Client | null = null;
  try {
    client = await makeClient(userId);
    if (!client) return { defs: [], hiddenSchemas: {} };
    const { tools } = await client.listTools();
    const defs: Anthropic.Tool[] = [];
    const hiddenSchemas: Record<string, Anthropic.Tool["input_schema"]> = {};
    for (const t of tools) {
      const schema = sanitizeForAnthropic(
        t.inputSchema,
      ) as Anthropic.Tool["input_schema"];
      if (BLOCKLIST.has(t.name)) {
        hiddenSchemas[t.name] = schema;
        continue;
      }
      defs.push({
        name: `${TOOL_PREFIX}${t.name}`,
        description: t.description ?? "",
        input_schema: schema,
      });
    }
    return { defs, hiddenSchemas };
  } catch (err) {
    console.warn("[pika-mcp] listTools failed:", err);
    return { defs: [], hiddenSchemas: {} };
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Invoke a `pika_`-prefixed tool. Returns a compact JSON-safe result the
 * agent can put in a `tool_result` block.
 *
 * Video providers such as Kling can take several minutes before the MCP
 * server returns a URL or task id. Keep this ceiling high enough that a
 * normal 5–10s render does not fail with MCP -32001.
 */
// Longer-running Pika tools need per-tool timeouts. Video renders take
// minutes and Pika's MCP server doesn't reliably emit progress pings, so
// resetTimeoutOnProgress alone isn't enough — set a generous ceiling.
function timeoutForTool(bareName: string): number {
  if (bareName.includes("generate_video") || bareName.includes("animate")) {
    return 720_000; // 12 min; Kling can exceed 4 min during busy periods
  }
  if (bareName.includes("generate_image")) return 180_000; // 3 min
  return 45_000;
}

function collectUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    const m = value.match(/https?:\/\/[^\s)\]"'}]+/g);
    if (m) out.push(...m);
  } else if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectUrls(item, out);
    }
  }
  return out;
}

function normalizeMcpResult(result: unknown): Record<string, unknown> {
  const r = result as { content?: unknown[]; isError?: boolean; structuredContent?: unknown };
  const blocks = r.content ?? [];
  const texts: string[] = [];
  const urls: string[] = [];
  for (const b of blocks as Array<Record<string, unknown>>) {
    if (b && typeof b === "object") {
      if (b.type === "text" && typeof b.text === "string") {
        texts.push(b.text);
        collectUrls(b.text, urls);
      } else if (
        (b.type === "image" || b.type === "resource") &&
        typeof (b as { data?: unknown }).data === "string"
      ) {
        texts.push(`[${b.type}]`);
      }
    }
  }
  if (r.structuredContent) {
    const structuredText = JSON.stringify(r.structuredContent);
    if (texts.length === 0) texts.push(structuredText);
    collectUrls(r.structuredContent, urls);
  }
  return {
    ok: !r.isError,
    text: texts.join("\n").slice(0, 20_000),
    urls: Array.from(new Set(urls)).slice(0, 8),
  };
}

export async function callPikaTool(
  userId: string,
  prefixedName: string,
  input: unknown,
  opts?: { allowBlocked?: boolean },
): Promise<Record<string, unknown>> {
  const bare = prefixedName.startsWith(TOOL_PREFIX)
    ? prefixedName.slice(TOOL_PREFIX.length)
    : prefixedName;
  if (BLOCKLIST.has(bare) && !opts?.allowBlocked) {
    return { ok: false, error: "tool_blocked_in_director" };
  }
  let client: Client | null = null;
  try {
    client = await makeClient(userId);
    if (!client) {
      return {
        ok: false,
        status: "not_yet_available",
        reason:
          "Pika is not connected. Ask the user to click 'Connect Pika' in the Director header.",
      };
    }
    const result = await client.callTool(
      { name: bare, arguments: (input ?? {}) as Record<string, unknown> },
      undefined,
      {
        timeout: timeoutForTool(bare),
        maxTotalTimeout: timeoutForTool(bare),
        resetTimeoutOnProgress: true,
      },
    );
    return normalizeMcpResult(result);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Reuse an already-open MCP client to call one tool. Used by the poller,
 * which loops over many jobs for the same user and only opens one client.
 */
export async function callPikaToolWithClient(
  client: Client,
  bareName: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  try {
    const result = await client.callTool(
      { name: bareName, arguments: (input ?? {}) as Record<string, unknown> },
      undefined,
      {
        timeout: timeoutForTool(bareName),
        maxTotalTimeout: timeoutForTool(bareName),
        resetTimeoutOnProgress: true,
      },
    );
    return normalizeMcpResult(result);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Open an MCP client for a user. Caller MUST `await client.close()`.
 * Returns null if the user isn't connected.
 */
export async function openPikaClient(userId: string): Promise<Client | null> {
  return makeClient(userId);
}


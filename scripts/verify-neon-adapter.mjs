import { randomUUID } from "node:crypto";

const isNeonPreview =
  process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "vercel";

if (!isNeonPreview) {
  console.log("[neon-adapter] skipped outside the vercel preview branch");
  process.exit(0);
}

const { createNeonDataClient } = await import("../src/lib/neon/supabase-adapter.server.ts");

const fallback = {
  from(table) {
    throw new Error(`[neon-adapter] unexpected Supabase fallback for ${table}`);
  },
  rpc(functionName) {
    throw new Error(`[neon-adapter] unexpected Supabase RPC fallback for ${functionName}`);
  },
};

const admin = createNeonDataClient(fallback);
const projectId = randomUUID();
const assetId = randomUUID();
const messageId = randomUUID();

function assertSuccess(result, label) {
  if (result.error) {
    throw new Error(`[neon-adapter] ${label}: ${result.error.message}`);
  }
  return result.data;
}

const profiles = assertSuccess(await admin.from("profiles").select("id").limit(1), "profile read");
const userId = profiles?.[0]?.id;
if (!userId) throw new Error("[neon-adapter] no migrated profile available for smoke test");

try {
  const insertedProject = assertSuccess(
    await admin
      .from("projects")
      .insert({
        id: projectId,
        user_id: userId,
        title: "Neon migration smoke test",
        status: "draft",
      })
      .select("id, title")
      .single(),
    "project insert",
  );
  if (insertedProject?.id !== projectId) {
    throw new Error("[neon-adapter] inserted project ID mismatch");
  }

  const userClient = createNeonDataClient(fallback, { userId });
  const scopedProject = assertSuccess(
    await userClient.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
    "scoped project read",
  );
  if (scopedProject?.id !== projectId) {
    throw new Error("[neon-adapter] scoped project was not readable by its owner");
  }

  const insertedAsset = assertSuccess(
    await userClient
      .from("project_assets")
      .insert({
        id: assetId,
        project_id: projectId,
        kind: "reference",
        mime: "image/png",
        name: "adapter-smoke.png",
        url: "https://example.invalid/adapter-smoke.png",
      })
      .select("id, project_id, user_id")
      .single(),
    "scoped asset insert",
  );
  if (insertedAsset?.user_id !== userId || insertedAsset?.project_id !== projectId) {
    throw new Error("[neon-adapter] scoped asset ownership was not applied");
  }

  const updatedProject = assertSuccess(
    await admin
      .from("projects")
      .update({
        project_state: { meta: { title: "Neon adapter verified" } },
        title: "Neon adapter verified",
      })
      .eq("id", projectId)
      .select("id, title, project_state")
      .single(),
    "project update",
  );
  if (
    updatedProject?.title !== "Neon adapter verified" ||
    updatedProject?.project_state?.meta?.title !== "Neon adapter verified"
  ) {
    throw new Error("[neon-adapter] project update was not persisted");
  }

  assertSuccess(
    await admin.from("project_messages").upsert(
      {
        id: messageId,
        parts: { text: "first" },
        project_id: projectId,
        role: "user",
        user_id: userId,
      },
      { onConflict: "id" },
    ),
    "message upsert insert",
  );
  assertSuccess(
    await admin.from("project_messages").upsert(
      {
        id: messageId,
        parts: { text: "updated" },
        project_id: projectId,
        role: "user",
        user_id: userId,
      },
      { onConflict: "id" },
    ),
    "message upsert update",
  );
  const upsertedMessage = assertSuccess(
    await admin.from("project_messages").select("id, parts").eq("id", messageId).single(),
    "message upsert read",
  );
  if (upsertedMessage?.parts?.text !== "updated") {
    throw new Error("[neon-adapter] JSON message upsert was not persisted");
  }

  const countedProjects = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("id", projectId);
  assertSuccess(countedProjects, "project count");
  if (countedProjects.count !== 1) {
    throw new Error(`[neon-adapter] expected project count 1, got ${countedProjects.count}`);
  }

  const skills = assertSuccess(
    await admin
      .from("agent_skills")
      .select("id, app_id, version")
      .eq("is_active", true)
      .order("sort_order")
      .limit(1),
    "skill read",
  );
  if (!skills?.[0]?.id) throw new Error("[neon-adapter] migrated skills are not readable");

  const rpcRows = assertSuccess(
    await admin.rpc("update_agent_skill_body", {
      p_actor_id: userId,
      p_actor_name: "Neon migration smoke test",
      p_actor_type: "coding_agent",
      p_app_id: skills[0].app_id,
      p_body_md: "This should never be written.",
      p_expected_version: -1,
    }),
    "skill RPC",
  );
  if (!Array.isArray(rpcRows) || rpcRows.length !== 0) {
    throw new Error("[neon-adapter] non-matching skill RPC should return no rows");
  }
} finally {
  const assetDelete = await admin.from("project_assets").delete().eq("id", assetId);
  const projectDelete = await admin.from("projects").delete().eq("id", projectId);
  if (assetDelete.error || projectDelete.error) {
    throw new Error(
      `[neon-adapter] smoke-test cleanup failed: ${
        assetDelete.error?.message ?? projectDelete.error?.message
      }`,
    );
  }
}

console.log("[neon-adapter] read/write/ownership smoke test verified");

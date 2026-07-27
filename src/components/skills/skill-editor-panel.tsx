import { useCallback, useEffect, useRef, useState } from "react";
import { History, Redo2, Sparkles, Undo2 } from "lucide-react";

import {
  improveSkillMd,
  listSkillMdVersions,
  readSkillMd,
  readSkillMdVersion,
  restoreSkillMdVersion,
  writeSkillMd,
  type SkillMdVersion,
} from "@/lib/skills/skill-md.functions";
import { AnimatePresence, motion } from "@/components/studio/agent/motion-primitives";
import { cn } from "@/lib/utils";

export type SkillEditorSelection = {
  appId: string;
  label: string;
};

export function SkillEditorPanel({
  selectedApp,
  onClose,
}: {
  selectedApp: SkillEditorSelection | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string>("");
  const [original, setOriginal] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<SkillMdVersion[]>([]);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [viewingMeta, setViewingMeta] = useState<SkillMdVersion | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const focusSnapshot = useRef<string>("");
  const [instruction, setInstruction] = useState("");
  const [improving, setImproving] = useState(false);
  const appId = selectedApp?.appId;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    setVersion(null);
    try {
      const [res, history] = await Promise.all([
        readSkillMd({ data: { appId } }),
        listSkillMdVersions({ data: { appId } }),
      ]);
      setContent(res.content);
      setOriginal(res.content);
      setVersion(res.version);
      setVersions(history.versions);
      setViewingVersion(null);
      setViewingMeta(null);
      setPast([]);
      setFuture([]);
      focusSnapshot.current = res.content;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshVersions = useCallback(async () => {
    if (!appId) return;
    const history = await listSkillMdVersions({ data: { appId } });
    setVersions(history.versions);
  }, [appId]);

  const dirty = viewingVersion === null && content !== original;
  const canSave =
    dirty && !saving && !loading && !improving && !!appId && version !== null;
  const canUndo = viewingVersion === null && past.length > 0 && !improving;
  const canRedo = viewingVersion === null && future.length > 0 && !improving;

  const undo = () => {
    setPast((items) => {
      if (!items.length) return items;
      const prev = items[items.length - 1];
      setFuture((next) => [content, ...next]);
      setContent(prev);
      focusSnapshot.current = prev;
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setPast((prev) => [...prev, content]);
      setContent(next);
      focusSnapshot.current = next;
      return items.slice(1);
    });
  };

  const commitManualEdit = () => {
    if (content !== focusSnapshot.current) {
      setPast((items) => [...items, focusSnapshot.current]);
      setFuture([]);
      focusSnapshot.current = content;
    }
  };

  const improve = async () => {
    if (
      !appId ||
      !instruction.trim() ||
      improving ||
      viewingVersion !== null ||
      version === null
    ) {
      return;
    }

    setImproving(true);
    setError(null);
    try {
      let expectedVersion = version;
      let agentInputContent = content;

      if (dirty) {
        const saved = await writeSkillMd({
          data: { appId, content, expectedVersion },
        });
        expectedVersion = saved.version;
        agentInputContent = saved.content;
        setContent(saved.content);
        setOriginal(saved.content);
        setVersion(saved.version);
        setSavedAt(Date.now());
        focusSnapshot.current = saved.content;
        await refreshVersions();
      }

      const res = await improveSkillMd({
        data: {
          appId,
          content: agentInputContent,
          instruction: instruction.trim(),
          expectedVersion,
        },
      });
      setPast((items) => [...items, agentInputContent]);
      setFuture([]);
      setContent(res.content);
      setOriginal(res.content);
      setVersion(res.version);
      setSavedAt(Date.now());
      focusSnapshot.current = res.content;
      setInstruction("");
      await refreshVersions();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setImproving(false);
    }
  };

  const save = async () => {
    if (!appId || version === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await writeSkillMd({
        data: { appId, content, expectedVersion: version },
      });
      setContent(result.content);
      setOriginal(result.content);
      setVersion(result.version);
      setSavedAt(Date.now());
      focusSnapshot.current = result.content;
      await refreshVersions();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const selectVersion = async (targetVersion: number) => {
    if (!appId || version === null || targetVersion === viewingVersion) return;
    if (dirty) {
      setError("Save or reload your changes before opening version history.");
      return;
    }
    if (targetVersion === version) {
      await load();
      return;
    }

    setHistoryLoading(true);
    setError(null);
    try {
      const snapshot = await readSkillMdVersion({
        data: { appId, version: targetVersion },
      });
      setContent(snapshot.content);
      setViewingVersion(snapshot.version);
      setViewingMeta({
        version: snapshot.version,
        actorType: snapshot.actorType,
        actorName: snapshot.actorName,
        action: snapshot.action,
        restoredFromVersion: snapshot.restoredFromVersion,
        createdAt: snapshot.createdAt,
      });
      focusSnapshot.current = snapshot.content;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreViewedVersion = async () => {
    if (!appId || version === null || viewingVersion === null || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const previousCurrent = original;
      const result = await restoreSkillMdVersion({
        data: {
          appId,
          targetVersion: viewingVersion,
          expectedVersion: version,
        },
      });
      setPast((items) => [...items, previousCurrent]);
      setFuture([]);
      setContent(result.content);
      setOriginal(result.content);
      setVersion(result.version);
      setViewingVersion(null);
      setViewingMeta(null);
      setSavedAt(Date.now());
      focusSnapshot.current = result.content;
      await refreshVersions();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setRestoring(false);
    }
  };

  const formatVersionLabel = (item: SkillMdVersion) => {
    const when = new Date(item.createdAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const restored =
      item.action === "restore" && item.restoredFromVersion
        ? ` · restored v${item.restoredFromVersion}`
        : "";
    return `${item.version === version ? "Current · " : ""}v${item.version} · ${item.actorName}${restored} · ${when}`;
  };

  return (
    <motion.div
      className="pointer-events-auto fixed bottom-4 right-4 top-4 z-[100] flex w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {selectedApp ? `Skill · ${selectedApp.label}` : "No skill selected"}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {appId ? `Supabase source · ${appId}` : "No skill selected."}
          </p>
          {appId && version !== null && versions.length > 0 && (
            <label className="mt-2 flex max-w-[390px] items-center gap-1.5">
              <History className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="sr-only">Version history</span>
              <select
                value={viewingVersion ?? version}
                onChange={(event) => void selectVersion(Number(event.target.value))}
                disabled={loading || historyLoading || saving || improving || restoring}
                aria-label="Version history"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary disabled:opacity-50"
              >
                {versions.map((item) => (
                  <option key={item.version} value={item.version}>
                    {formatVersionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => void load()}
            disabled={!appId || loading}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-5 py-4">
        {!appId ? (
          <p className="text-sm text-muted-foreground">Pick a skill to edit its Markdown.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading skill.md…</p>
        ) : (
          <textarea
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setError(null);
            }}
            onFocus={() => {
              focusSnapshot.current = content;
            }}
            onBlur={commitManualEdit}
            spellCheck={false}
            readOnly={viewingVersion !== null}
            disabled={improving || historyLoading || restoring}
            className={cn(
              "h-full w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none focus:border-primary disabled:opacity-60",
              viewingVersion !== null && "cursor-default bg-muted/30",
            )}
          />
        )}
      </div>
      {appId && !loading && viewingVersion === null && (
        <div className="border-t border-border px-5 py-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Ask the agent to improve this skill
          </label>
          <div className="flex items-end gap-2">
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void improve();
                }
              }}
              placeholder="e.g. Split the aspect-ratio step into its own turn"
              rows={2}
              spellCheck={false}
              disabled={improving}
              className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] leading-relaxed text-foreground outline-none focus:border-primary disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void improve()}
              disabled={!instruction.trim() || improving}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {improving ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-background border-t-transparent" />
                  Working…
                </>
              ) : (
                "Submit"
              )}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Each agent revision is saved as a new version. Cmd/Ctrl+Enter to send.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="min-w-0 text-[11px] text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : viewingMeta ? (
            <span>
              Viewing v{viewingMeta.version} by {viewingMeta.actorName}. Restore it to make
              this content current.
            </span>
          ) : dirty ? (
            <span>Unsaved changes — Save publishes to Supabase.</span>
          ) : savedAt ? (
            <span>Saved. Next agent turn uses the new prompt.</span>
          ) : (
            <span>
              Supabase is the source of truth. The next agent turn uses the saved version.
            </span>
          )}
        </div>
        {viewingVersion !== null ? (
          <button
            type="button"
            onClick={() => void restoreViewedVersion()}
            disabled={restoring || historyLoading}
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {restoring ? "Restoring…" : `Set v${viewingVersion} as current`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function SkillEditorOverlay({
  selectedApp,
  onClose,
}: {
  selectedApp: SkillEditorSelection | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {selectedApp && <SkillEditorPanel selectedApp={selectedApp} onClose={onClose} />}
    </AnimatePresence>
  );
}

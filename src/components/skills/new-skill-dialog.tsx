import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Bot, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createAgentSkill,
  type CreateAgentSkillInput,
} from "@/lib/skills/agent-skills.functions";
import { cn } from "@/lib/utils";

type NewSkillKind = "wizard" | "model";
type MediaMode = "image" | "video" | "audio" | "speech";

const DEFAULT_WORKFLOW_BLOCKS = ["BLK_FORM", "BLK_OPTIONS", "BLK_ACTIONS"];
const DEFAULT_MODEL_BLOCKS = ["BLK_FORM", "BLK_MEDIA", "BLK_ACTIONS"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitCommaList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseWorkflowSteps(value: string): Array<{ id: string; intent: string }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\s+(?:—|–|-)\s+/, 2);
      const title = parts[0] || `Step ${index + 1}`;
      return {
        id: slugify(title) || `step-${index + 1}`,
        intent: (parts[1] || line).trim(),
      };
    });
}

function yamlList(values: string[]): string {
  return `[${values.join(", ")}]`;
}

function buildBody(input: {
  appId: string;
  label: string;
  kind: NewSkillKind;
  intent: string;
  matches: string[];
  model: string;
  mode: MediaMode;
  steps: Array<{ id: string; intent: string }>;
  usesBlocks: string[];
  instructions: string;
}): string {
  const id = `SKL_${input.appId.toUpperCase().replace(/-/g, "_")}`;
  const frontmatter = [
    "---",
    `id: ${id}`,
    `appId: ${input.appId}`,
    `label: ${input.label}`,
    `kind: ${input.kind}`,
    `intent: ${input.intent}`,
    `oneLiner: ${input.intent}`,
    `outputs: ${input.kind === "model" ? yamlList([input.mode]) : "[]"}`,
    `matches: ${yamlList(input.matches)}`,
    `usesBlocks: ${yamlList(input.usesBlocks)}`,
    ...(input.kind === "model" ? [`model: ${input.model}`, `mode: ${input.mode}`] : []),
    "---",
    "",
    `# ${input.label}`,
    "",
    input.intent,
  ];

  const custom = input.instructions.trim();
  if (custom) return [...frontmatter, "", custom].join("\n");

  if (input.kind === "model") {
    return [
      ...frontmatter,
      "",
      "Collect the model parameters in one turn, run the configured model, and show the result as a media block.",
    ].join("\n");
  }

  return [
    ...frontmatter,
    "",
    "## Workflow",
    "",
    ...input.steps.map((step, index) => `${index + 1}. **${step.id}** — ${step.intent}`),
  ].join("\n");
}

export function NewSkillDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createSkill = useServerFn(createAgentSkill);
  const queryClient = useQueryClient();
  const slugTouched = useRef(false);

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<NewSkillKind>("wizard");
  const [label, setLabel] = useState("");
  const [appId, setAppId] = useState("");
  const [intent, setIntent] = useState("");
  const [matchesText, setMatchesText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<MediaMode>("video");
  const [blocksText, setBlocksText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [reviewBody, setReviewBody] = useState("");

  useEffect(() => {
    if (!open) return;
    slugTouched.current = false;
    setStep(0);
    setKind("wizard");
    setLabel("");
    setAppId("");
    setIntent("");
    setMatchesText("");
    setStepsText("");
    setModel("");
    setMode("video");
    setBlocksText("");
    setInstructions("");
    setReviewBody("");
  }, [open]);

  const matches = useMemo(() => splitCommaList(matchesText), [matchesText]);
  const workflowSteps = useMemo(() => parseWorkflowSteps(stepsText), [stepsText]);
  const usesBlocks = useMemo(() => {
    const entered = splitCommaList(blocksText).map((value) => value.toUpperCase());
    if (entered.length) return entered;
    return kind === "wizard" ? DEFAULT_WORKFLOW_BLOCKS : DEFAULT_MODEL_BLOCKS;
  }, [blocksText, kind]);
  const blocksValid = usesBlocks.every((block) => /^BLK_[A-Z0-9_]+$/.test(block));

  const baseValid =
    label.trim().length > 0 &&
    /^[a-z0-9][a-z0-9-]*$/.test(appId) &&
    intent.trim().length > 0;
  const configurationValid =
    blocksValid &&
    (kind === "wizard"
      ? workflowSteps.length > 0
      : model.trim().length > 0 && mode.length > 0);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateAgentSkillInput = {
        appId,
        label: label.trim(),
        kind,
        intent: intent.trim(),
        oneLiner: intent.trim(),
        matches,
        model: kind === "model" ? model.trim() : null,
        mode: kind === "model" ? mode : null,
        steps: kind === "wizard" ? workflowSteps : [],
        usesBlocks,
        bodyMd: reviewBody,
      };
      return createSkill({ data: payload });
    },
    onSuccess: ({ skill, actorName }) => {
      toast.success(`Created ${skill.appId} · v${skill.version} by ${actorName}`);
      void queryClient.invalidateQueries({ queryKey: ["agent-skills-catalog"] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not create the skill");
    },
  });

  const advance = () => {
    if (step === 0 && baseValid) {
      setStep(1);
      return;
    }
    if (step === 1 && configurationValid) {
      setReviewBody(
        buildBody({
          appId,
          label: label.trim(),
          kind,
          intent: intent.trim(),
          matches,
          model: model.trim(),
          mode,
          steps: workflowSteps,
          usesBlocks,
          instructions,
        }),
      );
      setStep(2);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
        <div className="border-b border-border px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              {["Basics", "Configuration", "Review"].map((item, index) => (
                <span
                  key={item}
                  className={cn(
                    "rounded-full px-2 py-1",
                    step === index && "bg-foreground text-background",
                  )}
                >
                  {index + 1}. {item}
                </span>
              ))}
            </div>
            <DialogTitle className="font-display text-2xl">New Skill</DialogTitle>
            <DialogDescription>
              Create a reusable capability for the agent. It will be available immediately.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <Label className="mb-2 block">Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      id: "wizard" as const,
                      title: "Workflow",
                      copy: "A guided, multi-step process.",
                      icon: Workflow,
                    },
                    {
                      id: "model" as const,
                      title: "Model",
                      copy: "A direct image, video, audio, or voice model.",
                      icon: Bot,
                    },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setKind(option.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
                        kind === option.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card hover:border-foreground/30",
                      )}
                    >
                      <option.icon className="mt-0.5 h-5 w-5 shrink-0" />
                      <span>
                        <span className="block text-sm font-semibold">{option.title}</span>
                        <span
                          className={cn(
                            "mt-1 block text-xs",
                            kind === option.id
                              ? "text-background/70"
                              : "text-muted-foreground",
                          )}
                        >
                          {option.copy}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="skill-name">Name</Label>
                  <Input
                    id="skill-name"
                    value={label}
                    onChange={(event) => {
                      const next = event.target.value;
                      setLabel(next);
                      if (!slugTouched.current) setAppId(slugify(next));
                    }}
                    placeholder="Campaign Storyboard"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="skill-id">Skill ID</Label>
                  <Input
                    id="skill-id"
                    value={appId}
                    onChange={(event) => {
                      slugTouched.current = true;
                      setAppId(slugify(event.target.value));
                    }}
                    placeholder="campaign-storyboard"
                    className="mt-1.5 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="skill-description">What does this skill do?</Label>
                <Textarea
                  id="skill-description"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                  placeholder="Turn a campaign brief into a review-ready visual storyboard."
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <Label htmlFor="skill-matches">Trigger phrases</Label>
                <Input
                  id="skill-matches"
                  value={matchesText}
                  onChange={(event) => setMatchesText(event.target.value)}
                  placeholder="storyboard campaign, campaign concepts, ad storyboard"
                  className="mt-1.5"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Comma-separated phrases that should activate this skill.
                </p>
              </div>

              {kind === "wizard" ? (
                <div>
                  <Label htmlFor="skill-steps">Workflow steps</Label>
                  <Textarea
                    id="skill-steps"
                    value={stepsText}
                    onChange={(event) => setStepsText(event.target.value)}
                    placeholder={
                      "Brief — Collect the campaign goal and audience\nConcepts — Present three creative directions\nStoryboard — Build and review the shot list"
                    }
                    rows={6}
                    className="mt-1.5 font-mono text-xs"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    One step per line, formatted as “Name — instruction”.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_180px] gap-4">
                  <div>
                    <Label htmlFor="skill-model">Model identifier</Label>
                    <Input
                      id="skill-model"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="provider/model-name"
                      className="mt-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="skill-mode">Output</Label>
                    <select
                      id="skill-mode"
                      value={mode}
                      onChange={(event) => setMode(event.target.value as MediaMode)}
                      className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                      <option value="speech">Voice</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="skill-blocks">Interface blocks</Label>
                <Input
                  id="skill-blocks"
                  value={blocksText}
                  onChange={(event) => setBlocksText(event.target.value)}
                  aria-invalid={!blocksValid}
                  placeholder={
                    kind === "wizard"
                      ? "BLK_FORM, BLK_OPTIONS, BLK_ACTIONS"
                      : "BLK_FORM, BLK_MEDIA, BLK_ACTIONS"
                  }
                  className="mt-1.5 font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Optional. Defaults are filled automatically.
                </p>
                {!blocksValid && (
                  <p className="mt-1.5 text-xs text-destructive">
                    Block names must start with BLK_ and use only letters, numbers, or
                    underscores.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="skill-instructions">Additional instructions</Label>
                <Textarea
                  id="skill-instructions"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Add any guardrails, output requirements, or special behavior…"
                  rows={5}
                  className="mt-1.5 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{label}</span>
                  <span className="rounded-full bg-foreground px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-background">
                    {kind === "wizard" ? "Workflow" : "Model"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{appId}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{intent}</p>
              </div>
              <div>
                <Label htmlFor="skill-playbook">Playbook Markdown</Label>
                <Textarea
                  id="skill-playbook"
                  value={reviewBody}
                  onChange={(event) => setReviewBody(event.target.value)}
                  rows={16}
                  className="mt-1.5 font-mono text-xs leading-relaxed"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  You can edit this now or refine it later in the Live Skill editor.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => current - 1)}
              disabled={mutation.isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {step < 2 ? (
            <Button
              type="button"
              onClick={advance}
              disabled={step === 0 ? !baseValid : !configurationValid}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!reviewBody.trim() || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Skill
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

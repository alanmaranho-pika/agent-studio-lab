import { useMemo } from "react";
import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { paramsFor, type ParamControl } from "@/lib/model-params";
import { cn } from "@/lib/utils";

export type ParamValues = Record<string, string | number | boolean>;

export function summarizeParams(model: string | null, values: ParamValues): string {
  if (!model) return "";
  const controls = paramsFor(model);
  if (!controls.length) return "";
  const parts: string[] = [];
  for (const c of controls) {
    const v = values[c.key];
    if (v === undefined || v === null || v === "") continue;
    if (c.type === "select") {
      const opt = c.options.find((o) => String(o.value) === String(v));
      parts.push(opt?.label ?? String(v));
    } else if (c.type === "slider") {
      parts.push(`${v}${c.unit ?? ""}`);
    } else if (c.type === "toggle" && v) {
      parts.push(c.label);
    }
  }
  return parts.join(" · ");
}

export function ModelSettingsPopover({
  model,
  values,
  onChange,
}: {
  model: string | null;
  values: ParamValues;
  onChange: (next: ParamValues) => void;
}) {
  const controls = useMemo(() => (model ? paramsFor(model) : []), [model]);
  const summary = useMemo(() => summarizeParams(model, values), [model, values]);
  if (!model || controls.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-[280px] items-center gap-1.5 truncate rounded-md px-2 py-1 text-xs font-normal text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          aria-label="Model settings"
          title={summary || "Settings"}
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{summary || "Settings"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] space-y-2 p-3"
      >
        {controls.map((c) => (
          <ParamRow
            key={c.key}
            control={c}
            value={values[c.key]}
            onChange={(v) => onChange({ ...values, [c.key]: v })}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ParamRow({
  control,
  value,
  onChange,
}: {
  control: ParamControl;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  if (control.type === "select") {
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{control.label}</span>
        <select
          value={String(value ?? control.default)}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 rounded-md border border-hairline bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
        >
          {control.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (control.type === "slider") {
    const v = typeof value === "number" ? value : control.default;
    return (
      <label className="flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-muted-foreground">{control.label}</span>
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 accent-primary"
        />
        <span className="w-10 text-right tabular-nums text-foreground">
          {v}
          {control.unit ?? ""}
        </span>
      </label>
    );
  }
  const v = typeof value === "boolean" ? value : control.default;
  return (
    <button
      type="button"
      onClick={() => onChange(!v)}
      className={cn(
        "flex w-full items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition",
        v
          ? "border-primary bg-primary text-primary-foreground"
          : "border-hairline bg-background text-muted-foreground",
      )}
    >
      {control.label}
    </button>
  );
}

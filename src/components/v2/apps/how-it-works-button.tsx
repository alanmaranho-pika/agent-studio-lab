import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { HowItWorksV2 } from "@/components/v2/apps/how-it-works";
import type { Skill } from "@/lib/skills";

export function HowItWorksButton({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How it works"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Info className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl overflow-y-auto max-h-[85vh] p-6">
          <DialogTitle className="sr-only">How {skill.label} works</DialogTitle>
          <HowItWorksV2 skill={skill} />
        </DialogContent>
      </Dialog>
    </>
  );
}

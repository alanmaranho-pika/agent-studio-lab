// Global controller so any callsite can open the upgrade dialog without
// prop drilling. Mount <UpgradeDialogHost /> once near the root.
import { useEffect, useState } from "react";
import { UpgradeDialog } from "./upgrade-dialog";

type OpenDetail = { requiredCredits?: number; reason?: string };

let listeners: Array<(d: OpenDetail) => void> = [];

export function openUpgradeDialog(detail: OpenDetail = {}) {
  for (const l of listeners) l(detail);
}

export function UpgradeDialogHost() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<OpenDetail>({});

  useEffect(() => {
    const fn = (d: OpenDetail) => {
      setDetail(d);
      setOpen(true);
    };
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((x) => x !== fn);
    };
  }, []);

  return (
    <UpgradeDialog
      open={open}
      onOpenChange={setOpen}
      requiredCredits={detail.requiredCredits}
      reason={detail.reason}
    />
  );
}

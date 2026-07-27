"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/types";

type TourStep = {
  href: string;
  targetId: string;
  title: string;
  text: string;
};

const tours: Record<Role, TourStep[]> = {
  "System Admin": [
    { href: "/dashboard", targetId: "tour-dashboard", title: "Dashboard", text: "Review account, label, and custody activity." },
    { href: "/admin/users", targetId: "tour-users", title: "User access", text: "Approve requests and manage account status." },
    { href: "/admin/barcodes", targetId: "tour-barcodes", title: "Barcode batches", text: "Generate and print issued field labels." },
    { href: "/admin/lookup", targetId: "tour-lookup", title: "Evidence lookup", text: "Find a record from its barcode." },
    { href: "/history", targetId: "tour-history", title: "Custody history", text: "Review the shared movement record." },
    { href: "/settings", targetId: "tour-settings", title: "Settings", text: "Review your account and replay this tour." }
  ],
  Investigator: [
    { href: "/dashboard", targetId: "tour-dashboard", title: "Dashboard", text: "See saved drafts and current field work." },
    { href: "/scan", targetId: "tour-scan", title: "Barcode", text: "Start a record, then assign an issued label." },
    { href: "/capture", targetId: "tour-capture", title: "2D capture", text: "Add scene photos before filing the details." },
    { href: "/evidence", targetId: "tour-details", title: "Details", text: "Complete the collection record and sign it." },
    { href: "/transfer", targetId: "tour-transfer", title: "Transfer", text: "Choose the destination lab and sign the handoff." }
  ],
  "Laboratory Analyst": [
    { href: "/dashboard", targetId: "tour-dashboard", title: "Dashboard", text: "Track incoming and stored evidence." },
    { href: "/evidence", targetId: "tour-evidence-review", title: "Evidence review", text: "Review collection details and 2D photos." },
    { href: "/lab", targetId: "tour-lab", title: "Lab receive", text: "Match the bag label before accepting custody." },
    { href: "/history", targetId: "tour-history", title: "Custody history", text: "Review signed movement events." }
  ]
};

export function AccountProcessDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="tour-scrim" role="presentation">
      <section className="account-process-dialog" role="dialog" aria-modal="true" aria-labelledby="account-process-title">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">New account guide</p>
        <h2 id="account-process-title" className="mt-1 text-xl font-semibold text-white">Request account access</h2>
        <ol className="account-process-list mt-4">
          <li><span>01</span><div><strong>Request access</strong><p>Choose Investigator or Laboratory Analyst.</p></div></li>
          <li><span>02</span><div><strong>Verify email</strong><p>Open the confirmation message from FORENX.</p></div></li>
          <li><span>03</span><div><strong>Wait for approval</strong><p>A System Admin checks your request.</p></div></li>
          <li><span>04</span><div><strong>Sign in</strong><p>Approved accounts open their role workspace.</p></div></li>
        </ol>
        <p className="mt-4 text-xs leading-5 text-slate-500">System Admin accounts use the trusted administrator process.</p>
        <button className="btn-primary mt-5 w-full" type="button" onClick={onClose}>Got it</button>
      </section>
    </div>
  );
}

export function TourPrompt({ role, onStart, onDismiss }: { role: Role; onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="tour-scrim" role="presentation">
      <section className="tour-prompt" role="dialog" aria-modal="true" aria-labelledby="tour-prompt-title">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Website tour</p>
        <h2 id="tour-prompt-title" className="mt-1 text-xl font-semibold text-white">Learn your {role} workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">A short guide shows the pages used in your work.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" type="button" onClick={onStart}>Start tour</button>
          <button className="btn-secondary" type="button" onClick={onDismiss}>Not now</button>
        </div>
      </section>
    </div>
  );
}

export function GuidedTour({
  role,
  index,
  onIndexChange,
  onEnd
}: {
  role: Role;
  index: number;
  onIndexChange: (step: number) => void;
  onEnd: (response: "dismissed" | "completed") => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => tours[role], [role]);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<{ left: number; top: number } | undefined>();
  const safeIndex = Math.min(Math.max(index, 0), steps.length - 1);
  const step = steps[safeIndex];

  const finish = useCallback(async (response: "dismissed" | "completed") => {
    if (busy) return;
    setBusy(true);
    await onEnd(response);
    setBusy(false);
  }, [busy, onEnd]);

  useEffect(() => {
    if (pathname !== step.href) router.push(step.href);
  }, [pathname, router, step.href]);

  useEffect(() => {
    let target: HTMLElement | null = null;
    const findTarget = () => {
      target = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
      if (!target) return;
      target.classList.add("forenx-tour-target");
      target.setAttribute("aria-describedby", "forenx-tour-panel");
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      const rect = target.getBoundingClientRect();
      const panelWidth = 336;
      const margin = 16;
      const roomOnRight = window.innerWidth - rect.right - margin;
      const left = roomOnRight >= panelWidth ? rect.right + margin : Math.max(margin, rect.left - panelWidth - margin);
      const top = Math.max(margin, Math.min(window.innerHeight - 248, rect.top));
      setPlacement({ left, top });
    };

    const timer = window.setTimeout(findTarget, 120);
    return () => {
      window.clearTimeout(timer);
      target?.classList.remove("forenx-tour-target");
      target?.removeAttribute("aria-describedby");
    };
  }, [pathname, step.targetId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void finish("dismissed");
      if (event.key === "ArrowLeft" && safeIndex > 0) onIndexChange(safeIndex - 1);
      if (event.key === "ArrowRight" && safeIndex < steps.length - 1) onIndexChange(safeIndex + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, onIndexChange, safeIndex, steps.length]);

  function next() {
    if (safeIndex === steps.length - 1) {
      void finish("completed");
      return;
    }
    onIndexChange(safeIndex + 1);
  }

  return (
    <>
      <div className="tour-backdrop" aria-hidden="true" />
      <section id="forenx-tour-panel" className="tour-panel" style={placement} role="dialog" aria-modal="true" aria-label="Website tour">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Tour {safeIndex + 1} of {steps.length}</p>
          <button className="text-xs font-semibold text-slate-400 hover:text-white" type="button" onClick={() => void finish("dismissed")} disabled={busy}>Skip</button>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-white">{step.title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">{step.text}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button className="btn-secondary min-h-9" type="button" onClick={() => onIndexChange(Math.max(0, safeIndex - 1))} disabled={safeIndex === 0 || busy}>Back</button>
          <button className="btn-primary min-h-9" type="button" onClick={next} disabled={busy}>{safeIndex === steps.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </section>
    </>
  );
}

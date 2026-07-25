"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ComponentType, KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  Activity,
  Archive,
  Barcode,
  Box,
  FileText,
  FlaskConical,
  Home,
  Lock,
  Printer,
  QrCode,
  RotateCcw,
  ScanLine,
  Settings,
  ShieldCheck,
  Signature,
  Users
} from "./icons";
import type { AppView, Evidence, Role } from "@/lib/types";
import { useForenxStore } from "./forenx-store";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
  visible?: boolean;
  hiddenFor?: Role[];
  workflow?: boolean;
};

const allRoles: Role[] = ["System Admin", "Investigator", "Laboratory Analyst"];

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home, roles: allRoles },
  { label: "Users", href: "/admin/users", icon: Users, roles: ["System Admin"] },
  { label: "Barcodes", href: "/admin/barcodes", icon: QrCode, roles: ["System Admin"] },
  { label: "Evidence lookup", href: "/admin/lookup", icon: ScanLine, roles: ["System Admin"] },
  { label: "Create evidence", href: "/scan", icon: ScanLine, roles: ["Investigator"], workflow: true },
  { label: "Capture", href: "/capture", icon: Box, roles: ["Investigator"], visible: false },
  { label: "Evidence", href: "/evidence", icon: FileText, roles: ["Investigator", "Laboratory Analyst"], hiddenFor: ["Investigator"] },
  { label: "Transfer", href: "/transfer", icon: Signature, roles: ["Investigator"], visible: false },
  { label: "Lab", href: "/lab", icon: FlaskConical, roles: ["Laboratory Analyst"] },
  { label: "History", href: "/history", icon: Archive, roles: allRoles },
  { label: "Settings", href: "/settings", icon: Settings, roles: allRoles }
];

const offenseTypes = ["Homicide", "Robbery", "Narcotics", "Assault", "Cybercrime"];
const categories = ["Weapon", "Electronic", "Biological", "Trace", "Document"];
const labs = [
  "Forensic Lab - Ballistics Dept",
  "Forensic Lab - Chemistry Dept",
  "Forensic Lab - Digital Evidence",
  "Forensic Lab - Biology Unit"
];

const evidenceWorkflowPaths = ["/scan", "/capture", "/evidence", "/transfer"];

export default function ForenxApp({ view }: { view: AppView }) {
  const pathname = usePathname();
  const router = useRouter();
  const store = useForenxStore();
  const { authMode, authReady, isAuthenticated, refreshSession } = store;
  const route = navItems.find((item) => item.href === pathname);
  const roleHasAccess = !route || route.roles.includes(store.role);

  useEffect(() => {
    if (view === "login" || !isAuthenticated || authMode !== "Supabase") return;

    let mounted = true;
    const verifyAccess = async () => {
      const active = await refreshSession();
      if (mounted && !active) router.replace("/login");
    };

    window.addEventListener("focus", verifyAccess);

    return () => {
      mounted = false;
      window.removeEventListener("focus", verifyAccess);
    };
  }, [authMode, isAuthenticated, refreshSession, router, view]);

  useEffect(() => {
    if (view !== "login" && authReady && isAuthenticated && !roleHasAccess) {
      router.replace("/dashboard");
    }
  }, [authReady, isAuthenticated, roleHasAccess, router, view]);

  if (view === "login") {
    return (
      <>
        <LoginView />
        <ActionToast />
      </>
    );
  }

  const showEvidenceWorkflow = store.isAuthenticated && store.role === "Investigator" && evidenceWorkflowPaths.includes(pathname);

  let content: ReactNode;
  if (!authReady) {
    content = <SessionRestoreView />;
  } else if (!store.isAuthenticated) {
    content = <LoginRequired />;
  } else if (!roleHasAccess) {
    content = <RestrictedView />;
  } else {
    content = (
      <>
        {view === "dashboard" && <DashboardView />}
        {view === "admin-users" && <AdminUsersView />}
        {view === "admin-barcodes" && <BarcodeView />}
        {view === "admin-lookup" && <AdminEvidenceLookupView />}
        {view === "scan" && <ScanView />}
        {view === "capture" && <CaptureView />}
        {view === "evidence" && <EvidenceView />}
        {view === "transfer" && <TransferView />}
        {view === "lab" && <LabView />}
        {view === "history" && <HistoryView />}
        {view === "settings" && <SettingsView />}
      </>
    );
  }

  return (
    <main className="command-shell min-h-screen overflow-x-hidden bg-void text-slate-100">
      <div className="flex min-h-screen w-full flex-col">
        <TopBar />
        <div className={`min-h-0 flex-1 ${store.isAuthenticated ? "grid lg:grid-cols-[208px_minmax(0,1fr)]" : "flex"}`}>
          {store.isAuthenticated && <SideNav pathname={pathname} role={store.role} />}
          <section className="command-workspace min-w-0 flex-1 overflow-x-hidden p-3 pb-20 sm:p-4 lg:pb-4">
            {store.isAuthenticated && <StatusStrip />}
            {showEvidenceWorkflow && <EvidenceWorkflowProgress record={store.activeEvidence} />}
            <div className={store.isAuthenticated ? "mt-3" : "mx-auto max-w-5xl"}>{content}</div>
          </section>
        </div>
      </div>
      <ActionToast />
    </main>
  );
}

function ActionToast() {
  const { message, messageVersion, dismissedMessageVersion, dismissMessage } = useForenxStore();

  useEffect(() => {
    if (messageVersion === 0 || dismissedMessageVersion === messageVersion) return;

    const timeout = window.setTimeout(dismissMessage, 3000);
    return () => window.clearTimeout(timeout);
  }, [dismissMessage, dismissedMessageVersion, messageVersion]);

  if (messageVersion === 0 || dismissedMessageVersion === messageVersion) return null;

  return (
    <div className="action-toast" role="status" aria-live="polite">
      <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
      <p>{message}</p>
    </div>
  );
}

function LoginRequired() {
  return (
    <Panel eyebrow="Authentication required" title="Sign in to open this workspace">
      <p className="text-sm text-slate-400">Sign in to view records.</p>
      <Link className="btn-primary mt-3" href="/login">Open sign in</Link>
    </Panel>
  );
}

function SessionRestoreView() {
  return (
    <Panel eyebrow="Session" title="Restoring secure session">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span className="h-2 w-2 shrink-0 animate-pulse bg-cyan-300" />
        Checking access.
      </div>
    </Panel>
  );
}

function RestrictedView() {
  return (
    <Panel eyebrow="Restricted route" title="Role access required">
      <p className="text-sm text-slate-400">This role has no access here.</p>
      <Link className="btn-primary mt-3" href="/dashboard">Return to dashboard</Link>
    </Panel>
  );
}

function TopBar() {
  const router = useRouter();
  const { authReady, role, currentUser, signOut } = useForenxStore();

  function handleSignOut() {
    signOut();
    router.push("/login");
  }

  return (
    <header className="command-header px-3 py-2.5 sm:px-5">
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Image className="forenx-mark" src="/images/forenx-x-logo.png" alt="" width={44} height={44} priority />
          <div className="min-w-0">
            <p className="hidden truncate text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300 sm:block">
              Barcode-based evidence tracking system
            </p>
            <h1 className="sm:mt-0.5">
              <Image className="forenx-wordmark-image" src="/images/forenx-wordmark.png" alt="FORENX" width={1284} height={180} priority />
            </h1>
            <p className="mt-1 hidden truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 md:block">
              Digital chain of custody for modern law enforcement
            </p>
          </div>
        </div>
        {authReady ? (
          <div className="hidden min-w-0 grid-cols-2 gap-2 text-xs lg:grid lg:grid-cols-[minmax(170px,1fr)_minmax(140px,1fr)_auto] xl:w-[540px]">
            <HeaderStat icon={ShieldCheck} label="Role" value={role} />
            <HeaderStat icon={Activity} label="User" value={currentUser.badgeId} />
            <button className="btn-secondary col-span-2 min-h-[48px] gap-2 px-3 text-left sm:col-span-1 sm:min-h-[52px]" type="button" onClick={handleSignOut}>
              <Lock className="h-4 w-4 shrink-0 text-slate-400" />
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Session</span>
                <span className="block text-sm font-semibold text-slate-100">Sign out</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="hidden w-full lg:block xl:w-[220px]">
            <HeaderStat icon={Activity} label="Session" value="Restoring..." />
          </div>
        )}
      </div>
    </header>
  );
}

function HeaderStat({
  icon: Icon,
  label,
  value
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="header-stat flex min-w-0 items-center gap-2 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold leading-5 text-slate-100">{value}</p>
      </div>
    </div>
  );
}

function SideNav({ pathname, role }: { pathname: string; role: Role }) {
  const visibleItems = navItems.filter(
    (item) => item.roles.includes(role) && item.visible !== false && !item.hiddenFor?.includes(role)
  );
  const settingsItem = visibleItems.find((item) => item.href === "/settings");
  const mobileItems = [
    ...visibleItems.filter((item) => item.href !== "/settings").slice(0, 4),
    ...(settingsItem ? [settingsItem] : [])
  ].slice(0, 5);
  const mobileColumns = mobileItems.length === 4 ? "grid-cols-4" : "grid-cols-5";

  return (
    <>
      <nav className="command-nav hidden p-3 lg:block">
        <p className="px-2 pb-3 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {role === "Investigator" ? "Field workflow" : role === "Laboratory Analyst" ? "Laboratory workspace" : "System control"}
        </p>
        <div className="space-y-1">
          {visibleItems.map((item) => (
            <NavLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
          ))}
        </div>
      </nav>
      <nav className={`command-mobile-nav fixed inset-x-0 bottom-0 z-30 grid ${mobileColumns} p-1 lg:hidden`}>
        {mobileItems.map((item) => (
          <MobileNavLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
        ))}
      </nav>
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const { startNewEvidence } = useForenxStore();
  const router = useRouter();

  if (item.workflow) {
    return (
      <button
        type="button"
        onClick={async () => {
          if (await startNewEvidence()) router.push(item.href);
        }}
        className={`command-nav-link flex min-w-0 w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm ${
          active
            ? "border-cyanline text-white"
            : "border-transparent text-slate-500 hover:text-slate-200"
        }`}
      >
        <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-slate-500"}`} />
        <span className="min-w-0 truncate">{item.label}</span>
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      className={`command-nav-link flex min-w-0 items-center gap-3 border-l-2 px-3 py-2.5 text-sm ${
        active
          ? "border-cyanline text-white"
          : "border-transparent text-slate-500 hover:text-slate-200"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-slate-500"}`} />
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const { startNewEvidence } = useForenxStore();
  const router = useRouter();

  if (item.workflow) {
    return (
      <button
        type="button"
        onClick={async () => {
          if (await startNewEvidence()) router.push(item.href);
        }}
        className={`command-mobile-link flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] ${
          active ? "text-cyan-300" : "text-slate-500"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="max-w-full truncate">{item.label}</span>
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      className={`command-mobile-link flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] ${
        active ? "text-cyan-300" : "text-slate-500"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

function isNavItemActive(item: NavItem, pathname: string) {
  return item.workflow ? evidenceWorkflowPaths.includes(pathname) : pathname === item.href;
}

function EvidenceWorkflowProgress({ record }: { record: Evidence }) {
  const completed = getWorkflowCompletedSteps(record);
  const currentStep = completed === 4 ? 4 : completed + 1;
  const steps = ["Barcode", "Capture", "Details", "Transfer"];

  return (
    <section className="workflow-strip mt-3" aria-label="Create evidence progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">Create evidence</p>
        <p className="text-xs font-semibold text-slate-400">
          {completed === 4 ? "Transfer complete" : `Step ${currentStep} of 4`}
        </p>
      </div>
      <ol className="mt-2 grid grid-cols-4 gap-1.5 sm:gap-2">
        {steps.map((label, index) => {
          const step = index + 1;
          const state = step <= completed ? "complete" : step === currentStep ? "current" : "upcoming";
          const stateClass = {
            complete: "workflow-step-complete",
            current: "workflow-step-current",
            upcoming: "workflow-step-upcoming"
          }[state];

          return (
            <li key={label} className={`workflow-step flex min-w-0 items-center gap-1.5 px-1.5 py-1.5 sm:px-2 ${stateClass}`}>
              <span className="grid h-5 w-5 shrink-0 place-items-center border border-current text-[10px] font-bold">{step}</span>
              <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function getWorkflowCompletedSteps(record: Evidence) {
  let completed = record.barcode ? 1 : 0;
  if (record.spatialCaptureStatus === "Captured") completed = 2;
  if (["Logged", "In Transit", "In Lab Custody", "Closed"].includes(record.status)) completed = 3;
  if (["In Transit", "In Lab Custody", "Closed"].includes(record.status)) completed = 4;
  return completed;
}

function resumeEvidencePath(record: Evidence) {
  if (record.status === "Draft") {
    if (!record.barcode) return "/scan";
    if (record.spatialCaptureStatus !== "Captured") return "/capture";
    return "/evidence";
  }

  if (record.status === "Logged") return "/transfer";
  return "/history";
}

function StatusStrip() {
  const { activeEvidence, currentUser, role } = useForenxStore();
  const hasActiveEvidence = activeEvidence.id !== "EV-DRAFT" || Boolean(activeEvidence.recoveryDateTime);

  return (
    <div className="flex min-h-10 flex-col gap-2 border border-slate-800 bg-[#07131f] px-3 py-2 text-xs text-slate-300 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">
          <span className="h-1.5 w-1.5 shrink-0 bg-emerald-400" />
          Session active
        </span>
        <span className="h-4 w-px bg-slate-800" />
        <span className="font-semibold text-white">{role}</span>
        <span className="min-w-0 truncate font-mono text-slate-400">{currentUser.email}</span>
      </div>
      {role !== "System Admin" && (
        <div className="flex shrink-0 items-center gap-2">
          {hasActiveEvidence ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Active evidence</span>
              <span className="font-mono text-slate-300">{activeEvidence.id}</span>
              <span className="status-pill">{activeEvidence.status}</span>
            </>
          ) : (
            <span className="text-[11px] font-semibold text-slate-500">No evidence selected</span>
          )}
        </div>
      )}
    </div>
  );
}

function LoginView() {
  const router = useRouter();
  const { signInWithPassword, signUpForAccess, submitSupportRequest, message } = useForenxStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<Extract<Role, "Investigator" | "Laboratory Analyst">>("Investigator");
  const [fullName, setFullName] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [agency, setAgency] = useState("");
  const [supportType, setSupportType] = useState<"Reactivation request" | "Sign-in issue" | "Other report">("Reactivation request");
  const [supportMessage, setSupportMessage] = useState("");
  const [mode, setMode] = useState<"Supabase" | "Request" | "Support">("Supabase");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (mode === "Request") {
      setSubmitting(true);
      await signUpForAccess({ fullName, email, password, requestedRole, badgeId, agency });
      setSubmitting(false);
      return;
    }

    if (mode === "Support") {
      setSubmitting(true);
      const sent = await submitSupportRequest({
        fullName,
        email,
        requestType: supportType,
        message: supportMessage
      });
      setSubmitting(false);
      if (sent) setSupportMessage("");
      return;
    }

    setSubmitting(true);
    const signedIn = await signInWithPassword(email, password);
    setSubmitting(false);
    if (signedIn) router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#030812] text-slate-100">
      <div className="login-shell grid min-h-screen min-w-0 grid-cols-1 lg:h-screen lg:overflow-hidden lg:grid-cols-[minmax(0,1.12fr)_minmax(430px,0.88fr)]">
        <section
          className="login-hero relative flex h-[17rem] shrink-0 min-w-0 overflow-hidden border-b border-slate-800 sm:h-[22rem] lg:h-full lg:border-b-0 lg:border-r"
        >
          <Image
            src="/images/forenx-login-evidence.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 56vw, 100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-[#020711]/70" />
          <span className="login-scan-grid" aria-hidden="true" />
          <span className="login-target login-target-top" aria-hidden="true" />
          <span className="login-target login-target-bottom" aria-hidden="true" />
          <div className="relative z-10 flex min-w-0 w-full flex-col px-6 py-5 sm:px-10 sm:py-9 lg:px-14 lg:py-12">
            <div className="flex min-w-0 items-center gap-3">
              <Image className="forenx-mark forenx-mark-login" src="/images/forenx-x-logo.png" alt="" width={50} height={50} priority />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">Evidence tracking system</p>
                <h1 className="mt-1">
                  <Image className="forenx-wordmark-image forenx-wordmark-image-login" src="/images/forenx-wordmark.png" alt="FORENX" width={1284} height={180} priority />
                </h1>
              </div>
            </div>
            <div className="mt-12 max-w-lg border-l-2 border-cyanline pl-4 sm:mt-auto">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Digital chain of custody</p>
              <p className="mt-2 text-sm leading-6 text-slate-200 sm:text-base">Track evidence from collection to lab.</p>
            </div>
          </div>
        </section>

        <section className="login-access flex min-w-0 items-center bg-[#050b14] px-5 py-8 sm:px-10 lg:overflow-y-auto lg:px-14">
          <div className="login-form mx-auto min-w-0">
            <div className="login-access-heading">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Secure access</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{mode === "Request" ? "Request FORENX access" : mode === "Support" ? "Contact System Admin" : "Sign in to FORENX"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{mode === "Request" ? "Admin approval is required." : mode === "Support" ? "Report an access issue." : "Sign in to continue."}</p>
              </div>
            </div>

            <div className="login-mode-tabs mt-7 grid min-w-0 grid-cols-2 gap-2 border-b border-slate-800 pb-4">
              <button className={mode === "Supabase" ? "btn-primary min-h-10" : "btn-secondary min-h-10"} type="button" onClick={() => setMode("Supabase")}>
                Secure account
              </button>
              <button className={mode === "Request" ? "btn-primary min-h-10" : "btn-secondary min-h-10"} type="button" onClick={() => setMode("Request")}>
                Request access
              </button>
            </div>

            {mode === "Support" ? (
              <div className="mt-5 grid gap-4">
                <TextField label="Full name" value={fullName} onChange={setFullName} />
                <TextField label="Email" value={email} onChange={setEmail} />
                <SelectField label="Report type" value={supportType} onChange={(value) => setSupportType(value as "Reactivation request" | "Sign-in issue" | "Other report")} options={["Reactivation request", "Sign-in issue", "Other report"]} />
                <label>
                  <span className="label">Details</span>
                  <textarea className="input mt-1 min-h-28 resize-y" value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} />
                </label>
              </div>
            ) : mode === "Request" ? (
              <div className="mt-5 grid gap-4">
                <TextField label="Full name" value={fullName} onChange={setFullName} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Requested role" value={requestedRole} onChange={(value) => setRequestedRole(value as Extract<Role, "Investigator" | "Laboratory Analyst">)} options={["Investigator", "Laboratory Analyst"]} />
                  <TextField label="Badge ID" value={badgeId} onChange={setBadgeId} />
                </div>
                <TextField label="Agency or laboratory" value={agency} onChange={setAgency} />
                <TextField label="Email" value={email} onChange={setEmail} />
                <TextField label="Password" value={password} onChange={setPassword} type="password" />
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <TextField label="Email" value={email} onChange={setEmail} />
                <TextField label="Password" value={password} onChange={setPassword} type="password" />
              </div>
            )}

            <button className="btn-primary mt-6 w-full min-h-11" type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting" : mode === "Request" ? "Submit access request" : mode === "Support" ? "Send report" : "Sign in"}
            </button>

            <div className="mt-4 border-l-2 border-slate-700 pl-3 text-xs leading-5 text-slate-400">
              <span className="font-semibold text-slate-300">{mode === "Supabase" ? "Secure sign-in" : mode === "Request" ? "Pending review required" : "Admin support queue"}</span>
              <span className="block">{message}</span>
            </div>
            {mode !== "Support" && (
              <button className="mt-4 text-left text-xs font-semibold text-cyan-300 hover:text-cyan-100" type="button" onClick={() => setMode("Support")}>
                Account inactive or need help? Contact System Admin
              </button>
            )}
            {mode === "Support" && (
              <button className="mt-4 text-left text-xs font-semibold text-cyan-300 hover:text-cyan-100" type="button" onClick={() => setMode("Supabase")}>
                Return to sign in
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardView() {
  const { role, users, evidence, barcodeBatches, custodyEvents } = useForenxStore();
  const drafts = evidence.filter((item) => item.status === "Draft").length;
  const readyForTransfer = evidence.filter((item) => item.status === "Logged").length;
  const inTransit = evidence.filter((item) => item.status === "In Transit").length;
  const inLab = evidence.filter((item) => item.status === "In Lab Custody").length;
  const closed = evidence.filter((item) => item.status === "Closed").length;
  const investigatorPriority = drafts > 0
    ? "Complete a saved draft"
    : readyForTransfer > 0
      ? "Sign a transfer"
      : inTransit > 0
        ? "Await lab receipt"
        : "No field work pending";

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Dashboard"
        title={`${role} workspace`}
        text="Evidence, transfers, and activity."
      />
      {role === "Investigator" && <InvestigatorWorkflowCommand />}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {role === "System Admin" && (
          <>
            <Metric icon={Users} label="Users" value={users.length.toString()} />
            <Metric icon={Barcode} label="Barcode batches" value={barcodeBatches.length.toString()} />
            <Metric icon={Archive} label="Custody events" value={custodyEvents.length.toString()} />
            <Metric icon={FlaskConical} label="In lab" value={inLab.toString()} />
          </>
        )}
        {role === "Investigator" && (
          <>
            <Metric icon={FileText} label="Saved drafts" value={drafts.toString()} />
            <Metric icon={Signature} label="Ready to transfer" value={readyForTransfer.toString()} />
            <Metric icon={Archive} label="In transit" value={inTransit.toString()} />
            <Metric icon={FlaskConical} label="Received by lab" value={inLab.toString()} />
          </>
        )}
        {role === "Laboratory Analyst" && (
          <>
            <Metric icon={Archive} label="Incoming evidence" value={inTransit.toString()} />
            <Metric icon={FlaskConical} label="In lab custody" value={inLab.toString()} />
            <Metric icon={FileText} label="Closed records" value={closed.toString()} />
            <Metric icon={Signature} label="Custody events" value={custodyEvents.length.toString()} />
          </>
        )}
      </div>
      <Grid columns="xl:grid-cols-[minmax(0,1fr)_320px]">
        <EvidenceTable records={evidence} />
        <Panel eyebrow={role === "Investigator" ? "Field queue" : "Next action"} title={role === "Investigator" ? "Current workload" : roleActionTitle(role)}>
          {role === "System Admin" && (
            <ActionLinks links={[["Manage users", "/admin/users"], ["Generate barcodes", "/admin/barcodes"], ["Evidence lookup", "/admin/lookup"], ["Custody history", "/history"]]} />
          )}
          {role === "Investigator" && (
            <>
              <DetailRows rows={[["Saved drafts", drafts.toString()], ["Ready for transfer", readyForTransfer.toString()], ["In transit", inTransit.toString()]]} />
              <div className="mt-3 border-l-2 border-cyan-500/70 bg-[#07171b] px-3 py-2.5">
                <p className="label">Priority</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{investigatorPriority}</p>
              </div>
            </>
          )}
          {role === "Laboratory Analyst" && (
            <ActionLinks links={[["Receive evidence", "/lab"], ["View custody history", "/history"]]} />
          )}
          {role !== "Investigator" && (
            <div className="mt-3">
              <DetailRows rows={[["Incoming transfers", inTransit.toString()], ["Stored evidence", inLab.toString()]]} />
            </div>
          )}
        </Panel>
      </Grid>
    </div>
  );
}

function InvestigatorWorkflowCommand() {
  const router = useRouter();
  const { activeEvidence, evidence, selectEvidence, startNewEvidence, deleteDraftEvidence } = useForenxStore();
  const selectedEvidence = evidence.find((record) => record.id === activeEvidence.id);

  function continueRecord(record: Evidence) {
    selectEvidence(record.id);
    router.push(resumeEvidencePath(record));
  }

  function selectRecord(record: Evidence) {
    selectEvidence(record.id);
  }

  function selectRecordFromKeyboard(event: KeyboardEvent, record: Evidence) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectRecord(record);
  }

  async function startRecord() {
    if (await startNewEvidence()) router.push("/scan");
  }

  return (
    <section className="workflow-command" aria-label="Evidence workflow command">
      <div className="flex flex-col gap-2 border-b border-slate-700/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">Create evidence</p>
          <p className="mt-0.5 text-sm font-semibold text-white">Field intake workflow</p>
        </div>
        <button className="btn-primary min-h-9 shrink-0" type="button" onClick={startRecord}>
          Start new record
        </button>
      </div>
      <div className="border-b border-slate-700/80">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="label">Saved records</span>
          <span className="text-xs font-semibold text-slate-500">{evidence.length} total</span>
        </div>
        <div className="workflow-record-table-wrap hidden lg:block">
          <table className="data-table workflow-record-table">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Barcode</th>
                <th>Case</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((record) => {
                const recordStep = getWorkflowCompletedSteps(record);
                const pending = record.status === "Draft" || record.status === "Logged";
                return (
                  <tr
                    key={record.id}
                    className={selectedEvidence?.id === record.id ? "workflow-record-selected" : "workflow-record-row"}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selectedEvidence?.id === record.id}
                    onClick={() => selectRecord(record)}
                    onKeyDown={(event) => selectRecordFromKeyboard(event, record)}
                  >
                    <td><CellText value={record.id} mono /></td>
                    <td><CellText value={record.barcode || "Not assigned"} mono /></td>
                    <td><CellText value={record.caseNumber || "Not entered"} /></td>
                    <td><Tag label={record.status} tone={record.status === "Draft" ? "slate" : "cyan"} /></td>
                    <td><span className="text-sm text-slate-300">{recordStep} of 4</span></td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button className="workflow-table-action" type="button" onClick={(event) => { event.stopPropagation(); continueRecord(record); }}>
                          {pending ? (record.status === "Logged" ? "Transfer" : "Continue") : "View history"}
                        </button>
                        {record.status === "Draft" && (
                          <button className="workflow-table-action workflow-table-delete" type="button" onClick={(event) => { event.stopPropagation(); deleteDraftEvidence(record.id); }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 px-3 pb-3 lg:hidden">
          {evidence.map((record) => {
            const recordStep = getWorkflowCompletedSteps(record);
            const pending = record.status === "Draft" || record.status === "Logged";
            const isSelected = selectedEvidence?.id === record.id;
            return (
              <article
                key={record.id}
                className={`workflow-record-card ${isSelected ? "workflow-record-card-selected" : ""}`}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                onClick={() => selectRecord(record)}
                onKeyDown={(event) => selectRecordFromKeyboard(event, record)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-slate-100">{record.id}</p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">{record.barcode || "No barcode assigned"}</p>
                  </div>
                  <Tag label={record.status} tone={record.status === "Draft" ? "slate" : "cyan"} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-800 py-2 text-xs">
                  <span className="text-slate-500">Case <b className="ml-1 font-medium text-slate-300">{record.caseNumber || "Not entered"}</b></span>
                  <span className="text-right text-slate-500">Progress <b className="ml-1 font-medium text-slate-300">{recordStep} / 4</b></span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-secondary min-h-8" type="button" onClick={(event) => { event.stopPropagation(); continueRecord(record); }}>
                    {pending ? (record.status === "Logged" ? "Transfer" : "Continue") : "View history"}
                  </button>
                  {record.status === "Draft" && (
                    <button className="min-h-8 border border-rose-900 px-2.5 text-xs font-semibold text-rose-300 hover:border-rose-500 hover:text-rose-100" type="button" onClick={(event) => { event.stopPropagation(); deleteDraftEvidence(record.id); }}>
                      Delete draft
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AdminUsersView() {
  const { users, accessRequests, supportRequests, loadAccessRequests, loadSupportRequests, loadUserDirectory, approveAccessRequest, rejectAccessRequest, resolveSupportRequest, setUserStatus, resetPassword } = useForenxStore();
  const [filter, setFilter] = useState<Role | "All">("All");

  const visibleUsers = filter === "All" ? users : users.filter((user) => user.role === filter);
  const openSupportRequests = supportRequests.filter((request) => request.status === "Open");

  useEffect(() => {
    void loadAccessRequests();
    void loadSupportRequests();
    void loadUserDirectory();
  }, [loadAccessRequests, loadSupportRequests, loadUserDirectory]);

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Admin" title="Account management" text="Approve and manage accounts." />
      <Panel eyebrow="Pending review" title={`${accessRequests.length} access request${accessRequests.length === 1 ? "" : "s"}`}>
        {accessRequests.length === 0 ? (
          <p className="text-sm text-slate-500">No accounts are waiting for review.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Requested role</th>
                  <th>Badge</th>
                  <th>Agency</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {accessRequests.map((request) => (
                  <tr key={request.id}>
                    <td><CellText value={request.fullName} /></td>
                    <td><CellText value={request.email} /></td>
                    <td><Tag label={request.requestedRole} tone="cyan" /></td>
                    <td><CellText value={request.badgeId} mono /></td>
                    <td><CellText value={request.agency} /></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-primary min-h-8" type="button" onClick={() => void approveAccessRequest(request.id)}>Approve</button>
                        <button className="btn-secondary min-h-8" type="button" onClick={() => void rejectAccessRequest(request.id)}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel eyebrow="Support queue" title={`${openSupportRequests.length} open report${openSupportRequests.length === 1 ? "" : "s"}`}>
        {supportRequests.length === 0 ? (
          <p className="text-sm text-slate-500">No access reports have been submitted.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[26%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Report</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {supportRequests.map((request) => (
                  <tr key={request.id}>
                    <td><CellText value={request.fullName} /></td>
                    <td><CellText value={request.email} /></td>
                    <td><CellText value={request.requestType} /></td>
                    <td><CellText value={request.message} /></td>
                    <td><Tag label={request.status} tone={request.status === "Open" ? "cyan" : "green"} /></td>
                    <td>
                      {request.status === "Open" ? (
                        <button className="btn-secondary min-h-8" type="button" onClick={() => void resolveSupportRequest(request.id)}>Resolve</button>
                      ) : (
                        <span className="text-xs text-slate-500">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel eyebrow="Directory" title="User records">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["All", ...allRoles] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={filter === item ? "btn-primary min-h-9" : "btn-secondary min-h-9"}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1180px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[15%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Badge</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last activity</th>
                <th>Inactive for</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td><CellText value={user.name} /></td>
                  <td><CellText value={user.role} /></td>
                  <td><CellText value={user.badgeId} mono /></td>
                  <td><CellText value={user.email} /></td>
                  <td><Tag label={user.status} tone={user.status === "Active" ? "green" : "slate"} /></td>
                  <td><CellText value={relativeTime(user.lastActiveAt)} /></td>
                  <td><CellText value={user.status === "Inactive" ? elapsedTime(user.inactiveSince) : "Active"} /></td>
                  <td>
                    <div className="flex min-w-0 gap-2">
                      <button
                        className="btn-secondary min-h-8 min-w-0 flex-1 whitespace-nowrap px-2 text-xs"
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Send a password reset email to ${user.email}?`)) void resetPassword(user.id);
                        }}
                      >
                        Reset
                      </button>
                      <button
                        className={user.status === "Active" ? "btn-secondary min-h-8 min-w-0 flex-1 whitespace-nowrap border-red-900 px-2 text-xs text-red-200 hover:border-red-500 hover:text-red-100" : "btn-primary min-h-8 min-w-0 flex-1 whitespace-nowrap px-2 text-xs"}
                        type="button"
                        onClick={() => {
                          const nextStatus = user.status === "Active" ? "Inactive" : "Active";
                          if (window.confirm(`${nextStatus === "Inactive" ? "Deactivate" : "Activate"} ${user.name}'s FORENX account?`)) {
                            void setUserStatus(user.id, nextStatus);
                          }
                        }}
                      >
                        {user.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function BarcodeView() {
  const { barcodeBatches, generateBarcodeBatch } = useForenxStore();
  const [quantity, setQuantity] = useState("12");
  const latest = barcodeBatches[0];

  async function handleGenerate() {
    if (await generateBarcodeBatch(Number(quantity))) setQuantity("");
  }

  return (
    <div className="barcode-page space-y-3">
      <PageHeader eyebrow="Admin" title="Barcode generation" text="Create printable field labels." />
      <Grid columns="xl:grid-cols-[360px_1fr]">
        <div className="barcode-generator-panel">
          <Panel eyebrow="Batch" title="Generate labels">
            <TextField label="Quantity" value={quantity} onChange={setQuantity} type="number" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary min-h-10 flex-1 whitespace-nowrap" type="button" onClick={handleGenerate}>
                Generate batch
              </button>
              <button className="btn-secondary min-h-10 flex-1 gap-2 whitespace-nowrap" type="button" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print labels
              </button>
            </div>
          </Panel>
        </div>
        <section className="barcode-print-sheet">
          <div className="barcode-sheet-header">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">FORENX</p>
              <h3 className="mt-1 text-base font-semibold text-white">Field barcode labels</h3>
            </div>
            <p className="text-xs text-slate-500">{latest ? `${latest.barcodes.length} issued labels` : "No batch selected"}</p>
          </div>
          <div className="barcode-label-grid">
            {latest?.barcodes.map((barcode) => (
              <BarcodeLabel key={barcode} barcode={barcode} />
            ))}
          </div>
        </section>
      </Grid>
    </div>
  );
}

function AdminEvidenceLookupView() {
  const { evidence, custodyEvents, barcodeBatches, selectEvidence } = useForenxStore();
  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState<Evidence | null>(null);
  const [feedback, setFeedback] = useState("");
  const custodyTrail = result ? custodyEvents.filter((event) => event.evidenceId === result.id) : [];

  function lookupBarcode(value = barcode) {
    const cleanBarcode = value.trim().toUpperCase();
    if (!/^FX-\d{6}$/.test(cleanBarcode)) {
      setResult(null);
      setFeedback("Enter a label in the FX-000000 format.");
      return;
    }

    const record = evidence.find((item) => item.barcode === cleanBarcode);
    setBarcode(cleanBarcode);

    if (record) {
      selectEvidence(record.id);
      setResult(record);
      setFeedback("");
      return;
    }

    const knownLabel = barcodeBatches.some((batch) => batch.barcodes.includes(cleanBarcode));
    setResult(null);
    setFeedback(knownLabel ? "This approved label is not assigned to evidence yet." : "No FORENX record matches this barcode.");
  }

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Admin" title="Evidence lookup" text="Scan a label to review its record." />
      <Grid columns="xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel eyebrow="Lookup" title="Scan or enter barcode">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="scan-window">
              <ScanLine className="h-8 w-8 text-cyan-300" />
              <p className="mt-2 text-sm font-semibold text-white">Evidence label scanner</p>
              <p className="mt-1 text-xs text-slate-500">Scan a Code 128 or QR label.</p>
              <CameraScanner onDetected={lookupBarcode} />
            </div>
            <div className="space-y-3">
              <TextField label="Barcode" value={barcode} onChange={setBarcode} />
              <p className="-mt-1 text-xs leading-5 text-slate-500">Example: FX-000103</p>
              <button className="btn-primary w-full" type="button" onClick={() => lookupBarcode()}>
                Find evidence
              </button>
              {feedback && <p className="border border-slate-700 bg-[#091115] px-3 py-2 text-xs leading-5 text-slate-300" role="status">{feedback}</p>}
            </div>
          </div>
        </Panel>
        <Panel eyebrow="Result" title={result ? result.id : "No record selected"}>
          {result ? (
            <DetailRows rows={[["Barcode", result.barcode], ["Status", result.status], ["Case", result.caseNumber || "Not recorded"], ["Custody events", custodyTrail.length.toString()]]} />
          ) : (
            <p className="text-sm text-slate-500">Scan an assigned barcode to open its evidence record.</p>
          )}
        </Panel>
      </Grid>

      {result && (
        <>
          <Grid columns="xl:grid-cols-2">
            <Panel eyebrow="Evidence record" title="Case and item">
              <DetailRows
                rows={[
                  ["Evidence ID", result.id],
                  ["Offense type", result.offenseType || "Not recorded"],
                  ["Item category", result.itemCategory || "Not recorded"],
                  ["Item description", result.itemDescription || "Not recorded"],
                  ["Destination", result.destinationLab || "Not recorded"]
                ]}
              />
            </Panel>
            <Panel eyebrow="Recovery" title="Collection details">
              <DetailRows
                rows={[
                  ["Recovered by", result.recoveredBy || "Not recorded"],
                  ["Recovery time", result.recoveryDateTime || "Not recorded"],
                  ["GPS", result.gpsCoordinates || "Not recorded"],
                  ["Specific location", result.locationDetails || "Not recorded"],
                  ["Capture status", result.spatialCaptureStatus]
                ]}
              />
            </Panel>
          </Grid>
          <Grid columns="xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel eyebrow="Custody audit" title="Movement history">
              {custodyTrail.length === 0 ? (
                <p className="text-sm text-slate-500">No custody events are recorded for this evidence.</p>
              ) : (
                <div className="detail-list">
                  {custodyTrail.map((event) => (
                    <div key={event.id} className="detail-row">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{event.action}</p>
                          <p className="mt-1 text-xs text-slate-500">{event.fromUser} to {event.toUser}</p>
                        </div>
                        <Tag label={event.status} tone={event.status === "In Lab Custody" ? "green" : "cyan"} />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{event.timestamp} · {event.location}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel eyebrow="Verification" title="Collection signature">
              <div className="signature-review"><SignatureCell value={result.investigatorSignature} /></div>
              <div className="mt-3">
                <DetailRows rows={[["2D photos", result.photoCaptures.length.toString()], ["3D request", result.threeDCaptureRequested ? "Requested" : "Not requested"], ["Lab signature", result.labSignature ? "Saved" : "Pending"]]} />
              </div>
            </Panel>
          </Grid>
        </>
      )}
    </div>
  );
}

function ScanView() {
  const router = useRouter();
  const { activeEvidence, assignBarcode } = useForenxStore();
  const [barcode, setBarcode] = useState(activeEvidence.barcode);
  const [feedback, setFeedback] = useState("");

  async function assignCurrentBarcode(value = barcode) {
    const cleanBarcode = value.trim().toUpperCase();

    if (!/^FX-\d{6}$/.test(cleanBarcode)) {
      setFeedback("Enter the full label code exactly as printed, for example FX-000103.");
      return false;
    }

    if (!(await assignBarcode(cleanBarcode))) {
      setFeedback("This label was not assigned. Use an unused barcode from an approved Admin batch.");
      return false;
    }

    setBarcode("");
    setFeedback("");
    return true;
  }

  async function handleAssign() {
    await assignCurrentBarcode();
  }

  function handleContinue() {
    if (!activeEvidence.barcode) {
      setFeedback("Assign an approved barcode before continuing to capture.");
      return;
    }
    router.push("/capture");
  }

  async function handleCameraScan(value: string) {
    setBarcode(value);
    await assignCurrentBarcode(value);
  }

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Step A" title="Barcode assignment" text="Scan or enter a label." />
      <Grid columns="xl:grid-cols-[1fr_360px]">
        <Panel eyebrow="Scanner" title="New evidence intake">
          <div className="grid gap-3 md:grid-cols-[1fr_260px]">
            <div className="scan-window">
              <ScanLine className="h-8 w-8 text-cyan-300" />
              <p className="mt-2 text-sm font-semibold text-white">Camera barcode scanner</p>
              <p className="mt-1 text-xs text-slate-500">Scan a Code 128 or QR label.</p>
              <CameraScanner onDetected={handleCameraScan} />
            </div>
            <div className="space-y-3">
              <TextField label="Manual barcode" value={barcode} onChange={setBarcode} />
              <p className="-mt-1 text-xs leading-5 text-slate-500">Use an unused label from an Admin barcode batch. Format: FX-000103.</p>
              <button className="btn-primary w-full" type="button" onClick={handleAssign}>Assign barcode</button>
              {feedback && <p className="border border-slate-800 bg-[#050d17] px-2.5 py-2 text-xs leading-5 text-slate-300" role="status">{feedback}</p>}
              <button className="btn-secondary w-full" type="button" onClick={handleContinue}>Continue to capture</button>
            </div>
          </div>
        </Panel>
        <EvidenceSummary record={activeEvidence} />
      </Grid>
    </div>
  );
}

function CameraScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const activeRef = useRef(false);
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");

  function stopCamera(nextState: "idle" | "error" = "idle") {
    activeRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    setState(nextState);
  }

  useEffect(() => stopCamera, []);

  async function startCamera() {
    try {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is unavailable.");

      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      activeRef.current = true;
      setState("scanning");

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        video,
        (result) => {
          if (!activeRef.current || !result) return;
          const value = result.getText().trim();
          if (!value) return;
          onDetected(value.toUpperCase());
          stopCamera();
        }
      );
      controlsRef.current = controls;
    } catch {
      controlsRef.current?.stop();
      controlsRef.current = null;
      activeRef.current = false;
      setState("error");
    }
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <video ref={videoRef} className={state === "scanning" ? "block h-32 w-full max-w-64 border border-cyan-900 object-cover" : "hidden"} muted playsInline />
      {state === "scanning" ? (
        <button className="btn-secondary min-h-8" type="button" onClick={() => stopCamera()}>Stop camera</button>
      ) : (
        <button className="btn-secondary min-h-8" type="button" onClick={startCamera}>Open camera</button>
      )}
      {state === "error" && <p className="text-xs text-rose-300">Camera scan failed. Allow camera access, then try again.</p>}
    </div>
  );
}

function CaptureView() {
  const router = useRouter();
  const { activeEvidence, completeSpatialCapture } = useForenxStore();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState(activeEvidence.photoCaptures ?? []);
  const [threeDCaptureRequested, setThreeDCaptureRequested] = useState(activeEvidence.threeDCaptureRequested ?? false);
  const [feedback, setFeedback] = useState("");

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    const remainingSlots = 6 - photos.length;
    if (remainingSlots <= 0) {
      setFeedback("A record supports up to six 2D evidence photos.");
      return;
    }

    const acceptedFiles = selectedFiles.slice(0, remainingSlots).filter((file) => file.size <= 4 * 1024 * 1024);
    if (acceptedFiles.length === 0) {
      setFeedback("Choose image files smaller than 4 MB.");
      return;
    }

    try {
      const imageData = await Promise.all(acceptedFiles.map(readImageFile));
      setPhotos((current) => [...current, ...imageData]);
      setFeedback(
        acceptedFiles.length < selectedFiles.length
          ? "Some files were skipped. Each record stores up to six images, with a 4 MB limit per image."
          : `${acceptedFiles.length} 2D photo${acceptedFiles.length === 1 ? "" : "s"} added.`
      );
    } catch {
      setFeedback("One or more image files could not be read. Try the upload again.");
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    setFeedback("Photo removed.");
  }

  async function handleContinue() {
    if (await completeSpatialCapture(photos, threeDCaptureRequested)) router.push("/evidence");
  }

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Step B" title="2D evidence capture" text="Add item photos." />
      <Grid columns="xl:grid-cols-[1fr_360px]">
        <Panel eyebrow="Required" title="2D evidence photos">
          <input ref={uploadInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={addPhotos} />
          <input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={addPhotos} />
          <div className="flex flex-col gap-2 border border-slate-800 bg-[#050d17] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{photos.length} of 6 photos added</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Add 1 to 6 photos. Up to 4 MB each.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button className="btn-secondary min-h-9" type="button" onClick={() => uploadInputRef.current?.click()}>Upload photos</button>
              <button className="btn-primary min-h-9" type="button" onClick={() => cameraInputRef.current?.click()}>Take photo</button>
            </div>
          </div>
          {photos.length === 0 ? (
            <div className="mt-3 grid min-h-48 place-items-center border border-dashed border-slate-700 bg-[#06101c] px-4 text-center">
              <p className="text-sm text-slate-500">No 2D photos yet. Upload photos or use the device camera to continue.</p>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((photo, index) => (
                <figure key={`${photo.slice(0, 32)}-${index}`} className="border border-slate-800 bg-[#050d17] p-1.5">
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-950">
                    <Image src={photo} alt={`Evidence photo ${index + 1}`} fill sizes="(max-width: 640px) 45vw, 220px" unoptimized className="object-cover" />
                  </div>
                  <figcaption className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-400">Photo {index + 1}</span>
                    <button className="text-xs font-semibold text-rose-300 hover:text-rose-200" type="button" onClick={() => removePhoto(index)}>Remove</button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {feedback && <p className="mt-3 border border-slate-800 bg-[#050d17] px-3 py-2 text-xs leading-5 text-slate-300" role="status">{feedback}</p>}
          <label className="mt-3 flex items-start gap-2 border border-slate-800 bg-[#050d17] px-3 py-2.5 text-sm text-slate-300">
            <input className="mt-0.5 h-4 w-4 accent-cyan-500" type="checkbox" checked={threeDCaptureRequested} onChange={(event) => setThreeDCaptureRequested(event.target.checked)} />
            <span>
              <span className="block font-semibold text-slate-200">Request 3D capture later</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">Optional. 2D photos stay required.</span>
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" type="button" onClick={handleContinue}>Save photos and continue</button>
          </div>
        </Panel>
        <Panel eyebrow="Status" title={activeEvidence.spatialCaptureStatus}>
          <DetailRows
            rows={[
              ["Evidence ID", activeEvidence.id],
              ["2D photos", `${photos.length} of 6 added`],
              ["3D request", threeDCaptureRequested ? "Requested" : "Not requested"],
              ["Record state", activeEvidence.spatialCapturePreview]
            ]}
          />
        </Panel>
      </Grid>
    </div>
  );
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Image file could not be read."));
    reader.readAsDataURL(file);
  });
}

function EvidenceView() {
  const router = useRouter();
  const { role, activeEvidence, updateActiveEvidence, saveEvidenceForm } = useForenxStore();
  const [signature, setSignature] = useState("");

  async function handleSave() {
    if (await saveEvidenceForm(signature)) router.push("/transfer");
  }

  if (role === "Laboratory Analyst") return <LaboratoryEvidenceReview />;

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Step C" title="Chain of custody form" text="Add details and sign." />
      <Grid columns="xl:grid-cols-[1fr_390px]">
        <Panel eyebrow="Evidence form" title={activeEvidence.id}>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Case number" value={activeEvidence.caseNumber} onChange={(value) => updateActiveEvidence("caseNumber", value)} />
            <SelectField label="Offense / incident type" value={activeEvidence.offenseType} onChange={(value) => updateActiveEvidence("offenseType", value)} options={offenseTypes} />
            <TextField label="Evidence ID" value={activeEvidence.id} onChange={(value) => updateActiveEvidence("id", value)} readOnly />
            <SelectField label="Item category" value={activeEvidence.itemCategory} onChange={(value) => updateActiveEvidence("itemCategory", value)} options={categories} />
            <TextField label="Recovery date and time" value={activeEvidence.recoveryDateTime} onChange={(value) => updateActiveEvidence("recoveryDateTime", value)} />
            <TextField label="GPS coordinates" value={activeEvidence.gpsCoordinates} onChange={(value) => updateActiveEvidence("gpsCoordinates", value)} />
            <label className="md:col-span-2">
              <span className="label">Specific location</span>
              <textarea className="input mt-1 min-h-20 resize-none" value={activeEvidence.locationDetails} onChange={(event) => updateActiveEvidence("locationDetails", event.target.value)} />
            </label>
            <label className="md:col-span-2">
              <span className="label">Item description</span>
              <textarea className="input mt-1 min-h-24 resize-none" value={activeEvidence.itemDescription} onChange={(event) => updateActiveEvidence("itemDescription", event.target.value)} />
            </label>
            <TextField label="Recovered by" value={activeEvidence.recoveredBy} onChange={(value) => updateActiveEvidence("recoveredBy", value)} readOnly />
          </div>
        </Panel>
        <Panel eyebrow="Verification" title="Investigator signature">
          <SignaturePad label="Collection signature" onSave={setSignature} />
          <button className="btn-primary mt-3 w-full" type="button" onClick={handleSave}>
            Save and continue to transfer
          </button>
        </Panel>
      </Grid>
    </div>
  );
}

function LaboratoryEvidenceReview() {
  const { evidence, activeEvidence, selectEvidence } = useForenxStore();
  const reviewableRecords = evidence.filter((record) => ["In Transit", "In Lab Custody", "Closed"].includes(record.status));
  const selectedRecord = reviewableRecords.find((record) => record.id === activeEvidence.id);

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Laboratory" title="Evidence review" text="Review collection details before custody acceptance." />
      <Panel eyebrow="Records" title="Available evidence">
        {reviewableRecords.length === 0 ? (
          <p className="text-sm text-slate-500">No evidence is available for review.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {reviewableRecords.map((record) => {
              const selected = selectedRecord?.id === record.id;
              return (
                <button
                  key={record.id}
                  className={`workflow-record-card text-left ${selected ? "workflow-record-card-selected" : ""}`}
                  type="button"
                  onClick={() => selectEvidence(record.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">{record.id}</span>
                    <Tag label={record.status} tone={record.status === "In Transit" ? "cyan" : "green"} />
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-slate-500">{record.barcode}</p>
                  <p className="mt-1 text-xs text-slate-400">{record.caseNumber || "No case number"}</p>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {!selectedRecord ? (
        <Panel eyebrow="Review" title="Select evidence">
          <p className="text-sm text-slate-500">Select an evidence record above to inspect its collection record.</p>
        </Panel>
      ) : (
        <>
          <Grid columns="xl:grid-cols-2">
            <Panel eyebrow="Case and item" title={selectedRecord.id}>
              <DetailRows
                rows={[
                  ["Status", selectedRecord.status],
                  ["Case number", selectedRecord.caseNumber || "Not recorded"],
                  ["Offense type", selectedRecord.offenseType || "Not recorded"],
                  ["Item category", selectedRecord.itemCategory || "Not recorded"],
                  ["Description", selectedRecord.itemDescription || "Not recorded"]
                ]}
              />
            </Panel>
            <Panel eyebrow="Recovery" title="Collection details">
              <DetailRows
                rows={[
                  ["Barcode", selectedRecord.barcode],
                  ["Recovered by", selectedRecord.recoveredBy],
                  ["Recovery time", selectedRecord.recoveryDateTime || "Not recorded"],
                  ["GPS", selectedRecord.gpsCoordinates || "Not recorded"],
                  ["Specific location", selectedRecord.locationDetails || "Not recorded"]
                ]}
              />
            </Panel>
          </Grid>
          <Grid columns="xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel eyebrow="Evidence capture" title="2D photos">
              {selectedRecord.photoCaptures.length === 0 ? (
                <p className="text-sm text-slate-500">No photo preview is stored in this browser session.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedRecord.photoCaptures.map((photo, index) => (
                    <div key={`${photo.slice(0, 32)}-${index}`} className="relative aspect-[4/3] overflow-hidden border border-slate-700 bg-slate-950">
                      <Image src={photo} alt={`Evidence photo ${index + 1}`} fill sizes="(max-width: 640px) 45vw, 240px" unoptimized className="object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel eyebrow="Verification" title="Collection signature">
              <div className="signature-review"><SignatureCell value={selectedRecord.investigatorSignature} /></div>
              <div className="mt-3">
                <DetailRows rows={[["3D request", selectedRecord.threeDCaptureRequested ? "Requested" : "Not requested"], ["Lab signature", selectedRecord.labSignature ? "Saved" : "Pending"]]} />
              </div>
            </Panel>
          </Grid>
        </>
      )}
    </div>
  );
}

function TransferView() {
  const router = useRouter();
  const { activeEvidence, transferEvidence } = useForenxStore();
  const [destination, setDestination] = useState(activeEvidence.destinationLab);
  const [signature, setSignature] = useState("");

  async function handleTransfer() {
    if (await transferEvidence(destination, signature)) router.push("/dashboard");
  }

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Step D" title="Transfer custody" text="Choose a lab and sign." />
      <Grid columns="xl:grid-cols-[1fr_390px]">
        <Panel eyebrow="Transfer record" title={activeEvidence.id}>
          <DetailRows
            rows={[
              ["Barcode", activeEvidence.barcode],
              ["Case number", activeEvidence.caseNumber],
              ["Current status", activeEvidence.status],
              ["Recovered by", activeEvidence.recoveredBy]
            ]}
          />
          <div className="mt-3">
            <SelectField label="Destination" value={destination} onChange={setDestination} options={labs} />
          </div>
        </Panel>
        <Panel eyebrow="Signature" title="Transfer sign-off">
          <SignaturePad label="Investigator transfer signature" onSave={setSignature} />
          <button className="btn-primary mt-3 w-full" type="button" onClick={handleTransfer}>
            Mark In Transit
          </button>
        </Panel>
      </Grid>
    </div>
  );
}

function LabView() {
  const { evidence, evidenceLoading, activeEvidence, receiveEvidence, closeEvidence, selectEvidence } = useForenxStore();
  const incoming = evidence.filter((item) => item.status === "In Transit");
  const [barcode, setBarcode] = useState("");
  const [signature, setSignature] = useState("");
  const [signatureKey, setSignatureKey] = useState(0);

  function selectIncoming(record: Evidence) {
    selectEvidence(record.id);
    setBarcode(record.barcode);
    setSignature("");
    setSignatureKey((key) => key + 1);
  }

  async function handleAcceptCustody() {
    if (!(await receiveEvidence(barcode, signature))) return;
    setBarcode("");
    setSignature("");
    setSignatureKey((key) => key + 1);
  }

  async function handleCloseEvidence() {
    await closeEvidence();
  }

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Laboratory" title="Receive evidence" text="Match the label and accept custody." />
      <Grid columns="xl:grid-cols-[1fr_390px]">
        <Panel eyebrow="Incoming" title="In Transit evidence">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[860px]">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[17%]" />
                <col className="w-[28%]" />
                <col className="w-[25%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Evidence ID</th>
                  <th>Barcode</th>
                  <th>Destination</th>
                  <th>Preview</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incoming.map((item) => (
                  <tr key={item.id}>
                    <td><CellText value={item.id} mono /></td>
                    <td><CellText value={item.barcode} mono /></td>
                    <td><CellText value={item.destinationLab} /></td>
                    <td><CellText value={item.spatialCapturePreview} /></td>
                    <td>
                      <button className="btn-secondary min-h-8" type="button" onClick={() => selectIncoming(item)}>
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel eyebrow="Verification" title="Accept custody">
          <DetailRows rows={[["Selected evidence", activeEvidence.id], ["Record status", activeEvidence.status]]} />
          <TextField label="Scan arriving barcode" value={barcode} onChange={setBarcode} />
          <SignaturePad key={signatureKey} label="Lab analyst signature" onSave={setSignature} />
          <button className="btn-primary mt-3 w-full" type="button" onClick={handleAcceptCustody}>
            Accept lab custody
          </button>
        </Panel>
      </Grid>
      {evidenceLoading && (
        <p className="border border-slate-800 bg-[#050d17] px-3 py-2 text-xs text-slate-400" role="status">
          Loading secured evidence files.
        </p>
      )}
      {activeEvidence.status === "In Lab Custody" && (
        <Panel eyebrow="Laboratory record" title="Complete custody">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <DetailRows rows={[["Evidence ID", activeEvidence.id], ["Status", activeEvidence.status]]} />
            <button className="btn-secondary shrink-0" type="button" onClick={handleCloseEvidence}>
              Close evidence
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function HistoryView() {
  const { custodyEvents, loadCustodyHistory } = useForenxStore();

  useEffect(() => {
    void loadCustodyHistory();
  }, [loadCustodyHistory]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow="History" title="Chain of custody" text="Collection, transfer, and lab events." />
        <button className="btn-secondary shrink-0 gap-2" type="button" onClick={() => exportCustodyPdf(custodyEvents)}>
          <FileText className="h-4 w-4" /> Export PDF
        </button>
      </div>
      <Panel eyebrow="Audit trail" title="Custody events">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1100px]">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Action</th>
                <th>From</th>
                <th>To</th>
                <th>Role</th>
                <th>Time</th>
                <th>Status</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {custodyEvents.map((event) => (
                <tr key={event.id}>
                  <td><CellText value={event.evidenceId} mono /></td>
                  <td><CellText value={event.action} /></td>
                  <td><CellText value={event.fromUser} /></td>
                  <td><CellText value={event.toUser} /></td>
                  <td><CellText value={event.role} /></td>
                  <td><CellText value={event.timestamp} /></td>
                  <td><Tag label={event.status} tone="cyan" /></td>
                  <td><SignatureCell value={event.signatureImage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function exportCustodyPdf(events: ReturnType<typeof useForenxStore>["custodyEvents"]) {
  const pdf = createCustodyPdf(events);
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `forenx-custody-${new Date().toISOString().slice(0, 10)}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function truncatePdfText(value: string, length: number) {
  const plainText = value.replace(/[\\()]/g, "").replace(/[^\x20-\x7E]/g, " ");
  return plainText.length > length ? `${plainText.slice(0, length - 3)}...` : plainText;
}

function pdfText(value: string) {
  return truncatePdfText(value, 120).replace(/\\/g, "\\\\").replace(/[()]/g, "\\$&");
}

function createCustodyPdf(events: ReturnType<typeof useForenxStore>["custodyEvents"]) {
  const eventPages = Array.from(
    { length: Math.max(1, Math.ceil(events.length / 9)) },
    (_, index) => events.slice(index * 9, (index + 1) * 9)
  );
  const objects: string[] = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  const pageObjectIds = eventPages.map((_, index) => 5 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${eventPages.length} >>`;

  eventPages.forEach((pageEvents, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const text = (x: number, y: number, size: number, color: string, value: string, font = "F1") =>
      `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value)}) Tj ET`;
    const rowCommands = pageEvents.flatMap((event, eventIndex) => {
      const top = 671 - eventIndex * 57;
      const fill = eventIndex % 2 === 0 ? "0.045 0.075 0.09" : "0.035 0.06 0.072";
      const status = truncatePdfText(event.status.toUpperCase(), 14);
      return [
        `${fill} rg 38 ${top - 49} 519 49 re f`,
        "0.13 0.29 0.33 RG 0.55 w 38 " + `${top - 49} 519 49 re S`,
        "0.06 0.8 0.88 rg 38 " + `${top - 49} 2 49 re f`,
        "0.12 0.25 0.29 RG 0.4 w 123 " + `${top - 49} m 123 ${top} l S`,
        "0.12 0.25 0.29 RG 0.4 w 248 " + `${top - 49} m 248 ${top} l S`,
        "0.12 0.25 0.29 RG 0.4 w 393 " + `${top - 49} m 393 ${top} l S`,
        "0.12 0.25 0.29 RG 0.4 w 487 " + `${top - 49} m 487 ${top} l S`,
        text(46, top - 18, 9.2, "0.91 0.97 0.98", truncatePdfText(event.evidenceId, 14), "F2"),
        text(131, top - 18, 8.8, "0.91 0.97 0.98", truncatePdfText(event.action, 21), "F2"),
        text(131, top - 34, 7.4, "0.5 0.67 0.71", `AT  ${truncatePdfText(event.location, 20)}`),
        text(256, top - 17, 7.2, "0.5 0.67 0.71", `FROM  ${truncatePdfText(event.fromUser, 16)}`),
        text(256, top - 33, 7.2, "0.5 0.67 0.71", `TO  ${truncatePdfText(event.toUser, 18)}`),
        text(401, top - 18, 7.4, "0.69 0.81 0.83", truncatePdfText(event.timestamp, 18)),
        text(495, top - 24, 6.8, "0.06 0.8 0.88", status, "F2")
      ];
    }).join("\n");
    const stream = [
      "0.025 0.04 0.05 rg 0 0 595 842 re f",
      "0.06 0.8 0.88 rg 38 756 4 54 re f",
      "0.06 0.8 0.88 RG 0.8 w 38 810 m 154 810 l S",
      "0.06 0.8 0.88 RG 0.8 w 444 810 m 557 810 l S",
      text(52, 787, 24, "0.94 0.98 0.99", "FORENX", "F2"),
      text(52, 768, 8.5, "0.06 0.8 0.88", "DIGITAL CHAIN OF CUSTODY"),
      text(444, 786, 8, "0.5 0.67 0.71", "CUSTODY LEDGER", "F2"),
      text(444, 770, 7.2, "0.5 0.67 0.71", `PAGE ${index + 1} / ${eventPages.length}`),
      "0.1 0.22 0.26 RG 0.6 w 38 738 m 557 738 l S",
      text(38, 718, 10, "0.06 0.8 0.88", "CHAIN OF CUSTODY EVENTS", "F2"),
      text(430, 718, 7.2, "0.5 0.67 0.71", `${events.length} TOTAL EVENTS`),
      "0.07 0.16 0.19 rg 38 686 519 22 re f",
      "0.06 0.8 0.88 RG 0.55 w 38 686 519 22 re S",
      text(46, 694, 7, "0.55 0.7 0.74", "EVIDENCE", "F2"),
      text(131, 694, 7, "0.55 0.7 0.74", "EVENT / LOCATION", "F2"),
      text(256, 694, 7, "0.55 0.7 0.74", "CUSTODY", "F2"),
      text(401, 694, 7, "0.55 0.7 0.74", "RECORDED", "F2"),
      text(495, 694, 7, "0.55 0.7 0.74", "STATUS", "F2"),
      rowCommands,
      "0.1 0.22 0.26 RG 0.6 w 38 42 m 557 42 l S",
      text(38, 27, 7.5, "0.42 0.56 0.6", `Generated ${new Date().toLocaleString()}`),
      text(442, 27, 7.5, "0.42 0.56 0.6", "FORENX EVIDENCE TRACKING")
    ].join("\n");
    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  const encoder = new TextEncoder();
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = encoder.encode(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function SettingsView() {
  const router = useRouter();
  const { authMode, backendMode, currentUser, role, resetDemo, signOut } = useForenxStore();
  const workspace = settingsWorkspace(role);

  function handleReset() {
    if (!window.confirm("Reset local demo records and sign out?")) return;
    resetDemo();
    router.push("/login");
  }

  function handleSignOut() {
    signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Settings" title={`${role} settings`} text={workspace.description} />
      <Grid columns="xl:grid-cols-2">
        <Panel eyebrow="Account" title={currentUser.name}>
          <DetailRows
            rows={[
              ["Role", role],
              ["Badge ID", currentUser.badgeId],
              ["Agency", currentUser.agency],
              ["Email", currentUser.email]
            ]}
          />
        </Panel>
        <Panel eyebrow="Role workspace" title={workspace.title}>
          <div className="divide-y divide-slate-800 border border-slate-800">
            {workspace.items.map((item) => (
              <SettingsCapability key={item.label} {...item} />
            ))}
          </div>
        </Panel>
      </Grid>
      <Grid columns="xl:grid-cols-2">
        <DeviceReadiness backendMode={backendMode} />
        <Panel eyebrow="Session" title="Access controls">
          <DetailRows
            rows={[
              ["Account status", currentUser.status],
              ["Session", "Active"],
              ["Account type", authMode === "Demo" ? "Local development" : "Secure account"]
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {authMode === "Demo" && (
              <button className="btn-secondary" type="button" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset demo
              </button>
            )}
            <button className="btn-secondary" type="button" onClick={handleSignOut}>
              <Lock className="mr-2 h-4 w-4" /> Sign out
            </button>
          </div>
        </Panel>
      </Grid>
    </div>
  );
}

function settingsWorkspace(role: Role) {
  if (role === "System Admin") {
    return {
      title: "Administrative controls",
      description: "Accounts, labels, and records.",
      items: [
        { icon: Users, label: "Account approvals", value: "Requests and access", href: "/admin/users" },
        { icon: QrCode, label: "Barcode batches", value: "Print field labels", href: "/admin/barcodes" },
        { icon: Archive, label: "Custody review", value: "Movement records", href: "/history" }
      ]
    };
  }

  if (role === "Laboratory Analyst") {
    return {
      title: "Laboratory workflow",
      description: "Incoming transfers and custody.",
      items: [
        { icon: FlaskConical, label: "Incoming evidence", value: "Transfers waiting", href: "/lab" },
        { icon: Barcode, label: "Barcode verification", value: "Match labels to records", href: "/lab" },
        { icon: Archive, label: "Custody history", value: "Signed records", href: "/history" }
      ]
    };
  }

  return {
    title: "Field workflow",
    description: "Capture, records, and transfers.",
    items: [
      { icon: ScanLine, label: "Evidence scanning", value: "Barcode assignment", href: "/scan" },
      { icon: Box, label: "Scene capture", value: "Photo status", href: "/capture" },
      { icon: Signature, label: "Custody transfer", value: "Transfer status", href: "/transfer" }
    ]
  };
}

function SettingsCapability({
  icon: Icon,
  label,
  value,
  href
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-3 bg-[#050d17] px-3 py-3 hover:bg-[#081827]">
      <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm text-slate-200">{value}</p>
      </div>
    </Link>
  );
}

function DeviceReadiness({ backendMode }: { backendMode: string }) {
  const [online, setOnline] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    const updateDeviceState = () => {
      setOnline(navigator.onLine);
      setCameraReady(Boolean(navigator.mediaDevices?.getUserMedia));
    };

    updateDeviceState();
    window.addEventListener("online", updateDeviceState);
    window.addEventListener("offline", updateDeviceState);

    return () => {
      window.removeEventListener("online", updateDeviceState);
      window.removeEventListener("offline", updateDeviceState);
    };
  }, []);

  return (
    <Panel eyebrow="Device" title="Browser readiness">
      <div className="divide-y divide-slate-800 border border-slate-800">
        <SettingsReadinessRow label="Network" value={online ? "Online" : "Offline"} tone={online ? "green" : "slate"} />
        <SettingsReadinessRow label="Camera access" value={cameraReady ? "Available when requested" : "Not detected"} tone={cameraReady ? "green" : "slate"} />
        <SettingsReadinessRow label="Service state" value={backendMode} tone={backendMode === "Connected" ? "green" : "slate"} />
      </div>
    </Panel>
  );
}

function SettingsReadinessRow({ label, value, tone }: { label: string; value: string; tone: "green" | "slate" }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-[#050d17] px-3 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Tag label={value} tone={tone} />
    </div>
  );
}

function PageHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <header className="page-intro">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </header>
  );
}

function Panel({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="module-panel">
      <div className="module-header">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">{eyebrow}</p>
        <h3 className="mt-1 truncate text-base font-semibold text-white">{title}</h3>
      </div>
      <div className="module-body">{children}</div>
    </section>
  );
}

function Grid({ columns, children }: { columns: string; children: ReactNode }) {
  return <div className={`grid min-w-0 gap-3 ${columns}`}>{children}</div>;
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="metric-card">
      <Icon className="h-5 w-5 shrink-0 text-cyan-300" />
      <div className="min-w-0">
        <p className="text-xl font-semibold text-white">{value}</p>
        <p className="truncate text-xs uppercase tracking-wide text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function EvidenceTable({ records }: { records: Evidence[] }) {
  return (
    <Panel eyebrow="Records" title="Evidence list">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[860px]">
          <colgroup>
            <col className="w-[17%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
            <col className="w-[20%]" />
            <col className="w-[24%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr>
              <th>Evidence ID</th>
              <th>Case</th>
              <th>Category</th>
              <th>Recovered by</th>
              <th>Destination</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>
                  <Link className="text-cyan-300" href="/evidence">{record.id}</Link>
                  <p className="mt-1 font-mono text-xs text-slate-500">{record.barcode}</p>
                </td>
                <td><CellText value={record.caseNumber} mono /></td>
                <td><CellText value={record.itemCategory} /></td>
                <td><CellText value={record.recoveredBy} /></td>
                <td><CellText value={record.destinationLab} /></td>
                <td><Tag label={record.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EvidenceSummary({ record }: { record: Evidence }) {
  return (
    <Panel eyebrow="Active record" title={record.id}>
      <BarcodeLabel barcode={record.barcode || "UNASSIGNED"} />
      <div className="mt-3">
        <DetailRows
          rows={[
            ["Case", record.caseNumber || "Not entered"],
            ["Status", record.status],
            ["Capture", record.spatialCaptureStatus],
            ["Recovered by", record.recoveredBy],
            ["GPS", record.gpsCoordinates || "Pending"]
          ]}
        />
      </div>
    </Panel>
  );
}

function CellText({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <span className={`table-cell-text ${mono ? "font-mono" : ""}`} title={value}>
      {value}
    </span>
  );
}

function elapsedTime(value?: string | null) {
  if (!value) return "Not recorded";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not recorded";

  const hours = Math.floor(milliseconds / 3600000);
  const months = Math.floor(hours / (24 * 30));
  const days = Math.floor((hours % (24 * 30)) / 24);
  const remainingHours = hours % 24;
  const parts = [
    months ? `${months} ${months === 1 ? "month" : "months"}` : "",
    days ? `${days} ${days === 1 ? "day" : "days"}` : "",
    remainingHours || (!months && !days) ? `${remainingHours} ${remainingHours === 1 ? "hour" : "hours"}` : ""
  ].filter(Boolean);

  return parts.slice(0, 2).join(" ");
}

function relativeTime(value?: string | null) {
  if (!value) return "No sign-in activity";
  return `${elapsedTime(value)} ago`;
}

function SignatureCell({ value }: { value: string }) {
  if (!value) {
    return <span className="text-slate-500">Pending</span>;
  }

  const saved = value.startsWith("data:image/") || /^https?:\/\//.test(value);

  if (saved) {
    return (
      <Image
        alt="Saved signature"
        className="signature-image"
        height={42}
        src={value}
        unoptimized
        width={136}
      />
    );
  }

  return (
    <span className="signature-written" title={value}>
      {value}
    </span>
  );
}

function DetailRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="detail-list">
      {rows.map(([label, value]) => (
        <div key={label} className="detail-row text-sm sm:grid-cols-[140px_1fr]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="min-w-0 break-words text-slate-200">{value}</span>
        </div>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <input className="input mt-1" type={type} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select className="input mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SignaturePad({
  label,
  onSave
}: {
  label: string;
  onSave: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const inkRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const [empty, setEmpty] = useState(false);

  function paintSignatureBackground() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#091419";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  useEffect(() => {
    paintSignatureBackground();
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    inkRef.current = true;
    setEmpty(false);
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#e8fbff";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#e8fbff";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function stop() {
    drawingRef.current = false;
  }

  function save() {
    if (!inkRef.current) {
      onSave("");
      setEmpty(true);
      setSaved(false);
      return;
    }

    const value = canvasRef.current?.toDataURL("image/png") ?? "";
    onSave(value);
    setSaved(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    paintSignatureBackground();
    inkRef.current = false;
    onSave("");
    setEmpty(false);
    setSaved(false);
  }

  return (
    <div>
      <span className="label">{label}</span>
      <canvas
        ref={canvasRef}
        width={640}
        height={180}
        className="signature-pad mt-1 h-36 w-full touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerLeave={stop}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn-secondary min-h-8" type="button" onClick={save}>
          Save signature
        </button>
        <button className="btn-secondary min-h-8" type="button" onClick={clear}>
          Clear
        </button>
        {saved && <Tag label="Saved" tone="green" />}
      </div>
      {empty && <p className="mt-2 text-xs text-rose-300">Draw a signature before saving.</p>}
    </div>
  );
}

function BarcodeLabel({ barcode }: { barcode: string }) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const target = barcodeRef.current;
    if (!target || !barcode) return;

    void import("jsbarcode").then(({ default: JsBarcode }) => {
      JsBarcode(target, barcode, {
        format: "CODE128",
        width: 1.55,
        height: 52,
        displayValue: false,
        margin: 0,
        lineColor: "#111827",
        background: "#f8fafc"
      });
    });
  }, [barcode]);

  return (
    <div className="barcode-label border border-slate-700 bg-slate-100 p-3 text-slate-950">
      <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
        <p className="text-xs font-black tracking-[0.12em]">FORENX</p>
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Evidence label</p>
      </div>
      <svg ref={barcodeRef} aria-label={`Code 128 barcode for ${barcode}`} className="mx-auto my-3 h-14 w-full max-w-60" role="img" />
      <div className="flex items-end justify-between gap-2 border-t border-slate-300 pt-1.5">
        <p className="font-mono text-xs font-black tracking-wide">{barcode}</p>
        <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-500">Secure ID</p>
      </div>
    </div>
  );
}

function Tag({ label, tone = "slate" }: { label: string; tone?: "slate" | "cyan" | "green" }) {
  const toneClass = {
    slate: "status-slate",
    cyan: "status-cyan",
    green: "status-green"
  }[tone];

  return <span className={`status-flag ${toneClass}`}>{label}</span>;
}

function ActionLinks({ links }: { links: [string, string, boolean?][] }) {
  const { startNewEvidence } = useForenxStore();
  const router = useRouter();

  return (
    <div className="grid gap-2">
      {links.map(([label, href, startsWorkflow]) => startsWorkflow ? (
        <button
          key={href}
          className="btn-primary"
          type="button"
          onClick={async () => {
            if (await startNewEvidence()) router.push(href);
          }}
        >
          {label}
        </button>
      ) : (
        <Link key={href} className="btn-primary" href={href}>{label}</Link>
      ))}
    </div>
  );
}

function roleActionTitle(role: Role) {
  if (role === "System Admin") return "Manage system";
  if (role === "Laboratory Analyst") return "Receive custody";
  return "Process evidence";
}

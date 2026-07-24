"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import {
  barcodeBatches as initialBarcodeBatches,
  custodyEvents as initialCustodyEvents,
  emptyEvidence,
  evidenceRecords as initialEvidenceRecords,
  users as initialUsers
} from "@/lib/mock-data";
import { supabase, supabaseReady } from "@/lib/supabase";
import type { AccessRequest, BarcodeBatch, CustodyEvent, Evidence, Role, SupportRequest, User } from "@/lib/types";

type Store = {
  isAuthenticated: boolean;
  authReady: boolean;
  authMode: "Demo" | "Supabase";
  role: Role;
  currentUser: User;
  users: User[];
  accessRequests: AccessRequest[];
  supportRequests: SupportRequest[];
  evidence: Evidence[];
  activeEvidence: Evidence;
  barcodeBatches: BarcodeBatch[];
  custodyEvents: CustodyEvent[];
  message: string;
  backendMode: string;
  signIn: (role: Role, email: string) => boolean;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpForAccess: (request: {
    fullName: string;
    email: string;
    password: string;
    requestedRole: Extract<Role, "Investigator" | "Laboratory Analyst">;
    badgeId: string;
    agency: string;
  }) => Promise<boolean>;
  signOut: () => void;
  setRole: (role: Role) => void;
  addUser: (user: Omit<User, "id" | "status">) => void;
  setUserStatus: (id: string, status: User["status"]) => Promise<void>;
  resetPassword: (id: string) => Promise<void>;
  loadUserDirectory: () => Promise<void>;
  loadAccessRequests: () => Promise<void>;
  approveAccessRequest: (id: string) => Promise<void>;
  rejectAccessRequest: (id: string) => Promise<void>;
  submitSupportRequest: (request: {
    fullName: string;
    email: string;
    requestType: SupportRequest["requestType"];
    message: string;
  }) => Promise<boolean>;
  loadSupportRequests: () => Promise<void>;
  resolveSupportRequest: (id: string) => Promise<void>;
  loadCustodyHistory: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  generateBarcodeBatch: (quantity: number) => boolean;
  startNewEvidence: () => boolean;
  assignBarcode: (barcode: string) => boolean;
  completeSpatialCapture: (photoCaptures: string[], threeDCaptureRequested: boolean) => boolean;
  updateActiveEvidence: (field: keyof Evidence, value: string) => void;
  saveEvidenceForm: (signature: string) => boolean;
  transferEvidence: (destinationLab: string, signature: string) => boolean;
  receiveEvidence: (barcode: string, signature: string) => boolean;
  selectEvidence: (id: string) => void;
  resetDemo: () => void;
};

const StoreContext = createContext<Store | null>(null);
const storageKey = "forenx-website-demo";

function nowLabel() {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

function userForRole(users: User[], role: Role) {
  return users.find((user) => user.role === role) ?? users[0];
}

function custodyFeedRecord(event: CustodyEvent, createdBy: string) {
  return {
    id: event.id,
    evidence_id: event.evidenceId,
    action: event.action,
    from_user_name: event.fromUser,
    to_user_name: event.toUser,
    actor_role: event.role,
    event_time: event.timestamp,
    location: event.location,
    signature_data: event.signatureImage,
    status: event.status,
    created_by: createdBy
  };
}

function custodyEventFromFeed(record: {
  id: string;
  evidence_id: string;
  action: string;
  from_user_name: string;
  to_user_name: string;
  actor_role: string;
  event_time: string;
  location: string;
  signature_data: string;
  status: string;
}): CustodyEvent {
  return {
    id: record.id,
    evidenceId: record.evidence_id,
    action: record.action,
    fromUser: record.from_user_name,
    toUser: record.to_user_name,
    role: record.actor_role as Role,
    timestamp: record.event_time,
    location: record.location,
    signatureImage: record.signature_data,
    status: record.status as CustodyEvent["status"]
  };
}

export function ForenxStoreProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseReady);
  const [authMode, setAuthMode] = useState<"Demo" | "Supabase">("Demo");
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [role, setRole] = useState<Role>("Investigator");
  const [evidence, setEvidence] = useState<Evidence[]>(initialEvidenceRecords);
  const [activeEvidence, setActiveEvidence] = useState<Evidence>(initialEvidenceRecords[0]);
  const [barcodeBatches, setBarcodeBatches] = useState<BarcodeBatch[]>(initialBarcodeBatches);
  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>(initialCustodyEvents);
  const custodyEventsRef = useRef<CustodyEvent[]>(initialCustodyEvents);
  const sharedHistoryLoadedAtRef = useRef(0);
  const [message, setMessage] = useState("Demo workspace loaded.");

  useEffect(() => {
    window.setTimeout(() => {
      const rawState = window.localStorage.getItem(storageKey);

      if (!rawState) {
        return;
      }

      try {
        const state = JSON.parse(rawState) as {
          isAuthenticated?: boolean;
          users?: User[];
          role?: Role;
          evidence?: Evidence[];
          activeEvidence?: Evidence;
          barcodeBatches?: BarcodeBatch[];
          custodyEvents?: CustodyEvent[];
        };

        if (state.users) setUsers(state.users);
        if (state.role) setRole(state.role);
        if (state.evidence) setEvidence(state.evidence);
        if (state.activeEvidence) setActiveEvidence(state.activeEvidence);
        if (state.barcodeBatches) setBarcodeBatches(state.barcodeBatches);
        if (state.custodyEvents) setCustodyEvents(state.custodyEvents);
      } catch {
        setMessage("Demo data reset after a local storage read error.");
      }
    }, 0);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ isAuthenticated, users, role, evidence, activeEvidence, barcodeBatches, custodyEvents })
    );
  }, [activeEvidence, barcodeBatches, custodyEvents, evidence, isAuthenticated, role, users]);

  useEffect(() => {
    custodyEventsRef.current = custodyEvents;
  }, [custodyEvents]);

  const roleUser = useMemo(() => userForRole(users, role), [role, users]);
  const currentUser = sessionUser ?? roleUser;

  const loadSupabaseProfile = useCallback(async (id: string, email: string) => {
    if (!supabase) {
      setAuthReady(true);
      return false;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, badge_id, agency, account_status")
      .eq("id", id)
      .single();

    if (error || !data) {
      const { data: request } = await supabase
        .from("access_requests")
        .select("status")
        .eq("auth_user_id", id)
        .maybeSingle();
      setIsAuthenticated(false);
      setSessionUser(null);
      if (request?.status === "Pending") {
        setMessage("Your access request is pending System Admin approval.");
      } else if (request?.status === "Rejected") {
        setMessage("Your access request was not approved. Contact your System Admin.");
      } else {
        setMessage("No active FORENX profile matches this account.");
      }
      void supabase.auth.signOut();
      setAuthReady(true);
      return false;
    }

    const profileRole = data.role as Role;
    if (!["System Admin", "Investigator", "Laboratory Analyst"].includes(profileRole)) {
      setIsAuthenticated(false);
      setSessionUser(null);
      setMessage("This account has an unsupported FORENX role.");
      void supabase.auth.signOut();
      setAuthReady(true);
      return false;
    }

    if (data.account_status !== "Active") {
      setIsAuthenticated(false);
      setSessionUser(null);
      setMessage("This FORENX account is inactive.");
      void supabase.auth.signOut();
      setAuthReady(true);
      return false;
    }

    setSessionUser({
      id: data.id,
      name: data.full_name,
      role: profileRole,
      badgeId: data.badge_id,
      agency: data.agency,
      email,
      status: data.account_status
    });
    setRole(profileRole);
    setAuthMode("Supabase");
    setIsAuthenticated(true);
    setAuthReady(true);
    setMessage(`Signed in as ${profileRole}.`);
    void supabase.rpc("touch_my_profile_activity");
    return true;
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const authClient = supabase as NonNullable<typeof supabase>;

    const { data: listener } = authClient.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if ((event === "INITIAL_SESSION" || event === "USER_UPDATED") && user?.email) {
        void loadSupabaseProfile(user.id, user.email);
      } else if (event === "INITIAL_SESSION") {
        setAuthReady(true);
      } else if (event === "SIGNED_OUT" && authMode === "Supabase") {
        setIsAuthenticated(false);
        setSessionUser(null);
        setAuthMode("Demo");
        setAuthReady(true);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [authMode, loadSupabaseProfile]);

  const addCustodyEvent = useCallback((event: Omit<CustodyEvent, "id" | "timestamp">) => {
    const createdEvent: CustodyEvent = {
      ...event,
      id: makeId("CST"),
      timestamp: nowLabel()
    };
    setCustodyEvents((events) => [createdEvent, ...events]);
    sharedHistoryLoadedAtRef.current = 0;

    if (authMode === "Supabase" && supabase && sessionUser) {
      void supabase
        .from("custody_event_feed")
        .insert(custodyFeedRecord(createdEvent, sessionUser.id))
        .then(({ error }) => {
          if (error) setMessage("Custody event saved locally. Shared history sync needs setup.");
        });
    }
  }, [authMode, sessionUser]);

  const loadCustodyHistory = useCallback(async () => {
    if (authMode !== "Supabase" || !supabase || !sessionUser) return;
    if (Date.now() - sharedHistoryLoadedAtRef.current < 60000) return;
    const client = supabase;

    const selectFeed = () => client
      .from("custody_event_feed")
      .select("id, evidence_id, action, from_user_name, to_user_name, actor_role, event_time, location, signature_data, status")
      .order("created_at", { ascending: false });

    const { data: existingRecords, error: existingError } = await selectFeed();
    if (existingError) {
      setMessage("Shared custody history needs database setup.");
      return;
    }

    const existingIds = new Set((existingRecords ?? []).map((record) => record.id));
    const missingRecords = custodyEventsRef.current.filter((event) => !existingIds.has(event.id));

    if (missingRecords.length > 0) {
      const { error: insertError } = await client
        .from("custody_event_feed")
        .insert(missingRecords.map((event) => custodyFeedRecord(event, sessionUser.id)));

      if (insertError && insertError.code !== "23505") {
        setMessage("Some local custody events could not join shared history.");
        return;
      }
    }

    const { data: sharedRecords, error: sharedError } = await selectFeed();
    if (sharedError) {
      setMessage("Shared custody history could not be loaded.");
      return;
    }

    setCustodyEvents((sharedRecords ?? []).map(custodyEventFromFeed));
    sharedHistoryLoadedAtRef.current = Date.now();
  }, [authMode, sessionUser]);

  const upsertEvidence = useCallback((record: Evidence) => {
    setEvidence((items) => {
      const exists = items.some((item) => item.id === record.id);
      if (exists) {
        return items.map((item) => (item.id === record.id ? record : item));
      }
      return [record, ...items];
    });
  }, []);

  const signIn = useCallback((nextRole: Role, email: string) => {
    setRole(nextRole);
    setSessionUser(null);
    setAuthMode("Demo");
    setIsAuthenticated(true);
    setAuthReady(true);
    setMessage(`Signed in as ${nextRole} for ${email || "demo account"}.`);
    return true;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setMessage("Secure sign-in settings are missing. Use demo sign-in for now.");
      return false;
    }

    if (!email.trim() || !password) {
      setMessage("Enter an email address and password.");
      return false;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user?.email) {
      setMessage(error?.message ?? "Secure sign-in failed.");
      return false;
    }

    return loadSupabaseProfile(data.user.id, data.user.email);
  }, [loadSupabaseProfile]);

  const refreshSession = useCallback(async () => {
    if (authMode !== "Supabase" || !supabase) return isAuthenticated;

    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user?.email) {
      setIsAuthenticated(false);
      setSessionUser(null);
      setAuthMode("Demo");
      setAuthReady(true);
      setMessage("Your session has ended. Sign in again.");
      return false;
    }

    return loadSupabaseProfile(user.id, user.email);
  }, [authMode, isAuthenticated, loadSupabaseProfile]);

  const signUpForAccess = useCallback(async (request: {
    fullName: string;
    email: string;
    password: string;
    requestedRole: Extract<Role, "Investigator" | "Laboratory Analyst">;
    badgeId: string;
    agency: string;
  }) => {
    if (!supabase) {
      setMessage("Secure account setup is unavailable.");
      return false;
    }

    if (!request.fullName.trim() || !request.email.trim() || !request.password || !request.badgeId.trim() || !request.agency.trim()) {
      setMessage("Complete every access request field.");
      return false;
    }

    const { error } = await supabase.auth.signUp({
      email: request.email.trim(),
      password: request.password,
      options: {
        data: {
          full_name: request.fullName.trim(),
          requested_role: request.requestedRole,
          badge_id: request.badgeId.trim(),
          agency: request.agency.trim()
        }
      }
    });

    if (error) {
      setMessage(error.message);
      return false;
    }

    setMessage("Access request submitted. Confirm your email, then wait for System Admin approval.");
    return true;
  }, []);

  const loadAccessRequests = useCallback(async () => {
    if (!supabase || role !== "System Admin") return;

    const { data, error } = await supabase
      .from("access_requests")
      .select("id, auth_user_id, full_name, email, requested_role, badge_id, agency, status, created_at")
      .eq("status", "Pending")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAccessRequests(
      (data ?? []).map((request) => ({
        id: request.id,
        authUserId: request.auth_user_id,
        fullName: request.full_name,
        email: request.email,
        requestedRole: request.requested_role as Extract<Role, "Investigator" | "Laboratory Analyst">,
        badgeId: request.badge_id,
        agency: request.agency,
        status: request.status as AccessRequest["status"],
        createdAt: request.created_at
      }))
    );
  }, [role]);

  const loadUserDirectory = useCallback(async () => {
    if (!supabase || role !== "System Admin") return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, badge_id, agency, email, account_status, last_active_at, inactive_since")
      .order("full_name", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setUsers(
      (data ?? []).map((user) => ({
        id: user.id,
        name: user.full_name,
        role: user.role as Role,
        badgeId: user.badge_id,
        agency: user.agency,
        email: user.email ?? "Protected email",
        status: user.account_status as User["status"],
        lastActiveAt: user.last_active_at,
        inactiveSince: user.inactive_since
      }))
    );
  }, [role]);

  const approveAccessRequest = useCallback(async (id: string) => {
    if (!supabase || role !== "System Admin") return;

    const { error } = await supabase.rpc("approve_access_request", { request_id: id });
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Access request approved. The account is now active.");
    await loadUserDirectory();
    await loadAccessRequests();
  }, [loadAccessRequests, loadUserDirectory, role]);

  const rejectAccessRequest = useCallback(async (id: string) => {
    if (!supabase || role !== "System Admin") return;

    const { error } = await supabase.rpc("reject_access_request", { request_id: id });
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Access request rejected.");
    await loadAccessRequests();
  }, [loadAccessRequests, role]);

  const submitSupportRequest = useCallback(async (request: {
    fullName: string;
    email: string;
    requestType: SupportRequest["requestType"];
    message: string;
  }) => {
    if (!request.fullName.trim() || !request.email.trim() || !request.message.trim()) {
      setMessage("Enter your name, email, and report details.");
      return false;
    }

    if (supabase) {
      const { error } = await supabase.from("support_requests").insert({
        full_name: request.fullName.trim(),
        email: request.email.trim(),
        request_type: request.requestType,
        message: request.message.trim()
      });
      if (error) {
        setMessage(error.message);
        return false;
      }
    } else {
      setSupportRequests((items) => [
        {
          id: makeId("SUP"),
          fullName: request.fullName.trim(),
          email: request.email.trim(),
          requestType: request.requestType,
          message: request.message.trim(),
          status: "Open",
          createdAt: new Date().toISOString(),
          resolvedAt: null
        },
        ...items
      ]);
    }

    setMessage("Your report has been sent to the System Admin.");
    return true;
  }, []);

  const loadSupportRequests = useCallback(async () => {
    if (!supabase || role !== "System Admin") return;

    const { data, error } = await supabase
      .from("support_requests")
      .select("id, full_name, email, request_type, message, status, created_at, resolved_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setSupportRequests(
      (data ?? []).map((request) => ({
        id: request.id,
        fullName: request.full_name,
        email: request.email,
        requestType: request.request_type as SupportRequest["requestType"],
        message: request.message,
        status: request.status as SupportRequest["status"],
        createdAt: request.created_at,
        resolvedAt: request.resolved_at
      }))
    );
  }, [role]);

  const resolveSupportRequest = useCallback(async (id: string) => {
    if (role !== "System Admin") return;

    if (supabase) {
      const { error } = await supabase.rpc("resolve_support_request", { request_id: id });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage("Support request marked as resolved.");
      await loadSupportRequests();
      return;
    }

    setSupportRequests((items) => items.map((item) => (
      item.id === id ? { ...item, status: "Resolved", resolvedAt: new Date().toISOString() } : item
    )));
    setMessage("Support request marked as resolved in the demo queue.");
  }, [loadSupportRequests, role]);

  const signOut = useCallback(() => {
    if (authMode === "Supabase" && supabase) void supabase.auth.signOut();
    setIsAuthenticated(false);
    setSessionUser(null);
    setAuthMode("Demo");
    setAuthReady(true);
    setMessage("Signed out. Demo data stayed local.");
  }, [authMode]);

  const addUser = useCallback((user: Omit<User, "id" | "status">) => {
    if (role !== "System Admin") {
      setMessage("Only System Admin accounts manage user records.");
      return;
    }

    if (!user.name.trim() || !user.email.trim()) {
      setMessage("Enter a name and email before adding a user.");
      return;
    }

    if (users.some((item) => item.email.toLowerCase() === user.email.trim().toLowerCase())) {
      setMessage("An account already uses this email address.");
      return;
    }

    setUsers((items) => [
      ...items,
      {
        ...user,
        id: makeId("USR"),
        status: "Active"
      }
    ]);
    setMessage("User added to demo directory.");
  }, [role, users]);

  const setUserStatus = useCallback(async (id: string, status: User["status"]) => {
    if (role !== "System Admin") {
      setMessage("Only System Admin accounts manage user records.");
      return;
    }

    if (id === currentUser.id) {
      setMessage("The signed-in Admin account cannot change its own access status.");
      return;
    }

    const user = users.find((item) => item.id === id);
    if (!user || user.status === status) return;

    if (authMode === "Supabase" && supabase) {
      const { error } = await supabase.rpc("set_profile_account_status", {
        target_user_id: id,
        next_status: status
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage(`${user.name} is now ${status.toLowerCase()}.`);
      await loadUserDirectory();
      return;
    }

    setUsers((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    setMessage(`${user.name} is now ${status.toLowerCase()} in the demo directory.`);
  }, [authMode, currentUser.id, loadUserDirectory, role, users]);

  const resetPassword = useCallback(async (id: string) => {
    if (role !== "System Admin") {
      setMessage("Only System Admin accounts reset passwords.");
      return;
    }

    const user = users.find((item) => item.id === id);
    if (!user) {
      setMessage("Selected user record was not found.");
      return;
    }

    if (authMode === "Supabase" && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/login`
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage(`Password reset email sent to ${user.email}.`);
      return;
    }

    setMessage(`Password reset recorded for ${user.name} in the demo directory.`);
  }, [authMode, role, users]);

  const generateBarcodeBatch = useCallback((quantity: number) => {
    if (role !== "System Admin") {
      setMessage("Only System Admin accounts generate barcode batches.");
      return false;
    }

    const safeQuantity = Math.min(Math.max(quantity, 1), 48);
    const start = barcodeBatches.reduce((total, batch) => total + batch.quantity, 100);
    const barcodes = Array.from({ length: safeQuantity }, (_, index) =>
      `FX-${String(start + index + 1).padStart(6, "0")}`
    );

    setBarcodeBatches((items) => [
      {
        id: makeId("BAT"),
        createdBy: currentUser.name,
        quantity: safeQuantity,
        barcodePrefix: "FX",
        createdAt: nowLabel(),
        barcodes
      },
      ...items
    ]);
    setMessage(`${safeQuantity} barcode labels generated.`);
    return true;
  }, [barcodeBatches, currentUser.name, role]);

  const startNewEvidence = useCallback(() => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts start evidence intake.");
      return false;
    }

    const draft = {
      ...emptyEvidence,
      recoveredBy: currentUser.name,
      recoveryDateTime: nowLabel(),
      gpsCoordinates: "14.5697 N, 120.9842 E",
      id: "EV-DRAFT"
    };
    setActiveEvidence(draft);
    setMessage("New evidence workflow started.");
    return true;
  }, [currentUser.name, role]);

  const assignBarcode = useCallback((barcode: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts assign evidence barcodes.");
      return false;
    }

    const cleanBarcode = barcode.trim().toUpperCase();

    if (!/^FX-\d{6}$/.test(cleanBarcode)) {
      setMessage("Use a FORENX barcode in the FX-000000 format.");
      return false;
    }

    const assignedElsewhere = evidence.some(
      (record) => record.barcode === cleanBarcode && record.id !== activeEvidence.id
    );

    if (assignedElsewhere) {
      setMessage("This barcode already belongs to an evidence record.");
      return false;
    }

    const batchBarcodes = barcodeBatches.flatMap((batch) => batch.barcodes);
    if (batchBarcodes.length > 0 && !batchBarcodes.includes(cleanBarcode)) {
      setMessage("This barcode is not part of an approved Admin batch.");
      return false;
    }

    const evidenceId = `EV-2026-${cleanBarcode.slice(-4)}`;

    setActiveEvidence((current) => ({
      ...current,
      id: evidenceId,
      barcode: cleanBarcode,
      recoveredBy: currentUser.name,
      recoveryDateTime: current.recoveryDateTime || nowLabel(),
      gpsCoordinates: current.gpsCoordinates || "14.5697 N, 120.9842 E",
      status: "Draft"
    }));
    setMessage(`${cleanBarcode} assigned to active evidence.`);
    return true;
  }, [activeEvidence.id, barcodeBatches, currentUser.name, evidence, role]);

  const completeSpatialCapture = useCallback((photoCaptures: string[], threeDCaptureRequested: boolean) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts capture scene condition data.");
      return false;
    }

    if (!activeEvidence.barcode) {
      setMessage("Assign a barcode before marking capture complete.");
      return false;
    }

    if (photoCaptures.length === 0) {
      setMessage("Add at least one 2D evidence photo before continuing.");
      return false;
    }

    setActiveEvidence((current) => ({
      ...current,
      photoCaptures,
      threeDCaptureRequested,
      spatialCaptureStatus: "Captured",
      spatialCapturePreview: `${photoCaptures.length} 2D evidence photo${photoCaptures.length === 1 ? "" : "s"} captured${threeDCaptureRequested ? "; 3D capture requested" : ""}`
    }));
    setMessage("2D evidence photos saved.");
    return true;
  }, [activeEvidence.barcode, role]);

  const updateActiveEvidence = useCallback((field: keyof Evidence, value: string) => {
    setActiveEvidence((current) => ({
      ...current,
      [field]: value
    }));
  }, []);

  const saveEvidenceForm = useCallback((signature: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts log evidence forms.");
      return false;
    }

    if (activeEvidence.status !== "Draft") {
      setMessage("Only Draft evidence records are ready for logging.");
      return false;
    }

    const requiredFields: [string, string][] = [
      ["barcode", activeEvidence.barcode],
      ["case number", activeEvidence.caseNumber],
      ["offense type", activeEvidence.offenseType],
      ["item category", activeEvidence.itemCategory],
      ["item description", activeEvidence.itemDescription],
      ["recovery date and time", activeEvidence.recoveryDateTime],
      ["GPS coordinates", activeEvidence.gpsCoordinates],
      ["specific location", activeEvidence.locationDetails],
      ["investigator signature", signature || activeEvidence.investigatorSignature]
    ];
    const missing = requiredFields.find(([, value]) => !value.trim());

    if (missing) {
      setMessage(`Complete ${missing[0]} before logging evidence.`);
      return false;
    }

    if (activeEvidence.spatialCaptureStatus !== "Captured") {
      setMessage("Complete the spatial capture before logging evidence.");
      return false;
    }

    if (!activeEvidence.photoCaptures?.length) {
      setMessage("Add at least one 2D evidence photo before logging evidence.");
      return false;
    }

    const signedRecord: Evidence = {
      ...activeEvidence,
      investigatorSignature: signature || activeEvidence.investigatorSignature || currentUser.name,
      status: "Logged"
    };

    setActiveEvidence(signedRecord);
    upsertEvidence(signedRecord);
    addCustodyEvent({
      evidenceId: signedRecord.id,
      action: "Evidence collected",
      fromUser: "Crime scene",
      toUser: currentUser.name,
      role: "Investigator",
      location: signedRecord.locationDetails || signedRecord.gpsCoordinates,
      signatureImage: signedRecord.investigatorSignature,
      status: "Logged"
    });
    setMessage("Evidence form logged with investigator signature.");
    return true;
  }, [activeEvidence, addCustodyEvent, currentUser.name, role, upsertEvidence]);

  const transferEvidence = useCallback((destinationLab: string, signature: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts transfer evidence.");
      return false;
    }

    if (activeEvidence.status !== "Logged") {
      setMessage("Log the evidence form before starting a transfer.");
      return false;
    }

    if (!destinationLab || !signature) {
      setMessage("Select a destination and save a transfer signature.");
      return false;
    }

    const record: Evidence = {
      ...activeEvidence,
      destinationLab,
      investigatorSignature: signature || activeEvidence.investigatorSignature || currentUser.name,
      status: "In Transit"
    };

    setActiveEvidence(record);
    upsertEvidence(record);
    addCustodyEvent({
      evidenceId: record.id,
      action: "Transfer started",
      fromUser: currentUser.name,
      toUser: destinationLab,
      role: "Investigator",
      location: "Field transfer point",
      signatureImage: record.investigatorSignature,
      status: "In Transit"
    });
    setMessage(`${record.id} marked In Transit.`);
    return true;
  }, [activeEvidence, addCustodyEvent, currentUser.name, role, upsertEvidence]);

  const receiveEvidence = useCallback((barcode: string, signature: string) => {
    if (role !== "Laboratory Analyst") {
      setMessage("Only Laboratory Analyst accounts accept lab custody.");
      return false;
    }

    const cleanBarcode = barcode.trim().toUpperCase();
    const incomingRecord = evidence.find((record) => record.barcode === cleanBarcode);

    if (!incomingRecord || incomingRecord.status !== "In Transit") {
      setMessage("Barcode mismatch. Lab custody not accepted.");
      return false;
    }

    if (!signature) {
      setMessage("Save the laboratory signature before accepting custody.");
      return false;
    }

    const record: Evidence = {
      ...incomingRecord,
      labSignature: signature,
      status: "In Lab Custody"
    };

    setActiveEvidence(record);
    upsertEvidence(record);
    addCustodyEvent({
      evidenceId: record.id,
      action: "Lab custody accepted",
      fromUser: record.recoveredBy,
      toUser: currentUser.name,
      role: "Laboratory Analyst",
      location: "Forensic Lab",
      signatureImage: record.labSignature,
      status: "In Lab Custody"
    });
    setMessage(`${record.id} accepted by laboratory.`);
    return true;
  }, [addCustodyEvent, currentUser.name, evidence, role, upsertEvidence]);

  const selectEvidence = useCallback((id: string) => {
    const record = evidence.find((item) => item.id === id);
    if (record) setActiveEvidence(record);
  }, [evidence]);

  const resetDemo = useCallback(() => {
    setIsAuthenticated(false);
    setAuthReady(true);
    setSessionUser(null);
    setAuthMode("Demo");
    setUsers(initialUsers);
    setAccessRequests([]);
    setSupportRequests([]);
    setRole("Investigator");
    setEvidence(initialEvidenceRecords);
    setActiveEvidence(initialEvidenceRecords[0]);
    setBarcodeBatches(initialBarcodeBatches);
    setCustodyEvents(initialCustodyEvents);
    setMessage("Demo data restored.");
  }, []);

  const store = useMemo<Store>(
    () => ({
      isAuthenticated,
      authReady,
      authMode,
      role,
      currentUser,
      users,
      accessRequests,
      supportRequests,
      evidence,
      activeEvidence,
      barcodeBatches,
      custodyEvents,
      message,
      backendMode: supabaseReady ? "Connected" : "Demo data",
      signIn,
      signInWithPassword,
      signUpForAccess,
      signOut,
      setRole,
      addUser,
      setUserStatus,
      resetPassword,
      loadUserDirectory,
      loadAccessRequests,
      approveAccessRequest,
      rejectAccessRequest,
      submitSupportRequest,
      loadSupportRequests,
      resolveSupportRequest,
      loadCustodyHistory,
      refreshSession,
      generateBarcodeBatch,
      startNewEvidence,
      assignBarcode,
      completeSpatialCapture,
      updateActiveEvidence,
      saveEvidenceForm,
      transferEvidence,
      receiveEvidence,
      selectEvidence,
      resetDemo
    }),
    [
      activeEvidence,
      addUser,
      accessRequests,
      assignBarcode,
      approveAccessRequest,
      barcodeBatches,
      completeSpatialCapture,
      currentUser,
      custodyEvents,
      evidence,
      generateBarcodeBatch,
      isAuthenticated,
      authReady,
      authMode,
      loadAccessRequests,
      loadCustodyHistory,
      loadSupportRequests,
      loadUserDirectory,
      message,
      receiveEvidence,
      rejectAccessRequest,
      resolveSupportRequest,
      resetDemo,
      resetPassword,
      refreshSession,
      role,
      saveEvidenceForm,
      selectEvidence,
      signIn,
      signInWithPassword,
      signUpForAccess,
      submitSupportRequest,
      signOut,
      startNewEvidence,
      transferEvidence,
      updateActiveEvidence,
      setUserStatus,
      supportRequests,
      users
    ]
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useForenxStore() {
  const store = useContext(StoreContext);

  if (!store) {
    throw new Error("useForenxStore must run inside ForenxStoreProvider.");
  }

  return store;
}

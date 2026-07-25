"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import { emptyEvidence, users as initialUsers } from "@/lib/mock-data";
import { supabase, supabaseReady } from "@/lib/supabase";
import {
  accessRequestSchema,
  barcodeQuantitySchema,
  barcodeSchema,
  evidenceFormSchema,
  signInSchema,
  signatureDataSchema,
  supportRequestSchema
} from "@/lib/validation";
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
  evidenceLoading: boolean;
  activeEvidence: Evidence;
  barcodeBatches: BarcodeBatch[];
  custodyEvents: CustodyEvent[];
  message: string;
  messageVersion: number;
  dismissedMessageVersion: number;
  backendMode: string;
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
  generateBarcodeBatch: (quantity: number) => Promise<boolean>;
  startNewEvidence: () => Promise<boolean>;
  assignBarcode: (barcode: string) => Promise<boolean>;
  completeSpatialCapture: (photoCaptures: string[], threeDCaptureRequested: boolean) => Promise<boolean>;
  updateActiveEvidence: (field: keyof Evidence, value: string) => void;
  saveEvidenceForm: (signature: string) => Promise<boolean>;
  transferEvidence: (destinationLab: string, signature: string) => Promise<boolean>;
  receiveEvidence: (barcode: string, signature: string) => Promise<boolean>;
  closeEvidence: () => Promise<boolean>;
  selectEvidence: (id: string) => void;
  deleteDraftEvidence: (id: string) => Promise<void>;
  dismissMessage: () => void;
  resetDemo: () => void;
};

const StoreContext = createContext<Store | null>(null);
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

function isStoragePath(value: string) {
  return value.startsWith("signatures/") || value.startsWith("evidence/");
}

function userForRole(users: User[], role: Role) {
  return (
    users.find((user) => user.role === role) ??
    users[0] ??
    initialUsers.find((user) => user.role === role) ??
    initialUsers[0]
  );
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
    signatureImage: isStoragePath(record.signature_data) ? "" : record.signature_data,
    signaturePath: isStoragePath(record.signature_data) ? record.signature_data : undefined,
    status: record.status as CustodyEvent["status"]
  };
}

type EvidenceRow = {
  id: string;
  barcode: string | null;
  case_number: string | null;
  offense_type: string | null;
  item_category: string | null;
  item_description: string | null;
  recovery_at: string | null;
  gps_coordinates: string | null;
  location_details: string | null;
  recovered_by: string;
  recovered_by_name: string | null;
  investigator_signature_path: string | null;
  lab_signature_path: string | null;
  three_d_capture_requested: boolean | null;
  spatial_capture_status: Evidence["spatialCaptureStatus"];
  spatial_capture_note: string | null;
  status: Evidence["status"];
  destination_lab: string | null;
};

function displayDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function databaseDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function evidenceFromRow(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    barcode: row.barcode ?? "",
    caseNumber: row.case_number ?? "",
    offenseType: row.offense_type ?? "",
    itemCategory: row.item_category ?? "",
    itemDescription: row.item_description ?? "",
    recoveryDateTime: displayDate(row.recovery_at),
    gpsCoordinates: row.gps_coordinates ?? "",
    locationDetails: row.location_details ?? "",
    recoveredBy: row.recovered_by_name ?? "Assigned investigator",
    recoveredById: row.recovered_by,
    investigatorSignature: "",
    investigatorSignaturePath: row.investigator_signature_path ?? undefined,
    labSignature: "",
    labSignaturePath: row.lab_signature_path ?? undefined,
    photoCaptures: [],
    threeDCaptureRequested: Boolean(row.three_d_capture_requested),
    spatialCaptureStatus: row.spatial_capture_status ?? "Not Started",
    spatialCapturePreview: row.spatial_capture_note ?? "No 2D evidence photos captured",
    status: row.status,
    destinationLab: row.destination_lab ?? ""
  };
}

export function ForenxStoreProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseReady);
  const [authMode, setAuthMode] = useState<"Demo" | "Supabase">("Supabase");
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [role, setRole] = useState<Role>("Investigator");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState<Evidence>(emptyEvidence);
  const [barcodeBatches, setBarcodeBatches] = useState<BarcodeBatch[]>([]);
  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>([]);
  const sharedHistoryLoadedAtRef = useRef(0);
  const sharedEvidenceLoadedForRef = useRef("");
  const [messageState, setMessage] = useReducer(
    (
      state: { message: string; version: number; dismissedVersion: number },
      action: string | { type: "dismiss" }
    ) => {
      if (typeof action === "string") {
        return { message: action, version: state.version + 1, dismissedVersion: -1 };
      }

      return { ...state, dismissedVersion: state.version };
    },
    { message: "Session ready.", version: 0, dismissedVersion: 0 }
  );
  const { message, version: messageVersion, dismissedVersion: dismissedMessageVersion } = messageState;
  const dismissMessage = useCallback(() => setMessage({ type: "dismiss" }), []);

  const roleUser = useMemo(() => userForRole(users, role), [role, users]);
  const currentUser = sessionUser ?? roleUser;

  const getSignedAssetUrls = useCallback(async (paths: string[]) => {
    if (!supabase || paths.length === 0) return new Map<string, string>();
    const client = supabase;
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    const groups = {
      signatures: uniquePaths.filter((path) => path.startsWith("signatures/")),
      evidence: uniquePaths.filter((path) => path.startsWith("evidence/"))
    };
    const urlMap = new Map<string, string>();

    const addUrls = async (bucket: "forenx-signatures" | "forenx-evidence-media", group: string[]) => {
      if (group.length === 0) return;
      const { data } = await client.storage.from(bucket).createSignedUrls(group, 3600);
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) urlMap.set(item.path, item.signedUrl);
      }
    };

    await Promise.all([
      addUrls("forenx-signatures", groups.signatures),
      addUrls("forenx-evidence-media", groups.evidence)
    ]);
    return urlMap;
  }, []);

  const uploadSignatureAsset = useCallback(async (evidenceId: string, label: string, signature: string) => {
    if (!signature.startsWith("data:image/") || authMode !== "Supabase" || !supabase || !sessionUser) {
      return { preview: signature, path: undefined as string | undefined };
    }

    try {
      const blob = await fetch(signature).then((response) => response.blob());
      const path = `signatures/${sessionUser.id}/${evidenceId}/${label}-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("forenx-signatures")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (error) throw error;

      const { data } = await supabase.storage.from("forenx-signatures").createSignedUrl(path, 3600);
      return { preview: data?.signedUrl ?? signature, path };
    } catch {
      setMessage("Signature upload failed. Draw and save the signature again.");
      return null;
    }
  }, [authMode, sessionUser]);

  const uploadEvidencePhotos = useCallback(async (record: Evidence, photos: string[]) => {
    if (authMode !== "Supabase" || !supabase || !sessionUser) return true;
    const sourcePhotos = photos.filter((photo) => photo.startsWith("data:image/"));
    if (sourcePhotos.length === 0) return true;

    const uploadedPaths: string[] = [];
    try {
      for (const [index, photo] of sourcePhotos.entries()) {
        const blob = await fetch(photo).then((response) => response.blob());
        const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const path = `evidence/${sessionUser.id}/${record.id}/photo-${Date.now()}-${index + 1}.${extension}`;
        const { error } = await supabase.storage
          .from("forenx-evidence-media")
          .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
      }

      const { error: mediaError } = await supabase.from("evidence_media").insert(
        uploadedPaths.map((storage_path) => ({
          evidence_id: record.id,
          uploaded_by: sessionUser.id,
          media_type: "Photo",
          storage_path
        }))
      );
      if (mediaError) throw mediaError;
      return true;
    } catch {
      if (uploadedPaths.length > 0) void supabase.storage.from("forenx-evidence-media").remove(uploadedPaths);
      setMessage("Photo upload failed. Keep this page open and try again.");
      return false;
    }
  }, [authMode, sessionUser]);

  const persistEvidenceRecord = useCallback(async (record: Evidence, mode: "create" | "update" = "update") => {
    if (authMode !== "Supabase" || !supabase || !sessionUser) return true;

    const payload = {
      id: record.id,
      barcode: record.barcode || null,
      case_number: record.caseNumber || null,
      offense_type: record.offenseType || null,
      item_category: record.itemCategory || null,
      item_description: record.itemDescription || null,
      recovery_at: databaseDate(record.recoveryDateTime),
      gps_coordinates: record.gpsCoordinates || null,
      location_details: record.locationDetails || null,
      recovered_by: record.recoveredById ?? sessionUser.id,
      recovered_by_name: record.recoveredBy || currentUser.name,
      investigator_signature_path: record.investigatorSignaturePath ?? null,
      lab_signature_path: record.labSignaturePath ?? null,
      three_d_capture_requested: record.threeDCaptureRequested,
      spatial_capture_status: record.spatialCaptureStatus,
      spatial_capture_note: record.spatialCapturePreview || null,
      status: record.status,
      destination_lab: record.destinationLab || null
    };

    const result = mode === "create"
      ? await supabase.from("evidence").insert(payload)
      : await supabase.from("evidence").update(payload).eq("id", record.id).select("id").maybeSingle();

    const { error } = result;

    if (error) {
      setMessage(`Evidence sync failed: ${error.message}`);
      return false;
    }

    if (mode === "update" && !("data" in result && result.data)) {
      setMessage("Evidence sync failed: the record no longer exists in the database.");
      return false;
    }

    return true;
  }, [authMode, currentUser.name, sessionUser]);

  const loadSharedEvidence = useCallback(async () => {
    if (authMode !== "Supabase" || !supabase || !sessionUser) return;
    const loadKey = `${sessionUser.id}:${role}`;
    if (sharedEvidenceLoadedForRef.current === loadKey) return;
    setEvidenceLoading(true);

    const { data: evidenceRows, error: evidenceError } = await supabase
      .from("evidence")
      .select("id, barcode, case_number, offense_type, item_category, item_description, recovery_at, gps_coordinates, location_details, recovered_by, recovered_by_name, investigator_signature_path, lab_signature_path, three_d_capture_requested, spatial_capture_status, spatial_capture_note, status, destination_lab")
      .order("updated_at", { ascending: false });

    if (evidenceError) {
      setMessage("Evidence database setup is incomplete. Run enable-production-evidence-flow.sql.");
      setEvidenceLoading(false);
      return;
    }

    const { data: barcodeRows, error: barcodeError } = await supabase
      .from("barcodes")
      .select("batch_id, value")
      .order("value", { ascending: true });

    if (barcodeError) {
      setMessage("Barcode labels could not be loaded from the database.");
      setEvidenceLoading(false);
      return;
    }

    const mappedEvidence = (evidenceRows ?? []).map((row) => evidenceFromRow(row as EvidenceRow));
    const evidenceIds = mappedEvidence.map((record) => record.id);
    const { data: mediaRows } = evidenceIds.length > 0
      ? await supabase
        .from("evidence_media")
        .select("evidence_id, storage_path")
        .eq("media_type", "Photo")
        .in("evidence_id", evidenceIds)
      : { data: [] as { evidence_id: string; storage_path: string }[] };
    const signedUrls = await getSignedAssetUrls([
      ...mappedEvidence.flatMap((record) => [record.investigatorSignaturePath ?? "", record.labSignaturePath ?? ""]),
      ...(mediaRows ?? []).map((media) => media.storage_path)
    ]);
    const hydratedEvidence = mappedEvidence.map((record) => ({
      ...record,
      investigatorSignature: record.investigatorSignaturePath ? signedUrls.get(record.investigatorSignaturePath) ?? "Signature stored" : "",
      labSignature: record.labSignaturePath ? signedUrls.get(record.labSignaturePath) ?? "Signature stored" : "",
      photoCaptures: (mediaRows ?? [])
        .filter((media) => media.evidence_id === record.id)
        .map((media) => signedUrls.get(media.storage_path))
        .filter((url): url is string => Boolean(url))
    }));
    setEvidence(hydratedEvidence);

    if (role === "System Admin") {
      const { data: batchRows, error: batchError } = await supabase
        .from("barcode_batches")
        .select("id, quantity, barcode_prefix, created_at, created_by")
        .order("created_at", { ascending: false });

      if (!batchError) {
        setBarcodeBatches((batchRows ?? []).map((batch) => ({
          id: batch.id,
          createdBy: "System Admin",
          quantity: batch.quantity,
          barcodePrefix: batch.barcode_prefix,
          createdAt: displayDate(batch.created_at),
          barcodes: (barcodeRows ?? []).filter((barcode) => barcode.batch_id === batch.id).map((barcode) => barcode.value)
        })));
      }
    } else {
      setBarcodeBatches([
        {
          id: "issued-labels",
          createdBy: "System Admin",
          quantity: (barcodeRows ?? []).length,
          barcodePrefix: "FX",
          createdAt: "",
          barcodes: (barcodeRows ?? []).map((barcode) => barcode.value)
        }
      ]);
    }

    sharedEvidenceLoadedForRef.current = loadKey;
    setEvidenceLoading(false);
  }, [authMode, getSignedAssetUrls, role, sessionUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSharedEvidence();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSharedEvidence]);

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
        setAuthMode("Supabase");
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
  }, []);

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

    const mappedEvents = (existingRecords ?? []).map(custodyEventFromFeed);
    const signatureUrls = await getSignedAssetUrls(
      mappedEvents.flatMap((event) => event.signaturePath ? [event.signaturePath] : [])
    );
    setCustodyEvents(mappedEvents.map((event) => ({
      ...event,
      signatureImage: event.signaturePath ? signatureUrls.get(event.signaturePath) ?? "Signature stored" : event.signatureImage
    })));
    sharedHistoryLoadedAtRef.current = Date.now();
  }, [authMode, getSignedAssetUrls, sessionUser]);

  const upsertEvidence = useCallback((record: Evidence) => {
    setEvidence((items) => {
      const exists = items.some((item) => item.id === record.id);
      if (exists) {
        return items.map((item) => (item.id === record.id ? record : item));
      }
      return [record, ...items];
    });
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setMessage("Secure sign-in settings are unavailable.");
      return false;
    }

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setMessage("Enter a valid email address and password.");
      return false;
    }

    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user?.email) {
      setMessage("Sign-in failed. Check your details or contact your System Admin.");
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
      setAuthMode("Supabase");
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

    const parsed = accessRequestSchema.safeParse(request);
    if (!parsed.success) {
      setMessage("Review the access request details and password requirements.");
      return false;
    }

    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.fullName,
          requested_role: parsed.data.requestedRole,
          badge_id: parsed.data.badgeId,
          agency: parsed.data.agency
        }
      }
    });

    if (error) {
      setMessage("Account request could not be submitted. Check the details or use a different email.");
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
    const parsed = supportRequestSchema.safeParse(request);
    if (!parsed.success) {
      setMessage("Enter valid contact details and a report between 1 and 2,000 characters.");
      return false;
    }

    if (!supabase) {
      setMessage("Support requests are unavailable until secure backend settings are configured.");
      return false;
    }

    const { error } = await supabase.from("support_requests").insert({
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      request_type: parsed.data.requestType,
      message: parsed.data.message
    });
    if (error) {
      setMessage("Your report could not be sent. Try again later.");
      return false;
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
    setAuthMode("Supabase");
    setAuthReady(true);
    setMessage("Signed out.");
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

  const generateBarcodeBatch = useCallback(async (quantity: number) => {
    if (role !== "System Admin") {
      setMessage("Only System Admin accounts generate barcode batches.");
      return false;
    }

    const quantityResult = barcodeQuantitySchema.safeParse(quantity);
    if (!quantityResult.success) {
      setMessage("Enter a barcode quantity from 1 to 48.");
      return false;
    }

    const safeQuantity = quantityResult.data;

    if (authMode === "Supabase" && supabase) {
      const { data, error } = await supabase.rpc("generate_barcode_batch", { requested_quantity: safeQuantity });
      if (error || !data) {
        setMessage(`Barcode batch failed: ${error?.message ?? "No labels returned."}`);
        return false;
      }

      const generatedRows = data as { batch_id: string; barcode_value: string; created_at: string }[];
      setBarcodeBatches((items) => [
        {
          id: generatedRows[0]?.batch_id ?? makeId("BAT"),
          createdBy: currentUser.name,
          quantity: generatedRows.length,
          barcodePrefix: "FX",
          createdAt: displayDate(generatedRows[0]?.created_at ?? new Date().toISOString()),
          barcodes: generatedRows.map((row) => row.barcode_value)
        },
        ...items
      ]);
      setMessage(`${generatedRows.length} barcode labels generated.`);
      return true;
    }

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
  }, [authMode, barcodeBatches, currentUser.name, role]);

  const startNewEvidence = useCallback(async () => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts start evidence intake.");
      return false;
    }

    const draft = {
      ...emptyEvidence,
      recoveredBy: currentUser.name,
      recoveryDateTime: nowLabel(),
      gpsCoordinates: "14.5697 N, 120.9842 E",
      id: makeId("EV-DRAFT"),
      recoveredById: sessionUser?.id
    };

    setEvidence((items) => [draft, ...items]);
    setActiveEvidence(draft);
    if (!(await persistEvidenceRecord(draft, "create"))) return false;
    setMessage("Draft saved. Continue when ready.");
    return true;
  }, [currentUser.name, persistEvidenceRecord, role, sessionUser?.id]);

  const assignBarcode = useCallback(async (barcode: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts assign evidence barcodes.");
      return false;
    }

    const barcodeResult = barcodeSchema.safeParse(barcode);
    if (!barcodeResult.success) {
      setMessage("Use a FORENX barcode in the FX-000000 format.");
      return false;
    }
    const cleanBarcode = barcodeResult.data;

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

    const evidenceId = `EV-${new Date().getFullYear()}-${cleanBarcode.slice(-4)}`;

    if (authMode === "Supabase" && supabase) {
      const client = supabase;
      const assignRemoteBarcode = () => client.rpc("assign_barcode_to_evidence", {
        draft_evidence_id: activeEvidence.id,
        scanned_barcode: cleanBarcode
      });
      let { data, error } = await assignRemoteBarcode();

      if (error?.message.includes("Draft evidence record was not found")) {
        const savedDraft = await persistEvidenceRecord(activeEvidence, "create");
        if (savedDraft) ({ data, error } = await assignRemoteBarcode());
      }

      if (error || !data) {
        setMessage(`Barcode assignment failed: ${error?.message ?? "No evidence record returned."}`);
        return false;
      }

      const assignedRecord = {
        ...evidenceFromRow((Array.isArray(data) ? data[0] : data) as EvidenceRow),
        photoCaptures: activeEvidence.photoCaptures,
        investigatorSignature: activeEvidence.investigatorSignature,
        labSignature: activeEvidence.labSignature
      };
      setActiveEvidence(assignedRecord);
      setEvidence((items) => [assignedRecord, ...items.filter((item) => item.id !== activeEvidence.id)]);
      setMessage(`${cleanBarcode} assigned to active evidence.`);
      return true;
    }

    const record: Evidence = {
      ...activeEvidence,
      id: evidenceId,
      barcode: cleanBarcode,
      recoveredBy: currentUser.name,
      recoveryDateTime: activeEvidence.recoveryDateTime || nowLabel(),
      gpsCoordinates: activeEvidence.gpsCoordinates || "14.5697 N, 120.9842 E",
      status: "Draft"
    };

    setActiveEvidence(record);
    setEvidence((items) => [
      record,
      ...items.filter((item) => item.id !== activeEvidence.id)
    ]);
    setMessage(`${cleanBarcode} assigned to active evidence.`);
    return true;
  }, [activeEvidence, authMode, barcodeBatches, currentUser.name, evidence, persistEvidenceRecord, role]);

  const completeSpatialCapture = useCallback(async (photoCaptures: string[], threeDCaptureRequested: boolean) => {
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

    const record: Evidence = {
      ...activeEvidence,
      photoCaptures,
      threeDCaptureRequested,
      spatialCaptureStatus: "Captured",
      spatialCapturePreview: `${photoCaptures.length} 2D evidence photo${photoCaptures.length === 1 ? "" : "s"} captured${threeDCaptureRequested ? "; 3D capture requested" : ""}`
    };

    if (!(await uploadEvidencePhotos(record, photoCaptures))) return false;
    if (!(await persistEvidenceRecord(record))) return false;
    setActiveEvidence(record);
    setEvidence((items) => items.map((item) => (item.id === record.id ? record : item)));
    setMessage("2D evidence photos saved.");
    return true;
  }, [activeEvidence, persistEvidenceRecord, role, uploadEvidencePhotos]);

  const updateActiveEvidence = useCallback((field: keyof Evidence, value: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts edit evidence collection fields.");
      return;
    }

    const record: Evidence = {
      ...activeEvidence,
      [field]: value
    };

    setActiveEvidence(record);
    setEvidence((items) => items.map((item) => (item.id === record.id ? record : item)));
  }, [activeEvidence, role]);

  const saveEvidenceForm = useCallback(async (signature: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts log evidence forms.");
      return false;
    }

    if (activeEvidence.status !== "Draft") {
      setMessage("Only Draft evidence records are ready for logging.");
      return false;
    }

    if (!evidenceFormSchema.safeParse(activeEvidence).success) {
      setMessage("Review the evidence details before logging the record.");
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

    const signatureValue = signature || activeEvidence.investigatorSignature || currentUser.name;
    if (!signatureDataSchema.safeParse(signatureValue).success && signatureValue !== currentUser.name) {
      setMessage("Save a valid investigator signature before logging evidence.");
      return false;
    }
    const signatureAsset = await uploadSignatureAsset(activeEvidence.id, "collection", signatureValue);
    if (!signatureAsset) return false;

    const signedRecord: Evidence = {
      ...activeEvidence,
      investigatorSignature: signatureAsset.preview,
      investigatorSignaturePath: signatureAsset.path ?? activeEvidence.investigatorSignaturePath,
      status: "Logged"
    };

    if (!(await persistEvidenceRecord(signedRecord))) return false;
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
      signaturePath: signedRecord.investigatorSignaturePath,
      status: "Logged"
    });
    setMessage("Evidence form logged with investigator signature.");
    return true;
  }, [activeEvidence, addCustodyEvent, currentUser.name, persistEvidenceRecord, role, uploadSignatureAsset, upsertEvidence]);

  const transferEvidence = useCallback(async (destinationLab: string, signature: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts transfer evidence.");
      return false;
    }

    if (activeEvidence.status !== "Logged") {
      setMessage("Log the evidence form before starting a transfer.");
      return false;
    }

    if (!destinationLab.trim() || !signatureDataSchema.safeParse(signature).success || !signature) {
      setMessage("Select a destination and save a transfer signature.");
      return false;
    }

    const signatureAsset = await uploadSignatureAsset(activeEvidence.id, "transfer", signature);
    if (!signatureAsset) return false;

    const record: Evidence = {
      ...activeEvidence,
      destinationLab,
      status: "In Transit"
    };

    if (!(await persistEvidenceRecord(record))) return false;
    setActiveEvidence(record);
    upsertEvidence(record);
    addCustodyEvent({
      evidenceId: record.id,
      action: "Transfer started",
      fromUser: currentUser.name,
      toUser: destinationLab,
      role: "Investigator",
      location: "Field transfer point",
      signatureImage: signatureAsset.preview,
      signaturePath: signatureAsset.path,
      status: "In Transit"
    });
    setMessage(`${record.id} marked In Transit.`);
    return true;
  }, [activeEvidence, addCustodyEvent, currentUser.name, persistEvidenceRecord, role, uploadSignatureAsset, upsertEvidence]);

  const receiveEvidence = useCallback(async (barcode: string, signature: string) => {
    if (role !== "Laboratory Analyst") {
      setMessage("Only Laboratory Analyst accounts accept lab custody.");
      return false;
    }

    const barcodeResult = barcodeSchema.safeParse(barcode);
    if (!barcodeResult.success) {
      setMessage("Barcode mismatch. Lab custody not accepted.");
      return false;
    }
    const cleanBarcode = barcodeResult.data;
    const incomingRecord = evidence.find((record) => record.barcode === cleanBarcode);

    if (!incomingRecord || incomingRecord.status !== "In Transit") {
      setMessage("Barcode mismatch. Lab custody not accepted.");
      return false;
    }

    if (!signature || !signatureDataSchema.safeParse(signature).success) {
      setMessage("Save the laboratory signature before accepting custody.");
      return false;
    }

    const signatureAsset = await uploadSignatureAsset(incomingRecord.id, "lab-acceptance", signature);
    if (!signatureAsset) return false;

    const record: Evidence = {
      ...incomingRecord,
      labSignature: signatureAsset.preview,
      labSignaturePath: signatureAsset.path ?? incomingRecord.labSignaturePath,
      status: "In Lab Custody"
    };

    if (!(await persistEvidenceRecord(record))) return false;
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
      signaturePath: record.labSignaturePath,
      status: "In Lab Custody"
    });
    setMessage(`${record.id} accepted by laboratory.`);
    return true;
  }, [addCustodyEvent, currentUser.name, evidence, persistEvidenceRecord, role, uploadSignatureAsset, upsertEvidence]);

  const closeEvidence = useCallback(async () => {
    if (role !== "Laboratory Analyst") {
      setMessage("Only Laboratory Analyst accounts close evidence records.");
      return false;
    }

    if (activeEvidence.status !== "In Lab Custody") {
      setMessage("Only evidence in laboratory custody is ready to close.");
      return false;
    }

    const record: Evidence = { ...activeEvidence, status: "Closed" };
    if (!(await persistEvidenceRecord(record))) return false;

    setActiveEvidence(record);
    upsertEvidence(record);
    addCustodyEvent({
      evidenceId: record.id,
      action: "Evidence closed",
      fromUser: currentUser.name,
      toUser: "Evidence archive",
      role: "Laboratory Analyst",
      location: "Forensic Lab",
      signatureImage: record.labSignature,
      signaturePath: record.labSignaturePath,
      status: "Closed"
    });
    setMessage(`${record.id} closed and moved to the evidence archive.`);
    return true;
  }, [activeEvidence, addCustodyEvent, currentUser.name, persistEvidenceRecord, role, upsertEvidence]);

  const selectEvidence = useCallback((id: string) => {
    const record = evidence.find((item) => item.id === id);
    if (record) setActiveEvidence(record);
  }, [evidence]);

  const deleteDraftEvidence = useCallback(async (id: string) => {
    if (role !== "Investigator") {
      setMessage("Only Investigator accounts manage draft evidence.");
      return;
    }

    const record = evidence.find((item) => item.id === id);
    if (!record || record.status !== "Draft") {
      setMessage("Only Draft records can be deleted.");
      return;
    }

    if (authMode === "Supabase" && supabase) {
      const { data: mediaRows } = await supabase
        .from("evidence_media")
        .select("storage_path")
        .eq("evidence_id", id);
      const { error } = await supabase.from("evidence").delete().eq("id", id);
      if (error) {
        setMessage(`Draft deletion failed: ${error.message}`);
        return;
      }

      const paths = (mediaRows ?? []).map((media) => media.storage_path);
      if (paths.length > 0) void supabase.storage.from("forenx-evidence-media").remove(paths);
    }

    setEvidence((items) => items.filter((item) => item.id !== id));
    if (activeEvidence.id === id) setActiveEvidence(emptyEvidence);
    setMessage(`Draft ${id} deleted.`);
  }, [activeEvidence.id, authMode, evidence, role]);

  const resetDemo = useCallback(() => {
    setIsAuthenticated(false);
    setAuthReady(true);
    setSessionUser(null);
    setAuthMode("Supabase");
    setUsers([]);
    setAccessRequests([]);
    setSupportRequests([]);
    setRole("Investigator");
    setEvidence([]);
    setActiveEvidence(emptyEvidence);
    setBarcodeBatches([]);
    setCustodyEvents([]);
    setMessage("Local session state cleared.");
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
      evidenceLoading,
      activeEvidence,
      barcodeBatches,
      custodyEvents,
      message,
      messageVersion,
      dismissedMessageVersion,
      backendMode: supabaseReady ? "Connected" : "Configuration required",
      signInWithPassword,
      signUpForAccess,
      signOut,
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
      closeEvidence,
      selectEvidence,
      deleteDraftEvidence,
      dismissMessage,
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
      evidenceLoading,
      generateBarcodeBatch,
      isAuthenticated,
      authReady,
      authMode,
      loadAccessRequests,
      loadCustodyHistory,
      loadSupportRequests,
      loadUserDirectory,
      message,
      messageVersion,
      dismissedMessageVersion,
      deleteDraftEvidence,
      receiveEvidence,
      closeEvidence,
      rejectAccessRequest,
      resolveSupportRequest,
      resetDemo,
      resetPassword,
      refreshSession,
      role,
      saveEvidenceForm,
      selectEvidence,
      dismissMessage,
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

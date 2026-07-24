export type Role = "System Admin" | "Investigator" | "Laboratory Analyst";

export type AppView =
  | "login"
  | "dashboard"
  | "admin-users"
  | "admin-barcodes"
  | "scan"
  | "capture"
  | "evidence"
  | "transfer"
  | "lab"
  | "history"
  | "settings";

export type UserStatus = "Active" | "Inactive";

export type EvidenceStatus = "Draft" | "Logged" | "In Transit" | "In Lab Custody" | "Closed";

export type CaptureStatus = "Not Started" | "Captured";

export type User = {
  id: string;
  name: string;
  role: Role;
  badgeId: string;
  agency: string;
  email: string;
  status: UserStatus;
  lastActiveAt?: string | null;
  inactiveSince?: string | null;
};

export type BarcodeBatch = {
  id: string;
  createdBy: string;
  quantity: number;
  barcodePrefix: string;
  createdAt: string;
  barcodes: string[];
};

export type AccessRequestStatus = "Pending" | "Approved" | "Rejected";

export type AccessRequest = {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  requestedRole: Extract<Role, "Investigator" | "Laboratory Analyst">;
  badgeId: string;
  agency: string;
  status: AccessRequestStatus;
  createdAt: string;
};

export type SupportRequestStatus = "Open" | "Resolved";

export type SupportRequest = {
  id: string;
  fullName: string;
  email: string;
  requestType: "Reactivation request" | "Sign-in issue" | "Other report";
  message: string;
  status: SupportRequestStatus;
  createdAt: string;
  resolvedAt?: string | null;
};

export type Evidence = {
  id: string;
  barcode: string;
  caseNumber: string;
  offenseType: string;
  itemCategory: string;
  itemDescription: string;
  recoveryDateTime: string;
  gpsCoordinates: string;
  locationDetails: string;
  recoveredBy: string;
  investigatorSignature: string;
  labSignature: string;
  photoCaptures: string[];
  threeDCaptureRequested: boolean;
  spatialCaptureStatus: CaptureStatus;
  spatialCapturePreview: string;
  status: EvidenceStatus;
  destinationLab: string;
};

export type CustodyEvent = {
  id: string;
  evidenceId: string;
  action: string;
  fromUser: string;
  toUser: string;
  role: Role;
  timestamp: string;
  location: string;
  signatureImage: string;
  status: EvidenceStatus;
};

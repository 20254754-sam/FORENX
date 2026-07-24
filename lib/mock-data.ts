import type { BarcodeBatch, CustodyEvent, Evidence, User } from "./types";

export const users: User[] = [
  {
    id: "USR-001",
    name: "Admin Jerah Gano",
    role: "System Admin",
    badgeId: "ADM-0088",
    agency: "Evidence Control Office",
    email: "jerah.gano@forenx.com",
    status: "Active"
  },
  {
    id: "USR-002",
    name: "Ofc. Hailey Neo Fernando",
    role: "Investigator",
    badgeId: "INV-1042",
    agency: "Local Precinct One",
    email: "hailey.fernando@forenx.com",
    status: "Active"
  },
  {
    id: "USR-003",
    name: "Lab Analyst Danica France",
    role: "Laboratory Analyst",
    badgeId: "LAB-0214",
    agency: "Forensic Lab",
    email: "random.user@forenx.com",
    status: "Active"
  }
];

export const barcodeBatches: BarcodeBatch[] = [
  {
    id: "BAT-2026-001",
    createdBy: "Admin Maria Santos",
    quantity: 6,
    barcodePrefix: "FX",
    createdAt: "July 24, 2026 08:30 AM",
    barcodes: ["FX-000101", "FX-000102", "FX-000103", "FX-000104", "FX-000105", "FX-000106"]
  }
];

export const evidenceRecords: Evidence[] = [
  {
    id: "EV-2026-0001",
    barcode: "FX-000101",
    caseNumber: "CASE-2026-071",
    offenseType: "Robbery",
    itemCategory: "Weapon",
    itemDescription: "Black pistol, 9mm caliber, serial ABC123456",
    recoveryDateTime: "July 24, 2026 09:15 AM",
    gpsCoordinates: "14.5697 N, 120.9842 E",
    locationDetails: "Living room floor, 2 feet from sofa",
    recoveredBy: "Ofc. Juan Dela Cruz",
    investigatorSignature: "Juan Dela Cruz",
    labSignature: "",
    photoCaptures: [],
    threeDCaptureRequested: false,
    spatialCaptureStatus: "Captured",
    spatialCapturePreview: "Scene scale preview stored",
    status: "In Transit",
    destinationLab: "Forensic Lab - Ballistics Dept"
  },
  {
    id: "EV-2026-0002",
    barcode: "FX-000102",
    caseNumber: "CASE-2026-072",
    offenseType: "Narcotics",
    itemCategory: "Biological",
    itemDescription: "Sealed sample bag with visible powder residue",
    recoveryDateTime: "July 24, 2026 10:05 AM",
    gpsCoordinates: "14.5730 N, 120.9825 E",
    locationDetails: "Vehicle rear seat compartment",
    recoveredBy: "Ofc. Juan Dela Cruz",
    investigatorSignature: "Juan Dela Cruz",
    labSignature: "Carla Reyes",
    photoCaptures: [],
    threeDCaptureRequested: false,
    spatialCaptureStatus: "Captured",
    spatialCapturePreview: "Bag condition preview stored",
    status: "In Lab Custody",
    destinationLab: "Forensic Lab - Chemistry Dept"
  }
];

export const custodyEvents: CustodyEvent[] = [
  {
    id: "CST-001",
    evidenceId: "EV-2026-0001",
    action: "Evidence collected",
    fromUser: "Crime scene",
    toUser: "Ofc. Juan Dela Cruz",
    role: "Investigator",
    timestamp: "July 24, 2026 09:15 AM",
    location: "Incident location",
    signatureImage: "Juan Dela Cruz",
    status: "Logged"
  },
  {
    id: "CST-002",
    evidenceId: "EV-2026-0001",
    action: "Transfer started",
    fromUser: "Ofc. Juan Dela Cruz",
    toUser: "Forensic Lab - Ballistics Dept",
    role: "Investigator",
    timestamp: "July 24, 2026 09:45 AM",
    location: "Local Precinct One",
    signatureImage: "Juan Dela Cruz",
    status: "In Transit"
  },
  {
    id: "CST-003",
    evidenceId: "EV-2026-0002",
    action: "Lab custody accepted",
    fromUser: "Ofc. Juan Dela Cruz",
    toUser: "Lab Analyst Carla Reyes",
    role: "Laboratory Analyst",
    timestamp: "July 24, 2026 10:50 AM",
    location: "Forensic Lab",
    signatureImage: "Carla Reyes",
    status: "In Lab Custody"
  }
];

export const emptyEvidence: Evidence = {
  id: "EV-DRAFT",
  barcode: "",
  caseNumber: "",
  offenseType: "Robbery",
  itemCategory: "Weapon",
  itemDescription: "",
  recoveryDateTime: "",
  gpsCoordinates: "",
  locationDetails: "",
  recoveredBy: "Ofc. Juan Dela Cruz",
  investigatorSignature: "",
  labSignature: "",
  photoCaptures: [],
  threeDCaptureRequested: false,
  spatialCaptureStatus: "Not Started",
  spatialCapturePreview: "No 2D evidence photos captured",
  status: "Draft",
  destinationLab: "Forensic Lab - Ballistics Dept"
};

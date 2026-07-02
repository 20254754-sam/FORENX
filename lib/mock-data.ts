export type AppView =
  | "login"
  | "dashboard"
  | "scan"
  | "evidence"
  | "history"
  | "settings";

export type Evidence = {
  id: string;
  barcode: string;
  type: string;
  category: string;
  subtype: string;
  serialNumber: string;
  description: string;
  collector: string;
  dateTime: string;
  gpsLocation: string;
  status: string;
};

export type CustodyEvent = {
  evidenceId: string;
  action: string;
  fromUser: string;
  toUser: string;
  timestamp: string;
  location: string;
  signatureName: string;
};

export type User = {
  name: string;
  role: "Investigator" | "Admin";
  badgeId: string;
  agency: string;
  email: string;
};

export const currentUser: User = {
  name: "Ofc. Juan Dela Cruz",
  role: "Investigator",
  badgeId: "INV-1042",
  agency: "Modern Law Enforcement Unit",
  email: "juan.delacruz@forenx.local"
};

export const adminUser: User = {
  name: "Admin Maria Santos",
  role: "Admin",
  badgeId: "ADM-0088",
  agency: "Evidence Control Office",
  email: "maria.santos@forenx.local"
};

export const evidenceRecord: Evidence = {
  id: "EV-2024-0001",
  barcode: "EV20240001",
  type: "Weapon",
  category: "Firearms",
  subtype: "Pistol",
  serialNumber: "ABC123456",
  description: "Black pistol, 9mm caliber",
  collector: "Ofc. Juan Dela Cruz",
  dateTime: "May 15, 2024 10:30 AM",
  gpsLocation: "14.5697 N, 120.9842 E",
  status: "Transfer complete"
};

export const recentEvidence: Evidence[] = [
  evidenceRecord,
  {
    id: "EV-2024-0002",
    barcode: "EV20240002",
    type: "Document",
    category: "Financial Record",
    subtype: "Receipt",
    serialNumber: "DOC-7741",
    description: "Transaction receipt from secured evidence bag",
    collector: "Ofc. Lara Reyes",
    dateTime: "May 15, 2024 11:05 AM",
    gpsLocation: "14.5730 N, 120.9825 E",
    status: "In review"
  },
  {
    id: "EV-2024-0003",
    barcode: "EV20240003",
    type: "Trace",
    category: "Fiber",
    subtype: "Textile",
    serialNumber: "TRC-1139",
    description: "Blue fiber sample from vehicle seat",
    collector: "Sgt. Carlo Lim",
    dateTime: "May 15, 2024 12:40 PM",
    gpsLocation: "14.5660 N, 120.9901 E",
    status: "Lab intake"
  }
];

export const custodyEvents: CustodyEvent[] = [
  {
    evidenceId: "EV-2024-0001",
    action: "Collected by",
    fromUser: "Scene",
    toUser: "Ofc. Juan Dela Cruz",
    timestamp: "May 15, 2024 10:30 AM",
    location: "Incident location",
    signatureName: "Juan Dela Cruz"
  },
  {
    evidenceId: "EV-2024-0001",
    action: "Received by",
    fromUser: "Ofc. Juan Dela Cruz",
    toUser: "Sgt. Maria Santos",
    timestamp: "May 15, 2024 11:15 AM",
    location: "Evidence control",
    signatureName: "Maria Santos"
  },
  {
    evidenceId: "EV-2024-0001",
    action: "Transferred to lab",
    fromUser: "Sgt. Maria Santos",
    toUser: "Crime Lab Technician",
    timestamp: "May 15, 2024 01:45 PM",
    location: "Crime laboratory",
    signatureName: "Lab Intake"
  }
];

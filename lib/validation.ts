import { z } from "zod";

const cleanText = (max: number) => z.string().trim().min(1).max(max);

export const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});

export const accessRequestSchema = z.object({
  fullName: cleanText(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  requestedRole: z.enum(["Investigator", "Laboratory Analyst"]),
  badgeId: cleanText(64).regex(/^[A-Za-z0-9-]+$/),
  agency: cleanText(160)
});

export const supportRequestSchema = z.object({
  fullName: cleanText(120),
  email: z.string().trim().email().max(254),
  requestType: z.enum(["Reactivation request", "Sign-in issue", "Other report"]),
  message: cleanText(2000)
});

export const barcodeSchema = z.string().trim().toUpperCase().regex(/^FX-\d{6}$/);

export const barcodeQuantitySchema = z.number().int().min(1).max(48);

export const evidenceFormSchema = z.object({
  barcode: barcodeSchema,
  caseNumber: cleanText(80),
  offenseType: cleanText(80),
  itemCategory: cleanText(80),
  itemDescription: cleanText(2000),
  recoveryDateTime: cleanText(80),
  gpsCoordinates: cleanText(120),
  locationDetails: cleanText(500)
});

export const signatureDataSchema = z.string().max(2_000_000).refine(
  (value) => value === "" || value.startsWith("data:image/png;base64,"),
  "Signature format is invalid."
);

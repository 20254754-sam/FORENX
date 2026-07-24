# FORENX Evidence Tracking

FORENX is a barcode-based evidence tracking website pilot. The current build supports a three-role workflow:

- System Admin: user records, barcode batches, audit review.
- Investigator: barcode assignment, scene capture, evidence form, collection signature, transfer.
- Laboratory Analyst: barcode verification, record review, custody acceptance.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/login`.

## Pilot workflow

1. Sign in through the demo role selector.
2. System Admin generates an approved barcode batch.
3. Investigator starts a draft and assigns an unused barcode.
4. Investigator saves spatial capture, completes the evidence form, and saves a collection signature.
5. Investigator selects a laboratory and signs the transfer.
6. Laboratory Analyst selects an incoming record, scans or enters its barcode, and saves an acceptance signature.
7. Review custody events in History.

The website blocks skipped collection steps, duplicate barcodes, invalid barcode format, unsigned evidence forms, unsigned transfers, and laboratory acceptance outside In Transit status.

## Barcode scanning

- Admin barcode batches render as real Code 128 labels with the `FX-######` value encoded in each label.
- `/scan` opens the device camera and reads Code 128 or QR labels through ZXing browser decoding.
- Test camera scanning through `localhost` or a deployed HTTPS URL, then allow camera access in the browser.
- Use labels generated from `/admin/barcodes`. Manual entry stays available when a camera is unavailable.

## Environment variables

Create `.env.local` from `.env.example`.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` takes priority when both keys exist. Never add the Supabase service-role key to browser code or Vercel public variables.

## Supabase setup

Use a new Supabase project for a production pilot.

1. Open the Supabase SQL Editor.
2. Run [production-schema.sql](./supabase/production-schema.sql).
3. Create the first Auth user.
4. Add a matching row in `public.profiles` with role `System Admin`.
5. Create private Storage buckets named `forenx-signatures` and `forenx-evidence-media`.
6. Add Storage policies before enabling uploads.
7. Add your Vercel URL to Supabase Auth redirect URLs.

The existing `supabase/schema.sql` file belongs to the earlier demo database model. Use `production-schema.sql` for a fresh production-pilot database.

For the existing demo project, run [migrate-demo-to-pilot.sql](./supabase/migrate-demo-to-pilot.sql) first. Then run `production-schema.sql`.

For self-service Investigator and Laboratory Analyst signup, run [add-pending-access.sql](./supabase/add-pending-access.sql) after the production-pilot schema.

Run the latest [add-pending-access.sql](./supabase/add-pending-access.sql) again after pulling account-management updates. The script adds account activation controls, last-activity tracking, inactive-duration fields, and the login support queue.

Run the same updated script after pulling shared-history updates. It creates the shared custody event feed used by every secure role in `/history`.

## Account support

The login screen includes a System Admin support form for reactivation requests, sign-in issues, and other access reports. System Admin sees each report in `/admin/users` and marks resolved reports after review.

The user directory tracks:

- Last activity from active sessions.
- Inactive duration after deactivation.
- Active or inactive account state.

## PWA support

The production build registers a service worker and web manifest. This supports app installation and cached page access. A full offline sync queue, IndexedDB records, and conflict handling still need backend work before field deployment.

## Release checklist

1. Run `npm run lint`.
2. Run `npm run build`.
3. Test each role through a fresh browser session.
4. Test barcode format, duplicate barcode, incomplete form, missing signature, and barcode mismatch states.
5. Test desktop and phone layouts.
6. Set Vercel environment variables.
7. Deploy a Vercel preview.
8. Test Supabase Auth, database rules, and Storage access from the preview URL.
9. Review audit events with the project team.
10. Publish after pilot approval.

## Pilot limits

This build is a school or controlled pilot. Real evidence handling needs legal review, agency security approval, retention rules, offline-sync testing, backup procedures, monitoring, and incident response before operational use.

# CareOrbit

A responsive, role-aware healthcare appointment and patient portal built from the supplied PRD. The web client is connected to Firebase Authentication, Firestore, Storage, and Analytics. Clinical collections start empty and are populated only by real application activity; no patient, provider, appointment, document, or message records are preloaded.

## What works now

- Public landing, doctor directory, six-filter patient search, provider profiles, login/register/reset flows.
- Patient overview, three-step booking, appointment list/detail/cancel/reschedule affordances, document upload validation, AI-summary/source view, explicit document grants and revocation, chat, history, notifications, and settings.
- Doctor overview, appointment confirmation/lifecycle controls, calendar, availability editor, authorized patient workspace, version-aware consultation notes, messaging, and profile/verification status.
- Admin metrics/charts, patient/doctor/appointment management, doctor application review, reports, audit log, durable-job views, and clearly gated R2/R3 integrations.
- Responsive layouts for desktop/tablet/mobile, keyboard focus, reduced-motion support, semantic status text, empty/error/confirmation states, and synthetic data only.
- Demo mutations persist in local storage. Use the role selector in the header to inspect each role.

## Run locally

```powershell
npm install --ignore-scripts
node .\node_modules\vite\bin\vite.js
```

Open `http://localhost:5173`. The direct Node command avoids a Windows `cmd.exe` parsing issue caused by the parent directory containing `&`.

Production verification:

```powershell
node .\node_modules\typescript\bin\tsc -b
node .\node_modules\vite\bin\vite.js build
npm audit
```

## Firebase handoff

Firebase activation checklist:

1. Firebase client values are configured in the ignored `.env.local`; never place privileged Admin SDK credentials in `VITE_*` variables.
2. In Firebase Console, enable Email/Password and Google under Authentication → Sign-in method, and add every deployed hostname under Authorized domains.`n3. Create Firestore and Storage in the intended production region, then deploy `firebase.rules` and `storage.rules` with the Firebase CLI.`n4. Provision admin users through trusted server code/custom claims; the public application intentionally cannot create admins.`n5. Add Cloud Functions, App Check, and the Emulator Suite before enabling clinical writes.
3. Implement `CareOrbitRepository` in `src/services/repository.ts`; keep Firebase SDK objects out of components.
4. Set `role`, `status`, and doctor-verification custom claims only from privileged server code.
5. Deploy the fail-closed `firebase.rules` and `storage.rules`, then replace denied writes with callable/HTTP functions that validate input, ownership, resource relationships, state transitions, and audit reasons.
6. Enforce booking conflicts transactionally in a Cloud Function. A client-side availability check is not sufficient. Use deterministic slot locks/idempotency documents because Firestore has no PostgreSQL exclusion constraint.
7. Use server-mediated, short-lived file access. Validate MIME signatures, size/page limits, malware scan state, quarantine state, grant expiry, and revocation before every read.
8. Run AI extraction in a trusted worker/function. Treat document text and model output as untrusted, remove identifiers not required for the task, validate structured output, and require versioned consent.

The checked-in rules are a secure scaffold, not a complete production policy. They intentionally deny appointment/document/message writes until trusted Cloud Functions exist.

## Production decisions still required

The PRD intentionally leaves jurisdiction, retention/deletion, clinical approval, cancellation policy, AI/storage providers, payment/video/reminder vendors, prescription legality, and provider contracts for product-owner approval. The UI uses the proposed Lahore/PKR/Asia-Karachi defaults and labels non-core integrations as unavailable.

Do not use this demo with real patient data. It is not a certified medical device, clinical system, or emergency service.

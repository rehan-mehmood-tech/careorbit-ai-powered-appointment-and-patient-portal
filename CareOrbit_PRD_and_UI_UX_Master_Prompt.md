# CareOrbit Product Requirements Document

Version 1.0 | 8 October 2026 | Product owner: Rehan Mehmood

## 1. Product definition

CareOrbit is a responsive AI-powered healthcare appointment and patient portal. Patients discover doctors, reserve appointments, share medical documents, read informational AI summaries, communicate with their providers, and follow their care history. Doctors manage availability, appointments, authorized patient records, messages, and consultation notes. Administrators manage provider verification, users, operations, and aggregate reporting.

AI assists discovery, document comprehension, and administrative work. It does not diagnose, prescribe, replace a doctor, or autonomously make clinical decisions. The supplied concept is the source of scope. Requirements added below make its workflows implementable; numeric limits and operational policies are proposed defaults requiring product-owner sign-off before a real clinical launch.

## 2. Goals and product boundaries

- Reduce friction between finding a suitable doctor and booking a valid slot.
- Give patients one place for appointments, documents, messages, and reminders.
- Give doctors an organized consultation workspace with explicitly authorized records.
- Demonstrate React, Express, PostgreSQL, secure scheduling, RBAC, real-time messaging, file processing, AI integration, and dashboards.
- Support phones, tablets, and desktops, including keyboard and assistive-technology use.

The initial product assumes one platform operating across multiple doctors and clinic locations, adult self-managed patient accounts, and one configurable market/currency. Dependent accounts, enterprise tenant isolation, insurance claims, hospital EHR synchronization, inpatient workflows, emergency triage, and autonomous diagnosis are outside the initial scope. No jurisdictional compliance certification is claimed by this PRD. Before live patient use, decide operating jurisdiction, consent rules, retention policy, provider agreements, and third-party data processing arrangements.

## 3. Personas and permissions

| Role | Primary tasks | Access boundary |
|---|---|---|
| Visitor | Discover verified doctors; view public profiles | No private patient data or booking until authenticated |
| Patient | Book, manage records, request summaries, chat, manage preferences | Own records and conversations only |
| Doctor | Manage own schedule; consult; write notes; view shared records | Own appointments and explicit patient grants; no platform-wide patient browsing |
| Admin | Verify doctors; manage users; operate platform; view aggregate analytics | Operational metadata by default; no routine medical-content access |

Public registration may create a patient or an unverified doctor applicant. It must never create an administrator. Doctor verification is required before discovery, booking, or clinical workspace access. Admin accounts are provisioned through a controlled operator process. Every API and Socket.IO event must enforce role plus resource ownership or relationship checks on the server. Hiding a menu is insufficient authorization.

Any exceptional support access to medical content requires a separately authorized, time-limited, reason-recorded process with audit logging; leave it disabled in the portfolio MVP. Account suspension blocks new sessions and new clinical actions while preserving required historical records.

## 4. Scope and release plan

| Release | Included capabilities | Exit requirement |
|---|---|---|
| R1 Core portal | Auth; all doctor filters; booking/cancellation/rescheduling; patient, doctor and admin dashboards; documents; AI summaries; consultation notes; chat and attachments; in-app reminders; history; responsive UI | Core acceptance tests and security checks pass |
| R2 Assisted operations | AI appointment assistant; email/SMS reminders; calendar sync; deeper analytics; admin assistant; PWA | Each external integration has tested permission, failure, and retry paths |
| R3 Extended care | Payments/refunds; video consultations; digital prescriptions | Provider integration, policies, and clinical permissions approved and tested |

All bonus features remain in the complete product scope. Phasing controls delivery order rather than removing requirements. Avoid presenting R2/R3 features as operational in an R1 build; show clear availability labels only where useful.

## 5. Core journeys

**Patient:** Register → verify account → complete profile → discover doctor → inspect profile and clinic → choose date and slot → review fee, timezone, cancellation policy and reason → confirm booking → receive confirmation → upload and optionally share documents → request optional AI summary → consultation/chat → completed visit and history.

**Doctor:** Apply → admin verification → configure clinic, fee and availability → view today's appointments → confirm or decline requests → open authorized patient workspace → read shared documents → consult → save draft/final notes → complete visit → follow up through allowed messages.

**Admin:** Sign in → inspect operational metrics → review doctor application → approve/reject with reason → manage users and appointments → inspect failures and audit events → manage specialties, platform settings and reports.

**Recovery journeys:** Expired login preserves a safe return destination; unavailable slots trigger refreshed alternatives; failed uploads and AI jobs offer retry; offline chat preserves an unsent draft; cancelled visits invalidate reminders and integration events.

## 6. Functional requirements and acceptance criteria

### AUTH User accounts

Support patient and doctor registration, login/logout, email verification, forgotten-password reset, profile editing, password change, and session revocation. Use JWT-based authentication and bcrypt password hashing. Prefer short-lived access credentials with rotating refresh sessions in secure HttpOnly cookies; choose and document the final transport consistently. Cookie-based requests require CSRF protection. Rate-limit login, registration, reset, and verification attempts. Password reset must not reveal whether an email exists.

Patient profile: name, contact details, date of birth, timezone, optional demographic information, allergies, relevant history, and communication preferences. Doctor profile: name, photo, specialty, qualifications, experience, languages, registration/license details, biography, clinic location(s), fee/currency, consultation modes, and verification status. Clearly separate public fields from private account information. Collect only necessary data.

Acceptance: duplicate normalized emails are rejected; invalid or expired credentials fail; reset links are single-use and expire; a patient cannot become an admin through request tampering; suspension and logout invalidate the relevant sessions; unauthorized record requests return no record content.

### DISC Doctor discovery

Provide search plus filters for specialization, location, availability, fee, experience, and language. Combine filters and support sorting by earliest availability, fee, and experience. Show active filters, clear-all, result count, pagination, loading, errors, and no-results recovery. Availability filtering must use actual reservable slots, not a doctor's general opening hours.

Doctor cards show photo, name, verified badge, specialty, experience, languages, clinic/location, consultation fee/currency, next available slot, and view-profile/book actions. Profiles show qualifications, clinic details, availability calendar, modes, policy, and booking CTA. Ratings/reviews are not assumed unless added as a separate validated requirement.

Acceptance: “Cardiologists available this Saturday” resolves specialization plus an exact date in the patient's selected timezone; ambiguous dates/location trigger clarification in the AI assistant. Search excludes unverified/suspended doctors and supports paginated results without exposing private provider details.

### SCHED Availability and scheduling

Doctors configure weekly working windows per location/mode, appointment duration, buffers, booking horizon, minimum notice, breaks, leave, and date-specific overrides. The server generates/validates slots from these rules. Store instants in UTC and retain the relevant IANA timezone for display and scheduling rules. Always label the displayed timezone. Handle daylight-saving changes, midnight boundaries, and provider/patient timezone differences.

Prevent overlapping active appointments across all locations/modes for one doctor. Prevent a patient booking overlapping visits by default. Changes to availability must identify existing appointments affected and require an explicit resolution; do not silently cancel them.

Acceptance: simultaneous requests for the same slot yield exactly one successful appointment; overlapping durations are rejected even if start times differ; a time-off override removes unbooked availability without deleting booked history.

### APPT Appointment lifecycle

Capture doctor, patient, clinic/mode, start/end time, timezone, fee/currency snapshot, visit reason, optional shared document IDs, status, and policy snapshot. Review details before final confirmation. Use server validation and an idempotency key on booking requests. Recheck availability and price at submission.

| State | Permitted next states | Responsible actor |
|---|---|---|
| Scheduled | Confirmed, Cancelled, Declined | Doctor confirms/declines; patient or authorized operator cancels |
| Confirmed | Completed, Cancelled, No show | Doctor completes or marks no show; eligible actor cancels |
| Completed | None through routine UI | Corrections use audited procedures |
| Cancelled / Declined / No show | None through routine UI | New booking required |

Default: submitted bookings reserve capacity in Scheduled state and await doctor confirmation. Clinics may opt into automatic confirmation as an explicit setting. Define a configurable confirmation deadline and release stale requests with a recorded reason and notifications. No show may be marked only after the configured appointment grace period. A doctor's decline releases the slot and notifies the patient.

Cancellation records actor, reason, time and policy outcome. Proposed default patient cancellation/rescheduling cutoff: 2 hours before the appointment; authorized staff exceptions require a reason. Rescheduling atomically reserves the replacement and releases the old slot, with linked history and a rescheduled event rather than losing the original record. If the replacement fails, the original booking remains valid. Future reminders are updated; confirmations are sent to both parties.

Acceptance: fee snapshots do not change when a doctor changes pricing; refresh/double-click does not duplicate bookings; completed visits cannot be casually rescheduled; dates, cancellation and rescheduling outcomes are visible in appointment history.

### PAT Patient dashboard and history

Show next appointment, upcoming and previous visits, recently visited doctors, documents and processing states, unread conversations, reminders, and quick actions. Provide appointment list/calendar views, status/date/doctor filters, visit detail pages, and event history. The doctor list means previously consulted/booked doctors, not an undocumented favorites feature.

Acceptance: dashboard counts match the authenticated patient's records; past visits remain accessible according to retention policy; empty states guide a new user to search/book/upload; mobile access includes every key action.

### DOC Doctor dashboard and consultation workspace

Show today's schedule, pending confirmations, upcoming appointments, patient details, shared history, authorized uploaded documents, messages, and consultation notes. Include week/day calendar, availability management, and profile settings.

Patient history shown to a doctor includes their own encounters and any additional records explicitly shared by the patient. Merely booking one appointment must not expose all historical documents. Notes support draft/final states, author and timestamps. Final notes are versioned with amendments rather than silently overwritten. Separate provider-private notes from patient-visible encounter summaries. Completing a visit and finalizing a note are distinct actions.

Acceptance: doctor A cannot view doctor B's unshared encounters; drafts remain private; patient-visible summaries are deliberately published; completion creates a history event and updates analytics.

### FILE Medical document management

Accept PDF, JPG/JPEG and PNG. Proposed limit: 20 MB/file and 50 pages/PDF; expose limits before upload and enforce them server-side. Validate signatures/MIME and extension, sanitize filenames, scan for malware, reject executable/polyglot content, and quarantine until approved. Reject encrypted or unreadable PDFs with a clear message. Support progress, cancel/retry, preview/download, rename/display title, document type/date, optional appointment association, sharing controls, and delete/retention status.

Use private object storage with non-guessable keys. Issue short-lived signed reads only after authorization. Files must never be public merely because their URL is known. Cloudinary is acceptable only when its selected configuration supports the required private access; S3 is the preferred proposed option. Chat attachments use the same secure pipeline and are not automatically sent to AI.

Document access grants specify patient, doctor, resource scope, purpose, expiry if applicable, and revocation timestamp. Revocation blocks future reads and signed-link issuance; already issued URLs have a short expiry. Explain that revocation cannot retract a copy legitimately downloaded earlier. Patient deletion triggers a retention-aware workflow, not unconditional deletion of clinical history. Define backups and AI-derived summary treatment in the retention policy.

Acceptance: arbitrary object IDs and expired URLs fail; disallowed or oversized uploads fail before processing; malware remains quarantined; revoked sharing blocks future provider access; processing errors do not lose the original approved file.

### AI1 Medical document summarization

Pipeline: upload approved → obtain specific AI-processing consent → extract text/OCR scanned PDFs/images → validate extraction quality → queue processing → call AI service → schema-validate result → store summary with model/prompt version → display alongside source. States: not requested, queued, extracting, processing, completed, needs review, failed. Low-quality extraction must fail safely or show a clear limitation rather than invent missing information.

Output includes document type, key information, extracted measurements with units, source-provided reference ranges, source-linked abnormal flags, follow-up explicitly stated in the source, limitations, and “For informational purposes only. Discuss this summary with your doctor.” Reference links should identify page/section or the extracted source span where possible. Show missing fields as “Not found in this document.” Preserve original values and dates.

Abnormal flags are derived only from source labels or the document's stated ranges, without applying invented diagnostic thresholds. Follow-up must distinguish source recommendations from general advice to discuss with a clinician. Do not invent diagnoses, medication changes or urgency classifications. A doctor can mark reviewed and annotate; this never implies that every AI summary is clinically validated.

Treat document text as untrusted input: it cannot override system instructions or trigger tools. Do not send unnecessary identifiers to the LLM. Disclose provider processing and retention arrangements before consent. Track consent/version and allow withdrawal for future processing. Provider selection must satisfy actual patient-data requirements; a free-tier key alone is not sufficient approval for live data.

Acceptance: missing/unclear values remain missing/unclear; corrupted OCR is flagged; unsupported clinical statements fail evaluation; outages produce retryable errors; repeated requests are deduplicated or versioned; source remains available; raw medical content is absent from routine application logs.

### CHAT Doctor patient messaging

Provide text, protected file sharing, delivery/read status, unread badges, notifications and persistent history using Socket.IO. Default conversation eligibility requires a confirmed or completed appointment between that patient and doctor. Cancellation before consultation removes new-send eligibility unless a clinic policy explicitly permits follow-up. Show the messaging policy and expected response time; chat is not emergency care.

Persist a message before acknowledging it; use a client-generated idempotency ID to suppress duplicate sends. Reconnection retrieves missed messages from the database with cursor pagination. Authenticate sockets and authorize each room, attachment and event. Revalidate access after suspension or revocation. Escape message content and throttle abuse. Show pending, sent, delivered, read and failed states accurately.

Acceptance: another patient cannot join a guessed room; reconnect does not duplicate messages; read status reflects actual recipient activity; failed sends preserve drafts; notification previews hide sensitive content by default.

### NOTIF Appointment reminders and notifications

R1 includes in-app notifications for booking, confirmation, decline, cancellation, reschedule, reminders, unread messages and document/summary completion. Proposed reminder schedule: 24 hours and 1 hour before a confirmed appointment; if already within a window, send only the remaining applicable reminder. Never send stale cancelled/rescheduled reminders.

Use a persistent job worker, delivery records, retries with backoff, deduplication, expiry and a failed-job view. Respect channel preferences, opt-in, timezone and configurable quiet hours. Transactional event notices and optional reminder preferences must be distinguishable. Sensitive documents or summary content must not appear in email/SMS/push previews.

Acceptance: restarting a server does not erase queued reminders; the same event/channel/window is not delivered twice; rescheduling invalidates old jobs; provider failures are visible with controlled retry.

### ADMIN Operations and reporting

Manage patients, doctor applications, verification documents, active/suspended accounts, specialties, clinic metadata, appointment issues, notification failures, processing jobs, and system settings. Include searchable/paginated tables, date/status filters and permission-controlled exports. Do not allow admin impersonation or silent changes to medical notes in R1.

Dashboard includes total patients, doctors, appointments, completion rate and popular specializations. Show scope and date range beside each metric. Define whether counts mean active accounts or lifetime registrations. Default completion rate = completed appointments / all appointments in the same selected cohort × 100; display 0% for a zero denominator. The appointment start date selects the cohort, and cancelled/declined/no-show records remain in its denominator. Also offer an explicitly labeled operational rate excluding cancelled/declined visits; do not conflate the formulas.

Popularity is ranked by appointment count per specialization in the selected cohort. Charts show real underlying data; do not copy the reference screenshot's employee attendance chart or “doctor of the month” as undefined healthcare metrics. Suppress or aggregate small sensitive groups for public/shared reports.

Acceptance: dashboard and exports use identical filters and definitions; admins cannot fetch private documents through ordinary management endpoints; verification changes and suspensions are audited with actor/reason/time.

## 7. Bonus capabilities retained in scope

| Capability | Full requirement | Key acceptance condition |
|---|---|---|
| AI appointment assistant | Convert conversational requests into specialty, location, date, language, fee and availability filters; show matching verified doctors and booking options | Uses live availability; asks about ambiguity; explicit user confirmation before booking; no diagnosis |
| AI admin support | Explain aggregate metrics; help draft operational responses; search permitted platform help; offer actions subject to confirmation | Cannot expose patient content or bypass permissions; no autonomous suspension or clinical action |
| Calendar sync | Start with private downloadable ICS; add Google/Outlook OAuth sync, connection/revocation and reschedule/cancel updates | Correct timezone; minimal event title; no medical reason in external calendar; recover from revoked tokens |
| Payments | Provider-hosted checkout, fee/currency display, receipts, pending/paid/failed/refund states, cancellation policy and refunds | Verify signed webhooks; idempotent reconciliation; no card storage; expired reservation cannot create an unallocated paid visit |
| Video consultations | Authorized appointment-linked room, device checks, waiting room, provider join, reconnect and fallback | Only permitted participants; signed short-lived joins; no recording by default; consent required if added |
| SMS and email reminders | Verified destinations, consent/preferences, delivery status and retries | Cancel/reschedule deduplication; failures do not change booking validity |
| PWA | Installable manifest, responsive shell, update notice, limited offline support, optional permissioned push | Never cache private medical records, tokens or chat content by default; clear offline action limits |
| Advanced analytics | Funnel, booking conversion, cancellations, no shows, utilization, doctor/specialty demand, reminder delivery and AI-job outcomes | Date/cohort definitions documented; no private clinical-content analytics by default |
| Digital prescriptions | Verified doctor creates patient/encounter-linked medication, dose, route, frequency, duration and instructions; issues versioned downloadable prescription | Patient cannot author; amendments audited; issuance rules reviewed for operating jurisdiction; AI never prescribes |

Payments introduce a separate reservation hold/payment lifecycle. Proposed hold: 10 minutes, finalized only after verified payment and capacity validation; expiry releases capacity. Define compensating refund/manual reconciliation when payment arrives after expiry. Video and prescription states remain distinct from appointment completion.

## 8. Information architecture and screen inventory

| Area | Required screens |
|---|---|
| Public | Landing; doctor directory; doctor profile; help/contact; privacy/terms; sign in; registration with role selection; verification; forgot/reset password |
| Patient | Overview; doctor search; booking stepper; confirmation; appointment list/calendar; appointment details with cancel/reschedule; documents; upload; document viewer/AI summary/sharing; messages; visit history and encounter detail; notifications; profile/security/preferences |
| Doctor | Overview; pending appointments; day/week calendar; appointment details; patient workspace; shared history/document viewer; consultation notes; messages; availability editor; clinic/profile/fee editor; verification status; settings |
| Admin | Overview; patient management/detail metadata; doctor list/application/verification; appointments; specialties/clinics; reports; audit log; failed notifications/jobs; settings |
| Extended | Appointment assistant; admin assistant; calendar connections; checkout/payment result/receipts/refunds; video device check/waiting room/call; prescriptions; advanced analytics; PWA install/offline/update states |
| System | Access denied; expired session; 404; maintenance; offline; loading; no results; empty accounts; validation/error/success states |

Every feature must have a reachable screen or contextual action. Role-specific menus show only authorized destinations. Desktop dashboard shells use sidebar navigation; mobile uses a drawer or compact role-specific bottom navigation.

## 9. Data model

| Entity | Important fields and relationships |
|---|---|
| users / sessions | ID, normalized email, password hash, role, status, verification; rotating session hashes, expiry and revocation |
| patient_profiles | user FK, contact, timezone, relevant optional medical/profile information |
| doctor_profiles / verifications | user FK, experience, biography, registration, verification status and reviewer; protected verification artifacts |
| specialties / doctor_specialties / languages | Controlled values and doctor mappings; one primary specialty used for unambiguous initial analytics |
| clinics / doctor_clinics | Address, timezone, mode, fee/currency, active flag |
| availability_rules / exceptions | Doctor/clinic, local weekdays/windows, effective dates, duration/buffers, leave/overrides |
| appointments / appointment_events | Participants, clinic/mode, UTC interval, snapshots, status, idempotency key, reschedule links; actor/reason/time event trail |
| documents / access_grants | Owner, object key, MIME/size/hash, clinical date/type, scan/extraction state; recipient, scope, consent, expiry/revocation |
| ai_jobs / summaries / consents | Document FK, job state/retries, input version, model/prompt versions, structured output/source references, reviewed_by; purpose/provider/version consent |
| encounters / notes / note_versions | Appointment FK, author, visibility, draft/final, amendment trail |
| conversations / messages / receipts | Patient-doctor relationship, message body or document reference, client idempotency ID, sent/delivered/read timestamps |
| notifications / jobs / preferences | Recipient, event ID, channel, schedule, retry/status, dedup key and quiet hours |
| audit_events | Actor, action, resource ID, reason, time and minimally necessary metadata; avoid clinical bodies |
| Extended tables | payment attempts/webhook events/refunds; calendar connections/events; video sessions; prescription versions; aggregate analytics |

Use foreign keys, constraints and transactions. An appointment interval exclusion constraint for active states, or equivalent serializable locking, must enforce conflict prevention at database level. Application “check then insert” alone is insufficient. Treat buffer occupancy consistently in the conflict constraint. Index doctor/time/status, patient/time, directory filters, message conversation/time, job schedule/status and grant lookups. Paginate histories and avoid N+1 joins.

## 10. API and real-time contract

REST JSON responses use a consistent data/error envelope, request ID and machine-readable error code. Use pagination, server-side validation, safe rate limits and resource authorization. A booking conflict returns 409 with refreshed alternatives; validation 422; unauthenticated 401; forbidden 403 or privacy-preserving 404; upload too large 413; throttling 429. Never return stack traces or private object keys.

| Module | Proposed public application endpoints |
|---|---|
| Auth | POST /api/auth/register, /login, /logout, /refresh, /verify-email, /forgot-password, /reset-password |
| Profiles | GET/PATCH /api/me; PATCH /api/me/password; GET /api/me/sessions; DELETE /api/me/sessions/:id |
| Discovery | GET /api/doctors; GET /api/doctors/:id; GET /api/doctors/:id/slots; GET /api/specialties |
| Booking | POST/GET /api/appointments; GET /api/appointments/:id; POST /:id/cancel, /:id/reschedule, /:id/confirm, /:id/decline, /:id/complete, /:id/no-show under /api/appointments |
| Doctor | GET /api/doctor/dashboard; GET/PATCH /api/doctor/profile; GET/POST /api/doctor/availability; PATCH/DELETE availability rule by ID; POST /api/doctor/availability/exceptions |
| Documents | POST/GET /api/documents; GET/DELETE /api/documents/:id; POST /:id/download-url, /:id/grants, /:id/summaries; DELETE /api/documents/:id/grants/:grantId; GET /api/summaries/:id |
| Consultation | GET /api/appointments/:id/encounter; POST/PATCH /api/encounters/:id/notes; POST /api/notes/:id/finalize and /amend |
| Messaging | GET /api/conversations; GET/POST /api/conversations/:id/messages; POST /api/conversations/:id/read |
| Notifications | GET /api/notifications; POST /api/notifications/:id/read; GET/PATCH /api/me/notification-preferences |
| Admin | GET /api/admin/dashboard, /patients, /doctors, /appointments, /reports, /audit-events, /jobs; POST doctor verification/account status actions with reason; specialty/clinic/settings CRUD |
| Extended | Assistant sessions/messages; calendar connection/callback/disconnect; payment checkout/webhooks/refunds; video session/join-token; prescriptions/issue/amend endpoints |

Socket events include conversation:join, message:send, message:ack, message:new, message:delivered, message:read, notification:new and access:revoked. Events have versioned payloads, event/message IDs and acknowledgements. Socket acknowledgements do not replace database persistence. FastAPI extraction/summarization/assistant APIs are internal-only, authenticated service-to-service; never expose the AI provider key in React.

## 11. Architecture and technology

Frontend: HTML5, CSS3, JavaScript and React. Backend: Node.js and Express. Database: PostgreSQL. Auth: JWT and bcrypt. AI service: Python, FastAPI, OCR/text extraction and an interchangeable LLM API. Storage: private S3 or suitably configured Cloudinary. Real-time: Socket.IO. Deploy React on Vercel, API/AI/worker on Render or Railway, and use managed PostgreSQL.

React calls Express; Express owns authorization, transactions and orchestration. Authorized files go to private storage through controlled uploads. Durable worker jobs handle scans, extraction, summaries and reminders; a database-backed queue is acceptable initially, with Redis/BullMQ an optional scaling dependency. Express reaches FastAPI over authenticated service calls. Socket.IO runs on a persistent backend, not a short-lived frontend function.

```text
careorbit/
  client/          # routes, role layouts, DoctorCard, Appointment, DocumentUpload, Chat
  server/          # routes, controllers, services, models, middleware, validators
  ai-service/      # FastAPI, summarizer.py, assistant.py, extraction, schemas
  worker/          # notifications, scans, AI jobs, cleanup and retry handlers
  database/        # migrations, constraints, synthetic seeds
  docs/            # PRD, API specification, setup and design system
  README.md
```

Use migrations, environment validation, separate development/staging/production configuration, health checks, CI checks and secret management. Portfolio demos must use synthetic patient records. Document setup, service dependencies, screenshots, demo video, architecture, API, limitations and deployment in README.

## 12. Nonfunctional requirements

- **Security:** TLS; encryption at rest where supported; least privilege; private storage; signed URL expiry; credential rotation; safe CORS; CSRF controls where applicable; input validation; SQL parameterization; XSS-safe rendering; protected internal services; upload scanning; audit trails. Protect against IDOR across API and sockets.
- **Privacy:** Explicit purpose-bound AI sharing; minimal third-party payloads; redacted logs; no third-party session replay on clinical screens; configurable retention/export/deletion procedures; revoke grants promptly; no sensitive analytics events.
- **Accessibility target:** Design for WCAG 2.2 AA, including contrast, labels, keyboard flow, visible focus, semantic controls, accessible calendars, reduced motion and status descriptions beyond color. Validate the implementation rather than claiming certification from design alone.
- **Performance targets:** At agreed test load of 100 concurrent sessions and synthetic data of 10,000 doctors/100,000 appointments, aim for p95 directory/API reads under 1 second and booking under 2 seconds excluding third-party calls; ordinary UI interaction feedback under 200 ms. Benchmark and revise before production sizing.
- **Async AI target:** Display job progress promptly; aim for 90% of supported documents up to 10 pages to finish within 60 seconds under the agreed test workload, subject to provider limits. Longer jobs remain visible and recoverable.
- **Reliability targets:** Proposed production SLO 99.5% monthly availability; durable jobs; bounded retries; backup and restore drills. Proposed RPO 24 hours/RTO 4 hours for initial deployment, subject to hosting capabilities and clinical operational needs.
- **Observability:** Track latency, booking conflicts, failures, queue age, reminder delivery, socket reconnects and AI-job quality/failure without logging document/chat bodies. Alert on processing backlog and repeated failures.
- **Responsive support:** Validate 360 px, 768 px, 1024 px and 1440 px layouts. No essential action depends on hover. Tables offer stacked mobile views or clearly controlled horizontal scrolling.

## 13. Verification and launch gates

| Challenge | Required verification |
|---|---|
| Double booking | Concurrent same-slot and overlapping-interval tests; atomic reschedule rollback |
| RBAC | Patient/doctor/admin matrix; tampered IDs; unverified doctors; forged roles |
| Medical privacy | Document URL expiry; grant revocation; unrelated encounter access denied |
| Scheduling | Timezones, DST, midnight, leave, buffers, deadline expiry and availability edits |
| Secure uploads | MIME mismatch, malware, oversized file, encrypted PDF and extraction failure |
| Real-time messaging | Unauthorized rooms, persistence, duplicate events, reconnect recovery and read receipts |
| Patient access controls | Direct API access, export and attachment paths tested, not just menus |
| AI responsibility | Synthetic reports with missing fields, OCR errors, prompt injection and source-grounding checks |
| Query optimization | Explain plans, representative load and pagination; no N+1 dashboard queries |
| Deployment | Secret exposure checks, restore drill, worker restart, third-party outage and migration rollback plan |

AI evaluation set must include scanned lab reports, radiology text, discharge summaries, prescription scans, unreadable files and deliberately misleading instructions embedded in documents. Record factual extraction errors and unsupported statements; agree release thresholds with a qualified reviewer before real patient use. No critical cross-user exposure or unsupported clinical recommendation is acceptable in launch testing.

Core release gate: all R1 journeys work end to end; explicit authorization tests pass; scheduling is database-enforced; private documents remain private; reminders survive restarts; AI failures remain safe; responsive and accessibility reviews pass; backups restore; operational runbook exists. Extended releases additionally test webhooks, external-calendar failures, video access and prescription issuance.

## 14. Success metrics

Measure directory-to-booking conversion, booking success/conflict rate, time to book, cancellation/no-show/completion rates, reminder delivery rate, summary completion time/failure rate, user-reported summary issues, and chat delivery/reconnect recovery. Use synthetic baseline results for a portfolio demo. Business adoption targets should be set after pilot observation rather than invented in advance.

Learning outcomes and portfolio evidence: working full-stack flows; JWT/RBAC; concurrent scheduling; PostgreSQL schema/constraints; secure uploads; OCR/LLM orchestration; real-time state recovery; operational dashboards; responsive screens; deployment/runbooks. The original “expert-level” positioning is a portfolio aspiration, not proof of production clinical readiness.

## 15. Decisions to confirm before implementation or live rollout

Operating market and currency; confirmation deadline/auto-confirm settings; cancellation cutoff; slot durations/buffers; retention and medical-content deletion rules; chat follow-up window; AI provider and consent terms; verified-doctor requirements; storage/provider contracts; external reminder/calendar/payment/video providers; prescription legal/clinical approval process. Proposed defaults above allow design and synthetic-data development to proceed while these decisions remain explicit.

## 16. Source feature coverage

All supplied requirements are represented: registration/login and three roles (AUTH); specialization/location/fee/availability/experience/language search (DISC); book/cancel/reschedule and Scheduled → Confirmed → Completed (APPT); doctor appointments/patient info/history/docs/notes (DOC); PDF/JPG/PNG private uploads (FILE); extraction, document type, key information, abnormal values, follow-up and disclaimer (AI1); text/files/read status/notifications via Socket.IO (CHAT); reminders (NOTIF); patient overview/history/documents/messages/doctors (PAT); totals/completion rate/popular specialties (ADMIN); responsive styling and any-device access (sections 8 and 12); every bonus feature (section 7); original stack/folder structure (section 11); all ten implementation challenges (section 13); learning outcomes and portfolio presentation (section 14).

---

# CareOrbit UI UX Master Prompt

Copy the following prompt into your design tool and attach the supplied screenshot plus this PRD. If the tool has limited output capacity, generate in batches using the same component library and continue until the complete screen inventory is finished.

```text
Act as a senior healthcare product designer and design-system architect. Design the complete responsive UI/UX for CareOrbit, an AI-powered healthcare appointment and patient portal. Use the attached PRD as the functional source of truth and the attached dashboard screenshot as the visual reference. Produce high-fidelity screens, a reusable design system, all important interaction states, and connected role-specific user flows. Do not stop after a landing page or one dashboard.

PRODUCT
Patients discover verified doctors, book/cancel/reschedule appointments, upload and explicitly share documents, request informational AI summaries, message their doctor and view care history. Doctors manage availability, appointments, permitted patient records, consultation notes and messages. Admins verify doctors, manage operations and view aggregate analytics. Include all extended features in a clearly labeled later-release screen group: AI appointment/admin assistants, calendar sync, payments, video consultations, email/SMS reminders, PWA, advanced analytics and doctor-issued digital prescriptions.

VISUAL REFERENCE
Follow the screenshot's light, calm medical-management dashboard language: slim white left sidebar; compact top bar; pale gray page background; white rounded cards; fine borders; mint/teal primary actions; restrained pastel chart series; small profile avatars; light status badges; clean dense tables; generous space between modules. Translate its visual language to CareOrbit. Do not reproduce the browser chrome, Mediso branding, employee terminology, attendance metrics or unsupported “doctor of the month” feature. Use healthcare data appropriate to the PRD.

Do not add heavy glassmorphism, large gradients, neon effects, dark dashboard backgrounds, dramatic shadows or oversized promotional typography. Patient pages should feel slightly more spacious and guided while sharing the doctor/admin component system.

PROPOSED DESIGN TOKENS
These are deliberate approximations inspired by the screenshot, not exact sampled colors. Adjust after inspecting the reference and checking contrast.
- Canvas #F6F8F9; surface #FFFFFF; subtle surface #F0F5F3; border #E5EBE8.
- Primary teal #269E83 for brand accents; darker #16755F for accessible filled actions with white labels; soft primary #E8F5EF for selections.
- Main text #172B26; secondary #56675F; muted #6B7872.
- Success #16755F with #EAF7EF; warning #8A5B00 with #FFF6DE; error #B83D45 with #FDEDEF; info #286AB2 with #EDF4FC.
- Restrained teal, gold and coral chart colors with direct labels/legend; no color-only meaning.
- Inter or a similarly clear sans serif. Body 14–16 px; table labels 13–14 px; headings 22–28 px; metrics 28–32 px. Avoid copying the reference's tiny screenshot text literally.
- Spacing 4/8/12/16/24/32 px; cards 12–16 px radius; fields/buttons 8–10 px radius; avatars circular; fine 1 px borders; very subtle shadows only where useful.
- Sidebar 224–240 px desktop; header 64–72 px; page padding 24–32 px. Buttons/inputs around 40–44 px with touch targets at least 44 px where needed.
- Simple consistent outlined icons. Use tasteful fictional doctor portraits, never real patient imagery or data.

DESIGN SYSTEM DELIVERABLE
Create semantic color, type, spacing, radius, elevation and breakpoint tokens. Build reusable sidebar/nav, header, breadcrumbs, profile menu, buttons, form fields, selects, date/time pickers, filters, chips, status badges, doctor cards, metric cards, charts, tables, pagination, tabs, file uploader, document viewer, summary panel, consent/sharing panel, chat bubbles, receipts, notification list, dialogs, drawers, stepper, skeletons and toasts. Include default/hover/focus/disabled/loading/error/success states. Use auto-layout, reusable components and variants if supported. Use semantic HTML and reusable React components if the tool generates code.

INFORMATION ARCHITECTURE
Public: Home, Find a Doctor, Doctor Profile, Help, Sign In, Create Account, Verify Email, Forgot/Reset Password, Privacy/Terms.
Patient menu: Overview, Find a Doctor, Appointments, Documents, Messages, History, Notifications, Settings. The AI assistant is a contextual discovery aid, not a diagnostic chatbot.
Doctor menu: Overview, Appointments, Calendar, Availability, Patient Workspace, Messages, Profile/Clinics, Settings. Open patient workspace only from an authorized appointment/relationship; do not add a global patient-record directory.
Admin menu: Overview, Patients, Doctors, Appointments, Specialties/Clinics, Reports, Audit Log, Processing/Delivery Jobs, Settings.
Use role-specific top-bar page title, notifications and avatar. Use global search only if its authorized scope is explicit.

REQUIRED CORE SCREEN SET
1. Public landing page: concise CareOrbit value, doctor search entry, how booking works, patient/provider paths and clear AI limitation. Match the calm dashboard brand.
2. Authentication: patient/doctor signup, login, verification, password recovery/reset, role onboarding and doctor verification pending/rejected states. No public admin signup.
3. Patient overview: next appointment, upcoming/past counts, unread messages, recent documents, reminders and quick actions. New-account empty state.
4. Doctor search: all six filters—specialty, location, availability, fee, experience, language—sort, active chips, result count, doctor cards, pagination and mobile filter drawer. No-results and service-failure states.
5. Doctor profile: identity/verification, specialty, qualifications, experience, languages, clinic/mode, fee/currency, biography, timezone-labeled date/slot selection and booking CTA. Do not invent reviews.
6. Booking flow: doctor/clinic → date/slot → reason and optional document sharing → review fee/timezone/policy → explicit confirmation. Show scheduled vs confirmed, conflict recovery, expired slot and duplicate-submit protection.
7. Appointments: list/calendar tabs, filters, detailed visit timeline, confirm/decline where role permits, cancellation reason/policy, reschedule with original-slot preservation on failure, completed/no-show/declined/cancelled states.
8. Patient documents: card/list view, search/type/date filters, file upload/drop zone with supported types/limits, progress, quarantine, extraction/AI status, retry and protected preview/download.
9. Document detail: source viewer plus AI summary side panel, document type/key information/values/units/source ranges/source abnormal flags/source follow-up, page references, extraction limitations, “Not found” fields, consent request, doctor review indicator and disclaimer. Show sharing recipients, purpose, expiration and revoke control. On mobile use tabs rather than squeezing two columns.
10. Messaging: conversation list, doctor/patient context, text composer, authorized attachment picker, unread badges, pending/sent/delivered/read/failed states, reconnect banner and chat eligibility/response-time notice. Avoid sensitive notification previews.
11. History: chronological visits, filters, encounter detail, deliberately published patient summary and relevant shared documents. Private clinician notes must not appear in the patient view.
12. Notifications/preferences: reminders and appointment/summary/message events, unread/read, opt-in channels, timezone, quiet hours, and secure default previews.
13. Patient settings: profile, password/sessions, contact verification, AI consent/privacy/sharing preferences and data-request workflow.
14. Doctor overview: today's schedule, pending confirmations, upcoming visits, unread messages, operational stats; use compact cards and a clear appointment table inspired by the reference.
15. Doctor calendar/availability: day/week navigation, working windows, breaks, buffers, slot duration, clinic/mode, leave/overrides and existing-booking impact resolution.
16. Doctor patient workspace: appointment context, authorized patient info, permitted history, shared documents, source and AI comparison, consultation-note draft/final/amendment, patient-summary publishing, complete/no-show actions and chat.
17. Doctor profile/clinics/verification: public/private fields, specialty/languages/experience, fee/currency, consultation modes and verification documents/status.
18. Admin overview: total patients/doctors/appointments, completion rate with cohort/date definition, specialty popularity, appointment trends and failure indicators. Use white metric/chart cards and compact tables. Handle zero denominator explicitly.
19. Admin patient/doctor management: metadata-focused lists, search/filters/pagination, application review, protected verification view, approve/reject with reason, suspend/reactivate with confirmation and audit context. No default access to medical document bodies.
20. Admin appointments/reports: statuses/date filters, operational issue detail, aggregate charts, accessible data tables and permissioned export.
21. Admin audit/jobs/settings: actor/action/reason/time, reminder and AI failure queues, retry state, specialties/clinics and platform policy settings.

EXTENDED SCREEN SET
22. AI discovery assistant: conversational filter collection, ambiguity clarification, real available doctor cards, slot suggestion and explicit booking review. Never diagnose or claim guaranteed suitability.
23. Admin assistant: aggregate-data/help questions, source/context explanation, operational draft responses and explicit permissioned action review.
24. Calendar: private ICS download, external provider connection, privacy preview, synced/error/disconnected states and reconnect/revoke.
25. Payments: fee breakdown, hosted-checkout handoff, hold countdown, pending/paid/failed/expired result, receipt, refund status and delayed-webhook reconciliation.
26. Video: device permissions/check, waiting room, appointment authorization, call controls, disconnect/rejoin and fallback. Recording is disabled by default.
27. Prescriptions: doctor-only encounter-linked editor with medication/dose/route/frequency/duration/instructions, issue review, version/amendment and patient read/download. AI cannot prescribe.
28. Advanced analytics: booking funnel, utilization, cancellations/no shows, reminder delivery and AI-job outcomes with date/cohort definitions.
29. PWA: install guidance, offline shell, reconnect and update notice. Private records are not exposed through an offline cache.

UX RULES
- Use fictional consistent appointments, doctors and patients across every screen. Demo market: Lahore, PKR and Asia/Karachi, configurable rather than hardcoded globally. Example: Dr. Ayesha Khan, cardiology, Gulberg clinic; ensure specialties, fees, times and statuses remain consistent. Do not use real identifiers.
- Label currency, appointment mode, location, date/time and timezone on booking and detail screens.
- Distinguish Scheduled, Confirmed, Completed, Cancelled, Declined and No show in words plus badges; do not rely on color.
- AI summaries always show source linkage, limitations and informational disclaimer. Follow-up is source-stated; missing fields stay missing. No invented clinical thresholds or diagnoses.
- Document sharing and AI consent are explicit, separate decisions. A booking never silently shares all records.
- Use confirmation dialogs for cancellation, sharing revocation, suspension and prescription issuance; make consequences and recovery clear.
- Provide skeleton, empty, loading, validation, success, permission-denied, expired-session, network-failure, partial-failure and offline states. Preserve safe form/chat drafts.
- Make mobile workflows fully usable: sidebar → drawer/bottom navigation; card grids stack; filters open in drawer; calendar has list alternative; document/summary becomes tabs; large tables become readable cards or controlled scrolling.
- Design at 1440 px desktop, 768 px tablet and 390 px mobile; validate 360 px minimum. Use keyboard navigation, visible focus, labels, accessible errors, reduced motion and tested text contrast. Tooltips cannot carry essential information alone.
- Avoid fake analytics, implied medical authority, decorative chart clutter, unnecessary patient identifiers and technical implementation details in user flows.

DELIVERY ORDER
First create tokens, component library, navigation map and screen checklist. Then produce public/auth/patient screens, doctor screens, admin screens, extended screens, responsive variants and state variants. Maintain one consistent design system across batches. Connect patient booking/document/chat flows, doctor consultation flow and admin verification flow in a clickable prototype if supported.

At the end, deliver a screen-to-PRD coverage matrix, interaction notes, component/state inventory, responsive rules, accessibility notes and clearly labeled remaining assumptions. If time/tool limits prevent completion, enumerate unfinished screens and continue in subsequent batches; do not claim the whole project is complete from three dashboards.
```

### Suggested batching prompt

“Continue the CareOrbit design using the existing tokens and components. Complete the next unfinished screen group from the master prompt and PRD. Include its mobile layouts, permission boundaries and error/empty/loading states. Update the screen coverage checklist. Preserve previously established navigation, fictional data and visual style.”

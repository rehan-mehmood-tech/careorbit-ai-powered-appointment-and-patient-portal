# CareOrbit Execution Roadmap

Source of truth: `CareOrbit_PRD_and_UI_UX_Master_Prompt.md` v1.0 (Sections 1–16 and the UI/UX master prompt).

## Progress summary

- Total phases: **25** (Phase 0 through Phase 24)
- Completed phases: **8 / 25**
- Completed trackable checkboxes: **166 / 346**
- Current active phase: **Phase 10 — Complete; Phase 9 browser acceptance remains open**
- Current release target: **R1 Core Portal**
- Status rule: a phase is complete only when every implementation, security, test, and acceptance checkbox in that phase is complete. Screens backed only by local React state or static data remain pending.
- Last audited: **27 October 2026**

## Current implementation baseline

- [x] React/Vite application builds successfully and runs on `127.0.0.1:3000`.
- [x] Public, patient, doctor, and admin route shells exist.
- [x] Responsive styling, visible focus treatment, reduced-motion styling, and semantic status labels exist as an initial UI foundation.
- [x] Firebase email/password, Google sign-in, reset request, email-verification request, and role-aware client routing exist as prototype auth.
- [x] Firestore listeners exist for appointments, patient documents, notifications, and verified doctor profiles.
- [x] Firestore and Storage rules are fail-closed for unimplemented clinical writes.
- [x] FastAPI has a working health endpoint and Firebase-token authorization scaffold.
- [x] A Groq/LangGraph bilingual symptom-intake prototype exists with urgent-keyword interception and explicit doctor sharing.
- [x] Synthetic Firebase seed creates patient, doctor, admin, and appointment demo records.
- [x] Root and AI-service environment examples exist, with secrets excluded from version control.
- [x] The current production frontend build passes.
- [ ] Current Firebase/local-state prototypes satisfy the PRD's required Express, PostgreSQL, JWT, Socket.IO, worker, storage, and transactional architecture.
- [ ] Any R1 clinical workflow is complete end to end under server-enforced authorization.

---

## Phase 0 — Product governance, boundaries, and decisions

Objective: freeze the decisions that affect data, consent, scheduling, vendors, and clinical operations before production implementation.

### Product and policy tasks

- [x] Adopt the PRD as the functional source of truth and preserve R1/R2/R3 scope boundaries.
- [x] Use synthetic data only and label the application as non-emergency and non-diagnostic.
- [x] Use Lahore, PKR, and `Asia/Karachi` as configurable demo defaults.
- [ ] Confirm operating jurisdiction and applicable health/privacy obligations.
- [ ] Approve patient consent language, AI consent versioning, and third-party processing disclosures.
- [ ] Approve retention, export, deletion, backup, and AI-derived-data treatment policies.
- [ ] Approve provider agreements and doctor verification evidence requirements.
- [ ] Confirm confirmation deadline, auto-confirm policy, cancellation cutoff, no-show grace period, booking horizon, durations, and buffers.
- [ ] Confirm chat eligibility/follow-up window and emergency escalation wording.
- [ ] Select production PostgreSQL, object storage, malware scanning, OCR, LLM, email/SMS, calendar, payment, and video providers.
- [ ] Review prescription legality, clinical governance, and issuance requirements before R3.
- [ ] Record all decisions as versioned architecture decision records under `docs/decisions/`.

### Security requirements

- [ ] Complete a data-flow diagram and classify account, operational, document, chat, and clinical data.
- [ ] Define least-privilege roles for visitor, patient, verified doctor, admin, service, and worker identities.
- [ ] Keep exceptional support access to medical content disabled unless a time-limited, reason-recorded, audited design is approved.

### Acceptance gate

- [ ] Every unresolved PRD Section 15 decision has an owner, deadline, approved default, and documented production blocker.

---

## Phase 1 — Target architecture and repository foundation

Objective: establish the PRD-prescribed service boundaries and a reproducible local development environment.

### Implementation tasks

- [x] Reorganize the repository into `client/`, `server/`, `ai-service/`, `worker/`, `database/`, and `docs/` without breaking the running client.
- [x] Configure the React/Vite development server on `127.0.0.1:3000`.
- [x] Configure and run FastAPI on `127.0.0.1:8000` with `/health`.
- [x] Provide checked-in `.env.example` templates and ignored local environment files.
- [x] Add schema validation that fails startup when required environment variables are missing or unsafe.
- [x] Scaffold the Node.js/Express TypeScript server with typecheck, test, dev, build, and start scripts.
- [x] Scaffold the persistent worker process with runnable health endpoints and graceful shutdown.
- [ ] Add the shared job-contract package when Phase 14 job contracts are defined.
- [x] Add PostgreSQL and optional Redis/local S3-compatible services through Docker Compose.
- [x] Add `/health/live` and `/health/ready` endpoints for Express, FastAPI, and worker readiness.
- [x] Add root commands to install, build, and start the Phase 1 client/server/AI/worker stack concurrently (migration/relational seed orchestration begins in Phase 2).
- [x] Pin supported Node and Python versions and commit lockfiles for reproducible installs.
- [ ] Move runtime logs and generated caches outside tracked source paths.

### Security requirements

- [x] Keep local secrets and private keys ignored by Git.
- [x] Validate that no API/provider/service-account secret is bundled into the React build.
- [x] Separate client-public variables from server, worker, and AI-service secrets.
- [ ] Add secret scanning to local hooks and CI; rotate any credential exposed during development.

### Acceptance gate

- [ ] A clean checkout starts all required services with documented commands and health checks.
- [ ] React calls Express only; Express owns authorization/orchestration and calls FastAPI through an authenticated internal channel.
- [ ] CI builds every service from scratch on the pinned runtimes.

---

## Phase 2 — PostgreSQL schema, constraints, migrations, and synthetic seeds

Objective: implement the Section 9 relational model and database-enforced integrity.

### Implementation tasks

- [x] Select and configure the TypeScript ORM/query layer and migration tool.
- [x] Create users, sessions, email-verification, and password-reset tables.
- [x] Create patient profiles, doctor profiles, verification applications/artifacts, specialties, languages, clinics, and mapping tables.
- [x] Create availability rules and date-specific exception tables with IANA timezone fields.
- [x] Create appointments and append-only appointment events with UTC intervals, snapshots, status, idempotency key, and reschedule links.
- [x] Add doctor active-interval exclusion/locking enforcement including buffers.
- [x] Add patient overlapping-appointment prevention.
- [x] Create documents, access grants, AI consents, AI jobs, summaries, and review tables.
- [x] Create encounters, notes, note versions, visibility, finalize, and amendment fields.
- [x] Create conversations, messages, attachments, idempotency IDs, and delivery/read receipts.
- [x] Create notifications, delivery attempts, preferences, durable jobs, retry, expiry, and deduplication fields.
- [x] Create immutable audit events with minimally necessary metadata.
- [x] Create placeholder migration boundaries for payment, calendar, video, and prescription tables.
- [x] Add foreign keys, unique constraints, status checks, normalized-email uniqueness, and deletion policies.
- [x] Add indexes for directory filters, doctor/patient time queries, conversation cursors, due jobs, grants, and admin reports.
- [x] Create deterministic, idempotent synthetic seed data with consistent personas and dates.
- [x] Document migration forward, rollback, and production deployment procedures.

### Security requirements

- [x] Use a least-privilege application database role and a separate migration role.
- [x] Ensure no raw clinical/document/chat body is written to audit or operational log tables.

### Acceptance gate

- [x] Migrations apply from an empty database and roll back safely in a disposable environment.
- [x] Database tests prove normalized-email uniqueness, foreign-key integrity, terminal appointment states, and overlap prevention.
- [x] Representative query plans use the intended indexes without N+1 access patterns.

---

## Phase 3 — Express API foundation and contracts

Objective: establish the trusted API boundary described in Sections 10 and 11.

### Implementation tasks

- [x] Implement Express TypeScript app composition, versioned `/api` routing, graceful shutdown, and request-size limits.
- [x] Implement consistent success/error envelopes, request IDs, machine-readable error codes, and pagination metadata.
- [x] Add centralized validation, error handling, privacy-preserving 404 behavior, and production-safe logging.
- [x] Map validation to 422, conflict to 409, unauthenticated to 401, forbidden/private-not-found to 403/404, oversized upload to 413, and throttling to 429.
- [x] Add OpenAPI documentation for all R1 REST contracts.
- [x] Add database transaction helpers and idempotency middleware.
- [x] Add safe CORS, Helmet/security headers, compression, and proxy/TLS configuration.
- [x] Add service-to-service authentication for Express-to-FastAPI calls.
- [x] Add per-route rate-limit policies and abuse telemetry.

### Security requirements

- [x] Never return stack traces, password/session hashes, private object keys, or provider secrets.
- [x] Parameterize all SQL and encode untrusted output safely.
- [x] Redact tokens, identifiers, document bodies, chat bodies, and medical content from routine logs.

### Acceptance gate

- [x] Contract tests cover error envelopes, validation, pagination, request IDs, rate limits, and graceful dependency failure.

---

## Phase 4 — JWT authentication, sessions, RBAC, and account security

Objective: replace prototype client/Firebase authorization with the PRD's server-owned JWT/bcrypt model.

### Implementation tasks

- [x] Implement patient and unverified-doctor registration with normalized email and bcrypt hashing.
- [x] Prevent all public/admin-registration paths and ignore tampered role input.
- [x] Implement login, logout, short-lived access JWT, rotating refresh sessions, reuse detection, and revocation.
- [x] Store refresh credentials in secure HttpOnly SameSite cookies and implement CSRF protection for cookie-authenticated mutations.
- [x] Implement single-use expiring email verification and password-reset tokens without account enumeration.
- [x] Implement authenticated password change and revoke-other-session/current-session flows.
- [x] Implement account suspension checks that block new sessions and clinical actions while preserving history.
- [x] Implement server authorization middleware for role plus resource ownership/relationship checks.
- [x] Preserve only validated same-origin return destinations after expired login.
- [x] Wire the React auth provider to Express and remove security reliance on client route hiding.
- [x] Add profile bootstrap/onboarding state for patients and doctor applicants.

### Security requirements

- [x] Rate-limit registration, login, refresh, reset, and verification attempts by appropriate identifiers.
- [x] Hash session/reset/verification secrets at rest and rotate signing keys safely.
- [x] Audit authentication security events without logging credentials or tokens.

### Acceptance gate

- [x] Tests cover duplicate normalized email, bad/expired/reused credentials, forged roles, suspension, logout invalidation, refresh rotation, and CSRF.
- [x] The complete patient/doctor/admin RBAC matrix and tampered-resource-ID suite passes.

---

## Phase 5 — Profiles, clinics, specialties, and doctor verification

Objective: implement the role data and controlled provider-verification journey.

### Implementation tasks

- [x] Implement `GET/PATCH /api/me` with patient contact, DOB, timezone, optional demographics, allergies/history, and preferences.
- [x] Separate doctor public profile fields from private account and verification fields.
- [x] Implement doctor specialty, qualifications, experience, languages, registration/license, biography, photo, modes, clinic, fee, and currency editing.
- [x] Implement protected verification-artifact upload and pending/rejected/resubmission states.
- [x] Implement admin application review with approve/reject reason, reviewer, timestamp, and immutable audit event.
- [x] Ensure only verified, active doctors can appear in discovery, accept booking, or enter clinical workspace.
- [x] Implement admin specialty and clinic metadata CRUD with safe deactivation behavior.
- [x] Implement account suspension/reactivation with reason and audit context.
- [x] Wire existing profile, verification, and admin-management screens to real APIs.

### Security requirements

- [x] Prevent doctors from modifying verification/status fields and admins from routinely reading patient medical profile fields.
- [x] Serve verification artifacts only through short-lived, authorized access.

### Acceptance gate

- [x] An applicant cannot self-verify; every status change records actor/reason/time.
- [x] Suspended/unverified doctors are absent from discovery and denied clinical actions.

---

## Phase 6 — Doctor discovery and public profiles

Objective: deliver real, paginated, privacy-safe discovery using reservable availability.

### Implementation tasks

- [x] Public landing, directory, profile, and patient search route components exist.
- [x] Doctor cards visually include verification, specialty, experience, language, location, fee, and next-slot fields.
- [x] Implement `GET /api/doctors`, `/:id`, `/:id/slots`, and `/api/specialties` against PostgreSQL.
- [x] Support combined specialty, location, exact availability date, fee, experience, and language filters.
- [x] Support sorting by earliest reservable availability, fee, and experience.
- [x] Add active-filter chips, clear-all, URL state, server pagination, loading skeletons, error state, no-results recovery, and mobile filter drawer.
- [x] Derive availability filters and next-slot values from the scheduling engine, not static opening hours.
- [x] Show qualifications, clinic details, modes, policy, currency, and timezone-labeled availability on profiles.
- [x] Exclude unverified/suspended/inactive doctors and all private provider attributes.
- [x] Defer AI-assistant clarification for ambiguous date/location to Phase 17 (R2), as explicitly approved.

### Security requirements

- [x] Apply field allowlists, bounded pagination, validation, and public rate limits.

### Acceptance gate

- [x] “Cardiologists available this Saturday” resolves to the exact patient-timezone date and only returns genuinely reservable slots.
- [x] Search/filter/sort/pagination combinations pass correctness and performance tests.

---

## Phase 7 — Availability and scheduling engine

Objective: generate correct slots and prevent doctor/patient conflicts at database level.

### Implementation tasks

- [x] Implement weekly windows per doctor, clinic, and mode with effective dates.
- [x] Implement duration, pre/post buffers, booking horizon, minimum notice, breaks, leave, and date overrides.
- [x] Store appointment instants in UTC and retain relevant IANA timezones for rules/display.
- [x] Implement timezone/DST/midnight-safe slot generation.
- [x] Subtract active appointments, buffers, exceptions, and temporary holds from generated slots.
- [x] Enforce doctor overlap prevention across every clinic/mode and patient overlap prevention transactionally.
- [x] Implement availability create/update/delete and exception endpoints.
- [x] Detect existing appointments affected by rule changes and require explicit keep/reschedule/cancel resolution.
- [x] Wire doctor calendar/availability UI to real rules and provide day/week plus mobile list views.

### Security requirements

- [x] Restrict schedule mutation to the owning verified doctor or explicitly authorized operator and audit exceptions.

### Acceptance gate

- [x] Concurrent requests for one slot yield exactly one success.
- [x] Overlapping intervals fail even with different start times; leave removes only unbooked availability; DST/midnight/buffer tests pass.

---

## Phase 8 — Appointment lifecycle, cancellation, and atomic rescheduling

Objective: implement the complete auditable state machine and recovery behavior.

### Implementation tasks

- [x] Booking stepper and role-specific appointment lifecycle controls exist as UI prototypes.
- [x] Implement appointment create/list/detail endpoints with doctor, patient, clinic/mode, UTC interval, timezone, fee/currency snapshot, reason, shared-document IDs, status, and policy snapshot.
- [x] Require an idempotency key and transactionally recheck slot and price at submission.
- [x] Default new bookings to Scheduled and optionally support explicitly configured auto-confirmation.
- [x] Enforce Scheduled → Confirmed/Cancelled/Declined and Confirmed → Completed/Cancelled/No-show only.
- [x] Enforce actor permissions, confirmation deadline, cancellation cutoff, and no-show grace period.
- [x] Record every transition as an append-only event with actor, reason, timestamp, policy outcome, and notification event.
- [x] Release capacity on decline/cancel and expire stale Scheduled requests through durable jobs.
- [x] Implement atomic rescheduling that reserves the replacement before releasing the original and links both records/events.
- [x] Preserve the original booking if replacement reservation fails and return refreshed alternatives on 409.
- [x] Invalidate/reschedule future reminders and external integration events after changes.
- [x] Wire patient and doctor appointment screens to persisted API state, filters, list/calendar, and history timeline.

### Security requirements

- [x] Authorize every appointment read/transition by participant or permitted operator and prevent terminal-state mutation.

### Acceptance gate

- [x] Double-click/retry does not duplicate a booking; fee snapshots remain unchanged; completed visits cannot be routinely altered.
- [x] Concurrent booking and atomic-reschedule rollback tests pass.

---

## Phase 9 — Patient portal, history, preferences, and data requests

Objective: make the patient experience accurate, persistent, private, and complete on every supported viewport.

### Implementation tasks

- [x] Patient overview, appointments, documents, messages, history, notifications, settings, and assistant routes exist.
- [x] Populate next appointment, upcoming/past counts, recent doctors, document states, unread conversations, reminders, and quick actions from authorized APIs.
- [x] Implement appointment list/calendar, status/date/doctor filters, detail, and event history.
- [x] Implement visit history and encounter detail with deliberately published summaries only.
- [x] Ensure “my doctors” derives from booked/consulted relationships rather than an undocumented favorites model.
- [x] Implement profile, contact verification, password/session management, timezone, communication, privacy, AI, and sharing preferences.
- [x] Implement retention-aware data export and deletion-request workflows.
- [x] Add empty, loading, expired-session, access-denied, offline, partial-failure, and retry states.
- [x] Ensure dashboard counts reconcile exactly with source records.

### Security requirements

- [x] Patient endpoints return only the authenticated patient's records and never provider-private notes.

### Acceptance gate

- [ ] Direct API, export, history, attachment, and guessed-ID authorization tests pass.
- [ ] Every key patient action works at 360 px and by keyboard.

---

## Phase 10 — Secure medical document pipeline and access grants

Objective: deliver private uploads, protected reads, and purpose-bound sharing.

### Implementation tasks

- [x] UI advertises PDF/JPG/PNG and 20 MB limits and performs preliminary browser validation.
- [x] Sharing and AI-consent controls are visually separated in the document UI.
- [x] Select/configure private S3-compatible storage with non-guessable object keys and encryption at rest.
- [x] Implement server-authorized multipart/presigned upload initiation and completion.
- [x] Enforce 20 MB, PDF/JPEG/PNG extension, MIME, magic signature, polyglot/executable, encryption, readability, and 50-page checks server-side.
- [x] Sanitize display filenames and keep storage keys private.
- [x] Quarantine uploads, run malware scanning, and promote only approved files.
- [x] Implement upload progress, cancellation, retry, scan/extraction states, rename/type/date, appointment association, and retention-aware delete status.
- [x] Implement protected preview/download through short-lived signed URLs issued after each authorization check.
- [x] Implement grants with patient, doctor, resource scope, purpose, expiry, consent, and revocation timestamp.
- [x] Block new reads/signed links immediately after revocation and explain already-downloaded-copy limitations.
- [x] Route chat attachments through the same pipeline without automatic AI processing.

### Security requirements

- [x] Prevent IDOR, public bucket access, object-key disclosure, stale URL reuse, and cross-doctor grant leakage.

### Acceptance gate

- [x] Tests cover arbitrary IDs, expired links, revoked grants, MIME mismatch, malware, oversized/encrypted/unreadable PDFs, and processing failure without original loss.

---

## Phase 11 — AI document extraction, summarization, consent, and review

Objective: implement safe source-grounded document comprehension—not diagnosis.

### Implementation tasks

- [x] FastAPI/Groq/LangGraph infrastructure and structured-output patterns exist in a separate symptom-intake prototype.
- [ ] Build text extraction plus OCR for approved PDFs and images with page/span provenance and quality scoring.
- [ ] Require purpose-specific, provider/versioned AI consent after upload approval and support future-processing withdrawal.
- [ ] Queue and persist not-requested, queued, extracting, processing, completed, needs-review, and failed states.
- [ ] Minimize identifiers sent to the model and treat extracted text as untrusted prompt-injection content.
- [ ] Define and validate a structured summary schema for document type, key facts, measurements, units, source ranges, source-labeled abnormal flags, source-stated follow-up, missing fields, limitations, and references.
- [ ] Preserve original values/dates and never invent diagnoses, thresholds, medication changes, urgency, or general follow-up as source advice.
- [ ] Persist input hash/version, consent, model, prompt, structured result, source references, attempts, and timestamps.
- [ ] Deduplicate identical requests or create explicit versions after source/prompt/model changes.
- [ ] Implement retryable outage/failure behavior and safe low-quality extraction handling.
- [ ] Display source beside summary, “Not found” values, limitations, disclaimer, status, doctor review, and annotation.
- [ ] Add doctor mark-reviewed/annotation without implying blanket clinical validation.

### Security requirements

- [ ] Authenticate Express-to-FastAPI requests; never expose provider keys or direct FastAPI clinical endpoints to React.
- [ ] Keep raw document content out of routine application/provider logs and approve production data-processing terms.

### Acceptance gate

- [ ] Evaluation covers scanned labs, radiology, discharge summaries, prescriptions, unreadable inputs, missing fields, OCR corruption, and embedded malicious instructions.
- [ ] Qualified review thresholds are approved; no unsupported clinical recommendation or critical cross-user exposure is accepted.

---

## Phase 12 — Doctor dashboard, patient workspace, encounters, and notes

Objective: provide doctors only the patient context authorized by appointments and explicit grants.

### Implementation tasks

- [x] Doctor overview, intakes, appointments, calendar, availability, workspace, messages, profile, and settings routes exist.
- [ ] Implement today's schedule, pending confirmations, upcoming visits, unread messages, and operational metrics APIs.
- [ ] Open patient workspace only from an authorized doctor-patient relationship/appointment.
- [ ] Return the doctor's own encounters plus separately granted records; booking alone must not expose all patient history.
- [ ] Display shared source documents and AI summaries with grant and review state.
- [ ] Implement encounter creation independently from appointment completion.
- [ ] Implement provider-private draft notes with author/timestamps.
- [ ] Implement finalization, immutable versions, amendments, and audit trail rather than overwrite.
- [ ] Implement deliberately published patient-visible encounter summaries separate from private notes.
- [ ] Wire complete/no-show actions and eligible follow-up chat from workspace.

### Security requirements

- [ ] Prevent doctor A from reading doctor B's unshared encounters, drafts, documents, notes, or conversations.

### Acceptance gate

- [ ] Authorization, draft privacy, version/amendment, publishing, completion-history, and analytics-update tests pass.

---

## Phase 13 — Persistent Socket.IO messaging and secure attachments

Objective: implement durable, authorized, recoverable doctor-patient communication.

### Implementation tasks

- [x] Conversation/composer/read-receipt visuals and non-emergency messaging notice exist as UI prototypes.
- [ ] Implement conversation eligibility from confirmed/completed appointments and configurable follow-up policy.
- [ ] Implement paginated conversation/message REST recovery APIs.
- [ ] Add Socket.IO to the persistent Express process with authenticated handshake and versioned events.
- [ ] Implement `conversation:join`, `message:send`, `message:ack`, `message:new`, `message:delivered`, `message:read`, `notification:new`, and `access:revoked`.
- [ ] Authorize every room, event, attachment, and receipt by current relationship and suspension/grant state.
- [ ] Persist messages before acknowledgement and deduplicate client-generated message IDs.
- [ ] Implement cursor-based reconnect recovery without duplicates.
- [ ] Implement pending, sent, delivered, read, and failed UI states plus draft preservation and reconnect banner.
- [ ] Implement authorized document attachment selection through the secure file pipeline.
- [ ] Generate notifications with non-sensitive previews.

### Security requirements

- [ ] Escape/sanitize content, throttle abuse, bound message size, and revalidate permissions after suspension/revocation.

### Acceptance gate

- [ ] Guessed-room, duplicate-send, persistence-before-ack, reconnect, receipt-accuracy, revoked-access, and failed-draft tests pass.

---

## Phase 14 — Durable worker, notifications, reminders, and job operations

Objective: make asynchronous work restart-safe, observable, deduplicated, and controllable.

### Implementation tasks

- [ ] Implement database-backed queue claiming with locking, heartbeat/lease, retry backoff, expiry, and dead-letter/failed state.
- [ ] Process malware scans, extraction, AI summaries, reminders, stale confirmations, and cleanup outside web processes.
- [ ] Implement in-app events for booking, confirmation, decline, cancellation, reschedule, reminders, unread messages, and document/summary completion.
- [ ] Schedule confirmed-appointment reminders at proposed 24-hour and 1-hour windows.
- [ ] If already inside a reminder window, create only remaining applicable reminders.
- [ ] Deduplicate by event/channel/window and invalidate stale jobs after cancellation/rescheduling.
- [ ] Respect timezone, quiet hours, opt-in preferences, verified destination, and transactional-versus-optional distinctions.
- [ ] Store delivery attempts/status while excluding sensitive content from previews.
- [ ] Implement admin failed-job inspection and controlled retry.
- [ ] Add worker readiness, graceful shutdown, restart recovery, backlog metrics, and alerts.

### Security requirements

- [ ] Give worker/service identities only required database, storage, and provider permissions.

### Acceptance gate

- [ ] Restart does not lose queued work; duplicates are suppressed; stale reminders never send; provider failures are visible and retryable.

---

## Phase 15 — Admin operations, audit, reporting, and exports

Objective: deliver metadata-focused operations without routine access to medical content.

### Implementation tasks

- [x] Admin overview, patient/doctor/appointment tables, reports, audit, jobs, and settings routes exist as UI prototypes.
- [ ] Implement searchable, filtered, paginated patient, doctor, appointment, verification, specialty, clinic, job, and settings APIs.
- [ ] Implement appointment-issue and notification/processing failure workflows.
- [ ] Implement permission-controlled CSV/report exports using identical filters/definitions as dashboards.
- [ ] Define total patient/doctor counts as active or lifetime and display scope/date range.
- [ ] Implement completion rate as completed/all cohort appointments with zero-denominator = 0%.
- [ ] Keep cancelled, declined, and no-show records in the default denominator and separately label the operational rate excluding cancelled/declined.
- [ ] Rank specialization popularity by appointment count in the selected cohort.
- [ ] Render charts from actual aggregate data with accessible tabular alternatives.
- [ ] Suppress/aggregate small sensitive groups in shared reports.
- [ ] Implement immutable audit browsing for actor/action/resource/reason/time.
- [ ] Explicitly prohibit admin impersonation and silent note modification in R1.

### Security requirements

- [ ] Ensure ordinary admin endpoints cannot fetch document bodies, chat bodies, private notes, or unrestricted patient medical content.

### Acceptance gate

- [ ] Dashboard/export parity, cohort formulas, zero denominator, audit completeness, permissioned export, and private-content denial tests pass.

---

## Phase 16 — Complete UI system, responsive behavior, and accessibility

Objective: connect the complete screen inventory to production APIs with WCAG 2.2 AA-oriented behavior.

### Implementation tasks

- [x] Shared visual tokens, navigation shell, buttons, badges, panels, dialogs, tabs, empty states, and toast foundations exist.
- [x] Public/patient/doctor/admin navigation and most required route destinations exist.
- [ ] Document semantic color, typography, spacing, radius, elevation, breakpoints, and component variants.
- [ ] Complete missing verification/reset/confirmation, specialties/clinics, encounter-detail, maintenance, offline, and permission-denied screens.
- [ ] Implement default, hover, focus, disabled, loading, skeleton, validation, error, success, empty, offline, and partial-failure states consistently.
- [ ] Replace static dates, hard-coded documents/messages/analytics, and local-only mutations with API state.
- [ ] Preserve safe form/chat drafts across recoverable network and auth failures.
- [ ] Validate sidebar-to-mobile navigation, stacked grids, filter drawer, calendar list alternative, document tabs, and responsive tables.
- [ ] Validate 360, 390, 768, 1024, and 1440 px layouts with no hover-only action.
- [ ] Audit labels, headings, landmarks, keyboard order, focus management, dialog trapping, status announcements, contrast, touch targets, and reduced motion.
- [ ] Ensure statuses use words plus badges and every booking/detail surface labels currency, mode, location, date/time, and timezone.
- [ ] Ensure AI limitations, consent separation, confirmation consequences, and emergency language are consistent.

### Security requirements

- [ ] Do not use session replay or sensitive analytics on clinical screens; avoid exposing identifiers in URLs/UI unnecessarily.

### Acceptance gate

- [ ] Automated accessibility checks and manual keyboard/screen-reader/responsive review pass for every R1 journey.

---

## Phase 17 — R2 AI discovery and admin assistants

Objective: add permission-aware assistance without diagnosis or autonomous operational action.

### Implementation tasks

- [ ] Replace/reshape the symptom-intake prototype into the PRD's conversational discovery assistant or explicitly scope it as a separately governed feature.
- [ ] Extract specialty, location, date, language, fee, and availability filters from conversation.
- [ ] Ask clarifying questions for ambiguous dates/locations and query live verified doctors/slots.
- [ ] Require explicit review and confirmation before booking; never diagnose or guarantee suitability.
- [ ] Implement an admin assistant limited to aggregate metrics, permitted help content, and draft operational responses.
- [ ] Require confirmation and ordinary RBAC for every proposed admin action.
- [ ] Show source/context explanations and clear model limitations.

### Security requirements

- [ ] Prevent patient-content disclosure, permission bypass, prompt-triggered tools, autonomous suspension, and clinical actions.

### Acceptance gate

- [ ] Live-availability grounding, ambiguity, unauthorized-data, prompt-injection, and explicit-action-confirmation tests pass.

---

## Phase 18 — R2 calendar sync, email/SMS, PWA, and advanced analytics

Objective: add assisted operations only after R1 durability and permissions are proven.

### Implementation tasks

- [ ] Generate private downloadable ICS with correct timezone, minimal title, and no medical reason.
- [ ] Implement Google/Outlook OAuth connect, callback, token protection, revoke, and reconnect.
- [ ] Sync booking/reschedule/cancel updates idempotently and recover from revoked tokens/provider outages.
- [ ] Implement verified email/SMS destinations, consent/preferences, provider adapters, delivery status, retry, and safe previews.
- [ ] Add web manifest, install guidance, offline shell, update notice, reconnect behavior, and optional permissioned push.
- [ ] Prevent offline caching of private records, tokens, documents, and chat content by default.
- [ ] Implement booking funnel, conversion, cancellation/no-show, utilization, demand, reminder, and AI-job analytics with documented cohorts.

### Security requirements

- [ ] Encrypt external tokens, validate OAuth state, minimize calendar content, and isolate provider webhooks/callbacks.

### Acceptance gate

- [ ] Revocation, provider failure, stale event, offline privacy, notification deduplication, and analytics-definition tests pass.

---

## Phase 19 — R3 payments, reservation holds, refunds, and reconciliation

Objective: add provider-hosted payments without storing card data or losing scheduling integrity.

### Implementation tasks

- [ ] Select provider and approve fee/refund/cancellation policies.
- [ ] Implement proposed 10-minute capacity hold with explicit expiry.
- [ ] Create provider-hosted checkout with fee/currency breakdown and no card storage.
- [ ] Verify signed webhooks and idempotently reconcile pending/paid/failed/expired/refunded states.
- [ ] Finalize appointments only after verified payment and capacity validation.
- [ ] Handle late payment after hold expiry through compensating refund/manual reconciliation.
- [ ] Implement receipt and refund status UI plus admin reconciliation queue.

### Security requirements

- [ ] Protect webhook secrets, validate signatures/timestamps, and separate payment metadata from clinical data.

### Acceptance gate

- [ ] Duplicate/out-of-order webhook, expired hold, late success, refund, outage, and reconciliation tests pass.

---

## Phase 20 — R3 authorized video consultations

Objective: provide appointment-bound video with short-lived access and privacy-safe defaults.

### Implementation tasks

- [ ] Select provider and approve consent/privacy terms.
- [ ] Implement device-permission checks, waiting room, participant state, call controls, disconnect/rejoin, and fallback.
- [ ] Issue signed short-lived join tokens only to permitted participants for an eligible appointment.
- [ ] Disable recording by default and require explicit approved consent/policy if ever enabled.
- [ ] Persist only necessary operational session metadata.

### Security requirements

- [ ] Prevent guessed-room access, token replay, early/late unauthorized joins, and cross-appointment access.

### Acceptance gate

- [ ] Participant authorization, expiry, reconnect, provider outage, fallback, and recording-default tests pass.

---

## Phase 21 — R3 digital prescriptions

Objective: implement jurisdiction-approved, doctor-only, versioned prescription issuance.

### Implementation tasks

- [ ] Complete legal/clinical approval and define authorized prescriber criteria.
- [ ] Implement encounter-linked medication, dose, route, frequency, duration, and instruction fields.
- [ ] Restrict authoring and issuance to verified authorized doctors; patients have read/download access only.
- [ ] Add issue-review confirmation, immutable version, amendment, author, timestamp, and audit trail.
- [ ] Generate a protected downloadable prescription artifact.
- [ ] Explicitly prevent AI from authoring, changing, or issuing prescriptions.

### Security requirements

- [ ] Prevent patient/admin issuance, silent amendment, cross-encounter access, and unsigned artifact access.

### Acceptance gate

- [ ] Role, verification, versioning, amendment, protected-download, and AI-non-prescription tests pass.

---

## Phase 22 — Cross-cutting security, privacy, and threat remediation

Objective: verify defense in depth across every API, socket, worker, storage, and deployment boundary.

### Implementation tasks

- [ ] Maintain a threat model covering IDOR, auth/session attacks, SQL injection, XSS, CSRF, SSRF, upload attacks, prompt injection, webhook spoofing, and queue abuse.
- [ ] Enforce TLS, secure headers/cookies, safe CORS, credential rotation, encryption at rest, and least privilege.
- [ ] Review every REST and Socket.IO action for role plus resource ownership/relationship authorization.
- [ ] Implement centralized audit events for verification, suspension, appointment exceptions, grants, note finalization/amendment, exports, and retries.
- [ ] Validate redacted structured logging and absence of clinical bodies/private keys in logs and analytics.
- [ ] Implement retention, export, deletion, grant revocation, backup, and legal-hold procedures.
- [ ] Scan dependencies, containers, source, secrets, and infrastructure configuration in CI.
- [ ] Complete independent security review and remediate critical/high findings.

### Acceptance gate

- [ ] No critical cross-user exposure remains; forged roles, tampered IDs, revoked sessions/grants, and private URLs fail across all access paths.

---

## Phase 23 — Automated testing, performance, reliability, and observability

Objective: prove Section 12 targets and all Section 13 challenge gates with repeatable evidence.

### Implementation tasks

- [ ] Build unit, integration, contract, migration, worker, Socket.IO, browser E2E, and accessibility test suites.
- [ ] Add the full patient, doctor, admin, and recovery journeys to E2E tests.
- [ ] Add concurrent booking, overlapping interval, and atomic reschedule rollback tests.
- [ ] Add timezone, DST, midnight, leave, buffer, deadline, and availability-edit tests.
- [ ] Add secure-upload, signed-URL, grant-revocation, extraction-failure, and retention tests.
- [ ] Add messaging authorization, duplicate, reconnect, persistence, and receipt tests.
- [ ] Add AI factuality, missing-field, OCR, prompt-injection, source-grounding, and outage evaluation sets.
- [ ] Load 10,000 synthetic doctors and 100,000 appointments and test 100 concurrent sessions.
- [ ] Measure p95 directory/API reads under 1 second, booking under 2 seconds, and ordinary UI feedback under 200 ms at agreed load.
- [ ] Measure 90% of supported documents up to 10 pages within 60 seconds at agreed AI workload.
- [ ] Instrument latency, conflicts, failures, queue age, reminder delivery, socket reconnects, AI quality/failure, and web vitals without clinical content.
- [ ] Alert on processing backlog, repeated failures, SLO burn, and dependency outages.
- [ ] Define/measure the proposed 99.5% monthly SLO and conduct RPO 24h/RTO 4h backup/restore drills.
- [ ] Capture synthetic baseline success metrics from Section 14.

### Acceptance gate

- [ ] All ten Section 13 verification challenges pass with retained CI/load/evaluation evidence.

---

## Phase 24 — Deployment, documentation, and release gates

Objective: deploy safely and prove each release is supportable, reversible, and accurately represented.

### Implementation tasks

- [ ] Define development, staging, and production environments with isolated secrets, databases, storage, and providers.
- [ ] Deploy React, persistent Express/Socket.IO, FastAPI, worker, managed PostgreSQL, and private storage to approved platforms.
- [ ] Add CI/CD gates for formatting, lint, types, tests, migrations, security scans, build, and smoke tests.
- [ ] Implement backward-compatible migration rollout and documented rollback.
- [ ] Validate health probes, graceful shutdown, worker restart, backups, restore, third-party outage, and disaster procedures.
- [ ] Write setup, architecture, API, worker, AI safety, security, operations, incident, backup/restore, and deployment runbooks.
- [ ] Update README with prerequisites, screenshots, synthetic demo accounts, limitations, and accurate feature status.
- [ ] Produce screen-to-PRD coverage matrix, component/state inventory, interaction notes, responsive/accessibility evidence, and assumptions.
- [ ] Capture portfolio demo video and evidence without real patient data or unsupported production/clinical claims.
- [ ] Complete R1 gate: all core journeys end to end, authorization passes, scheduling database-enforced, files private, reminders durable, AI safe, accessibility/responsiveness reviewed, and restore proven.
- [ ] Complete R2 gate: every integration has permission, failure, retry, revocation, and privacy tests.
- [ ] Complete R3 gate: payment webhooks/refunds, video access, and prescription governance/issuance pass approval and tests.
- [ ] Obtain explicit product/security/clinical sign-off appropriate to the target release.

### Acceptance gate

- [ ] A clean production-like deployment passes smoke/E2E tests, rollback and restore drills, and the selected release checklist without manual data repair.

---

## Immediate next execution slice

Start **Phase 1 — Target architecture and repository foundation** in this order:

- [x] Create the target directories and move the current React app into `client/` with imports/build preserved.
- [x] Scaffold `server/` as an Express TypeScript service with validated configuration and health endpoints.
- [x] Scaffold `worker/`, `database/`, and `docs/decisions/`.
- [x] Add Docker Compose for PostgreSQL and local supporting services.
- [ ] Add root orchestration scripts and CI for client/server/AI/worker builds.
- [ ] Prove React → Express → FastAPI connectivity through authenticated health/demo requests before starting schema work.

Phase 2 begins only after the Phase 1 acceptance gate is satisfied.

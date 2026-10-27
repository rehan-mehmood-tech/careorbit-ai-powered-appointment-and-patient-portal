import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../app.js";
import { AuthService } from "../auth/service.js";
import { config } from "../config.js";
import { getDecrypted } from "./storage.js";
const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
  }),
  authService = new AuthService(pool),
  app = createApp(pool, {
    requireTls: false,
    defaultRateMax: 1000,
    authRateMax: 1000,
  }),
  suffix = Date.now(),
  password = "StrongPassword42";
let patient = "",
  other = "",
  doctor = "",
  pt = "",
  ot = "",
  dt = "",
  documentId = "",
  grantId = "";
const bearer = (x: string) => ({ Authorization: `Bearer ${x}` }),
  pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type /Page>>endobj\n%%EOF");
before(async () => {
  for (const [role, label] of [
    ["patient", "owner"],
    ["patient", "other"],
    ["doctor", "doctor"],
  ] as const) {
    const u = await authService.register(
      {
        name: `Document ${label}`,
        email: `document-${label}-${suffix}@test.local`,
        password,
        accountType: role,
      },
      `doc-${label}`,
    );
    await pool.query(
      `UPDATE users SET email_verified_at=now(),status='active' WHERE id=$1`,
      [u.id],
    );
    if (role === "doctor")
      await pool.query(
        `UPDATE doctor_profiles SET verification_status='approved' WHERE user_id=$1`,
        [u.id],
      );
    const login = await authService.login(
      { email: `document-${label}-${suffix}@test.local`, password },
      { requestId: `doc-login-${label}` },
    );
    if (label === "owner") {
      patient = u.id;
      pt = login.accessToken;
    } else if (label === "other") {
      other = u.id;
      ot = login.accessToken;
    } else {
      doctor = u.id;
      dt = login.accessToken;
    }
  }
});
after(async () => {
  await pool.query(
    `UPDATE users SET status='closed' WHERE id=ANY($1::uuid[])`,
    [[patient, other, doctor]],
  );
  await pool.query(
    `UPDATE sessions SET revoked_at=now(),revocation_reason='test_complete' WHERE user_id=ANY($1::uuid[]) AND revoked_at IS NULL`,
    [[patient, other, doctor]],
  );
  await pool.end();
});
function initiate(
  token: string,
  name: string,
  mime = "application/pdf",
  size = pdf.length,
) {
  return request(app)
    .post("/api/v1/documents/uploads/initiate")
    .set(bearer(token))
    .send({
      filename: name,
      mimeType: mime,
      sizeBytes: size,
      documentType: "Lab report",
      clinicalDate: "2026-10-01",
    });
}
async function upload(
  token: string,
  name: string,
  data: Buffer,
  mime = "application/pdf",
) {
  const start = await initiate(token, name, mime, data.length).expect(201),
    url = new URL(start.body.data.uploadUrl, "http://local");
  await request(app)
    .post(`${url.pathname}${url.search}`)
    .attach("file", data, { filename: name, contentType: mime })
    .expect(200);
  return start.body.data.uploadId as string;
}
test("validated upload is encrypted, private, sanitized, and downloadable only through a short-lived authorized URL", async () => {
  const uploadId = await upload(pt, "../sensitive report.pdf", pdf);
  const complete = await request(app)
    .post(`/api/v1/documents/uploads/${uploadId}/complete`)
    .set(bearer(pt))
    .expect(201);
  documentId = complete.body.data.document.id;
  assert.equal(
    complete.body.data.document.display_name,
    "sensitive report.pdf",
  );
  assert.equal(complete.body.data.document.scan_status, "clean");
  assert.ok(!JSON.stringify(complete.body).includes("object_key"));
  await request(app)
    .get(`/api/v1/documents/${documentId}`)
    .set(bearer(ot))
    .expect(404);
  const link = await request(app)
    .post(`/api/v1/documents/${documentId}/download-url`)
    .set(bearer(pt))
    .expect(200);
  const url = new URL(link.body.data.url, "http://local"),
    content = await request(app)
      .get(`${url.pathname}${url.search}`)
      .expect(200);
  assert.deepEqual(content.body, pdf);
  assert.match(String(content.headers["cache-control"]), /no-store/);
});
test("strict validation rejects MIME mismatch, malware, encrypted/unreadable/polyglot, oversized and over-page-limit files while preserving failed quarantine originals", async () => {
  await initiate(
    pt,
    "huge.pdf",
    "application/pdf",
    20 * 1024 * 1024 + 1,
  ).expect(422);
  const mismatch = await initiate(
      pt,
      "wrong.pdf",
      "application/pdf",
      12,
    ).expect(201),
    murl = new URL(mismatch.body.data.uploadUrl, "http://local");
  await request(app)
    .post(`${murl.pathname}${murl.search}`)
    .attach("file", Buffer.from("not-a-jpeg!!"), {
      filename: "wrong.jpg",
      contentType: "image/jpeg",
    })
    .expect(422);
  for (const [name, data, code] of [
    [
      "malware.pdf",
      Buffer.from("%PDF-1.4 EICAR-STANDARD-ANTIVIRUS-TEST-FILE %%EOF"),
      "MALWARE_DETECTED",
    ],
    ["encrypted.pdf", Buffer.from("%PDF-1.4 /Encrypt %%EOF"), "ENCRYPTED_PDF"],
    ["broken.pdf", Buffer.from("%PDF-1.4 /Type /Page"), "UNREADABLE_PDF"],
    [
      "polyglot.pdf",
      Buffer.from("%PDF-1.4 <script>alert(1)</script> %%EOF"),
      "POLYGLOT_BLOCKED",
    ],
    [
      "too-many-pages.pdf",
      Buffer.from(`%PDF-1.4 ${"/Type /Page ".repeat(51)} %%EOF`),
      "PAGE_LIMIT_EXCEEDED",
    ],
  ] as const) {
    const id = await upload(pt, name, data),
      result = await request(app)
        .post(`/api/v1/documents/uploads/${id}/complete`)
        .set(bearer(pt))
        .expect(422);
    assert.equal(result.body.error.code, code);
    const row = (
      await pool.query(
        `SELECT object_key,status FROM document_uploads WHERE id=$1`,
        [id],
      )
    ).rows[0];
    assert.equal(row.status, "failed");
    assert.deepEqual(await getDecrypted(row.object_key), data);
  }
});
test("purpose-bound grants authorize a doctor and revocation invalidates already-issued links immediately", async () => {
  const granted = await request(app)
    .post(`/api/v1/documents/${documentId}/grants`)
    .set(bearer(pt))
    .send({
      doctorId: doctor,
      appointmentId: null,
      scope: "download",
      purpose: "Review before consultation",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      consentVersion: "document-sharing-v1",
    })
    .expect(201);
  grantId = granted.body.data.grant.id;
  const signed = await request(app)
    .post(`/api/v1/documents/${documentId}/download-url`)
    .set(bearer(dt))
    .expect(200);
  await request(app)
    .delete(`/api/v1/documents/${documentId}/grants/${grantId}`)
    .set(bearer(pt))
    .expect(200);
  const url = new URL(signed.body.data.url, "http://local");
  await request(app).get(`${url.pathname}${url.search}`).expect(404);
  await request(app)
    .post(`/api/v1/documents/${documentId}/download-url`)
    .set(bearer(dt))
    .expect(404);
});
test("expired signed links fail closed", async () => {
  const token = await new SignJWT({
    documentId,
    userId: patient,
    role: "patient",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("careorbit-document-download")
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
    .sign(new TextEncoder().encode(config.DOCUMENT_SIGNING_SECRET));
  await request(app)
    .get(`/api/v1/documents/${documentId}/content?token=${token}`)
    .expect(404);
});

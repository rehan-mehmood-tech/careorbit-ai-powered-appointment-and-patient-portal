import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import type { Pool } from "pg";
import { z } from "zod";
import { authenticate, requireRoles } from "../auth/middleware.js";
import type { AuthenticatedRequest } from "../auth/types.js";
import { config } from "../config.js";
import { withTransaction } from "../database.js";
import { AppError, apiErrors } from "../errors.js";
import { sendSuccess } from "../responses.js";
import { validate } from "../validation.js";
import { getDecrypted, promote, putEncrypted, remove } from "./storage.js";
import { inspectFile, sanitizeFilename } from "./validation.js";
const secret = new TextEncoder().encode(config.DOCUMENT_SIGNING_SECRET),
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  }),
  wrap = <T extends z.ZodTypeAny>(body: T) =>
    z.object({ body, params: z.object({}), query: z.object({}) });
const initiate = wrap(
    z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      sizeBytes: z
        .number()
        .int()
        .min(8)
        .max(20 * 1024 * 1024),
      documentType: z.string().trim().min(2).max(100),
      clinicalDate: z.iso.date().nullable().optional(),
      appointmentId: z.uuid().nullable().optional(),
    }),
  ),
  metadata = wrap(
    z.object({
      displayName: z.string().min(1).max(255).optional(),
      documentType: z.string().trim().min(2).max(100).optional(),
      clinicalDate: z.iso.date().nullable().optional(),
      appointmentId: z.uuid().nullable().optional(),
    }),
  ),
  grant = wrap(
    z.object({
      doctorId: z.uuid(),
      appointmentId: z.uuid().nullable().optional(),
      scope: z.enum(["view", "download", "encounter"]),
      purpose: z.string().trim().min(3).max(500),
      expiresAt: z.iso.datetime().nullable().optional(),
      consentVersion: z.string().min(1).max(50),
    }),
  );
async function canRead(
  pool: Pool,
  documentId: string | string[] | undefined,
  userId: string,
  role: string,
  scope = "view",
) {
  const id = String(documentId ?? "");
  const result = await pool.query(
    `SELECT d.id,d.owner_id,d.object_key,d.appointment_id,d.display_name,d.document_type,d.clinical_date,d.mime_type,d.size_bytes,d.page_count,d.scan_status,d.extraction_status,d.retention_status,d.created_at FROM documents d WHERE d.id=$1 AND d.scan_status='clean' AND d.retention_status<>'deleted' AND(d.owner_id=$2 OR($3='doctor' AND EXISTS(SELECT 1 FROM document_access_grants g WHERE g.document_id=d.id AND g.doctor_id=$2 AND g.revoked_at IS NULL AND(g.expires_at IS NULL OR g.expires_at>now()) AND(g.scope=$4 OR g.scope='download' OR g.scope='encounter'))))`,
    [id, userId, role, scope],
  );
  if (!result.rows[0]) throw apiErrors.privateNotFound();
  return result.rows[0];
}
export function createDocumentRouter(pool: Pool) {
  const r = Router(),
    auth = authenticate(pool),
    patient = requireRoles("patient");
  r.post(
    "/documents/uploads/initiate",
    auth,
    patient,
    validate(initiate),
    async (req, res, next) => {
      try {
        const owner = (req as AuthenticatedRequest).auth.userId,
          x = res.locals.validated.body,
          name = sanitizeFilename(x.filename),
          key = `${randomBytes(1).toString("hex")}/${randomUUID()}`,
          token = randomBytes(32).toString("base64url"),
          hash = createHash("sha256").update(token).digest("hex");
        if (x.appointmentId) {
          const owned = await pool.query(
            `SELECT 1 FROM appointments WHERE id=$1 AND patient_id=$2`,
            [x.appointmentId, owner],
          );
          if (!owned.rowCount) throw apiErrors.privateNotFound();
        }
        const row = await pool.query(
          `INSERT INTO document_uploads(patient_id,object_key,display_name,document_type,clinical_date,appointment_id,expected_mime,expected_size,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '15 minutes') RETURNING id,expires_at`,
          [
            owner,
            `quarantine/${key}`,
            name,
            x.documentType,
            x.clinicalDate ?? null,
            x.appointmentId ?? null,
            x.mimeType,
            x.sizeBytes,
            hash,
          ],
        );
        sendSuccess(
          res,
          {
            uploadId: row.rows[0].id,
            uploadUrl: `/api/v1/documents/uploads/${row.rows[0].id}/content?token=${encodeURIComponent(token)}`,
            expiresAt: row.rows[0].expires_at,
          },
          201,
        );
      } catch (e) {
        next(e);
      }
    },
  );
  r.post(
    "/documents/uploads/:id/content",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const token = String(req.query.token ?? ""),
          hash = createHash("sha256").update(token).digest("hex"),
          record = await pool.query(
            `SELECT * FROM document_uploads WHERE id=$1 AND token_hash=$2 AND status='initiated' AND expires_at>now()`,
            [req.params.id, hash],
          );
        if (!record.rows[0] || !req.file) throw apiErrors.privateNotFound();
        if (req.file.size !== Number(record.rows[0].expected_size))
          throw new AppError(
            422,
            "SIZE_MISMATCH",
            "Uploaded size differs from the initiated upload",
          );
        if (req.file.mimetype !== record.rows[0].expected_mime)
          throw new AppError(
            422,
            "MIME_MISMATCH",
            "Uploaded MIME type differs from the initiated upload",
          );
        await putEncrypted(record.rows[0].object_key, req.file.buffer);
        await pool.query(
          `UPDATE document_uploads SET status='uploaded',uploaded_at=now() WHERE id=$1`,
          [record.rows[0].id],
        );
        sendSuccess(res, { uploaded: true });
      } catch (e) {
        next(e);
      }
    },
  );
  r.post(
    "/documents/uploads/:id/complete",
    auth,
    patient,
    async (req, res, next) => {
      try {
        const owner = (req as AuthenticatedRequest).auth.userId,
          record = (
            await pool.query(
              `SELECT * FROM document_uploads WHERE id=$1 AND patient_id=$2 AND status='uploaded' FOR UPDATE`,
              [req.params.id, owner],
            )
          ).rows[0];
        if (!record) throw apiErrors.privateNotFound();
        const data = await getDecrypted(record.object_key);
        let checked;
        try {
          checked = inspectFile(
            data,
            record.expected_mime,
            record.display_name,
          );
        } catch (e) {
          await pool.query(
            `UPDATE document_uploads SET status='failed',failure_code=$2 WHERE id=$1`,
            [record.id, e instanceof AppError ? e.code : "SCAN_FAILED"],
          );
          throw e;
        }
        const finalKey = record.object_key.replace("quarantine/", "clean/");
        await promote(record.object_key, finalKey);
        const doc = await withTransaction(pool, async (db) => {
          const created = await db.query(
            `INSERT INTO documents(owner_id,appointment_id,object_key,display_name,document_type,clinical_date,mime_type,size_bytes,page_count,sha256,scan_status,extraction_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'clean','not_requested') RETURNING id,display_name,document_type,clinical_date,mime_type,size_bytes,page_count,scan_status,extraction_status,retention_status,created_at`,
            [
              owner,
              record.appointment_id,
              finalKey,
              record.display_name,
              record.document_type,
              record.clinical_date,
              record.expected_mime,
              data.length,
              checked.pages,
              checked.sha256,
            ],
          );
          await db.query(
            `UPDATE document_uploads SET status='completed',completed_at=now(),object_key=$2 WHERE id=$1`,
            [record.id, finalKey],
          );
          return created.rows[0];
        });
        sendSuccess(res, { document: doc }, 201);
      } catch (e) {
        next(e);
      }
    },
  );
  r.delete("/documents/uploads/:id", auth, patient, async (req, res, next) => {
    try {
      const owner = (req as AuthenticatedRequest).auth.userId,
        row = await pool.query(
          `UPDATE document_uploads SET status='cancelled' WHERE id=$1 AND patient_id=$2 AND status IN('initiated','uploaded') RETURNING object_key`,
          [req.params.id, owner],
        );
      if (!row.rows[0]) throw apiErrors.privateNotFound();
      await remove(row.rows[0].object_key);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  r.get("/documents", auth, async (req, res, next) => {
    try {
      const p = (req as AuthenticatedRequest).auth;
      const rows = await pool.query(
        `SELECT d.id,d.appointment_id,d.display_name,d.document_type,d.clinical_date,d.mime_type,d.size_bytes,d.page_count,d.scan_status,d.extraction_status,d.retention_status,d.created_at,CASE WHEN d.owner_id=$1 THEN 'owner' ELSE 'granted' END access_type FROM documents d WHERE d.owner_id=$1 OR($2='doctor' AND EXISTS(SELECT 1 FROM document_access_grants g WHERE g.document_id=d.id AND g.doctor_id=$1 AND g.revoked_at IS NULL AND(g.expires_at IS NULL OR g.expires_at>now()))) ORDER BY d.created_at DESC`,
        [p.userId, p.role],
      );
      sendSuccess(res, { documents: rows.rows });
    } catch (e) {
      next(e);
    }
  });
  r.get("/documents/:id", auth, async (req, res, next) => {
    try {
      const p = (req as AuthenticatedRequest).auth,
        doc = await canRead(pool, req.params.id, p.userId, p.role);
      const grants =
        p.role === "patient"
          ? (
              await pool.query(
                `SELECT g.id,g.doctor_id,dp.display_name doctor_name,g.scope,g.purpose,g.consent_version,g.consented_at,g.expires_at,g.revoked_at,g.granted_at FROM document_access_grants g JOIN doctor_profiles dp ON dp.user_id=g.doctor_id WHERE g.document_id=$1 AND g.patient_id=$2 ORDER BY g.granted_at DESC`,
                [req.params.id, p.userId],
              )
            ).rows
          : [];
      sendSuccess(res, {
        document: {
          id: doc.id,
          appointment_id: doc.appointment_id,
          display_name: doc.display_name,
          document_type: doc.document_type,
          clinical_date: doc.clinical_date,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
          page_count: doc.page_count,
          scan_status: doc.scan_status,
          extraction_status: doc.extraction_status,
          retention_status: doc.retention_status,
          created_at: doc.created_at,
          access_type: doc.owner_id === p.userId ? "owner" : "granted",
        },
        grants,
      });
    } catch (e) {
      next(e);
    }
  });
  r.patch(
    "/documents/:id",
    auth,
    patient,
    validate(metadata),
    async (req, res, next) => {
      try {
        const owner = (req as AuthenticatedRequest).auth.userId,
          x = res.locals.validated.body;
        if (x.appointmentId) {
          const a = await pool.query(
            `SELECT 1 FROM appointments WHERE id=$1 AND patient_id=$2`,
            [x.appointmentId, owner],
          );
          if (!a.rowCount) throw apiErrors.privateNotFound();
        }
        const row = await pool.query(
          `UPDATE documents SET display_name=COALESCE($3,display_name),document_type=COALESCE($4,document_type),clinical_date=CASE WHEN $5::boolean THEN $6::date ELSE clinical_date END,appointment_id=CASE WHEN $7::boolean THEN $8::uuid ELSE appointment_id END WHERE id=$1 AND owner_id=$2 AND retention_status='active' RETURNING id,display_name,document_type,clinical_date,appointment_id`,
          [
            req.params.id,
            owner,
            x.displayName ? sanitizeFilename(x.displayName) : null,
            x.documentType ?? null,
            Object.hasOwn(x, "clinicalDate"),
            x.clinicalDate ?? null,
            Object.hasOwn(x, "appointmentId"),
            x.appointmentId ?? null,
          ],
        );
        if (!row.rows[0]) throw apiErrors.privateNotFound();
        sendSuccess(res, { document: row.rows[0] });
      } catch (e) {
        next(e);
      }
    },
  );
  r.delete("/documents/:id", auth, patient, async (req, res, next) => {
    try {
      const row = await pool.query(
        `UPDATE documents SET retention_status='deletion_requested' WHERE id=$1 AND owner_id=$2 AND retention_status='active' RETURNING id`,
        [req.params.id, (req as AuthenticatedRequest).auth.userId],
      );
      if (!row.rows[0]) throw apiErrors.privateNotFound();
      sendSuccess(res, { retentionStatus: "deletion_requested" }, 202);
    } catch (e) {
      next(e);
    }
  });
  r.post("/documents/:id/download-url", auth, async (req, res, next) => {
    try {
      const p = (req as AuthenticatedRequest).auth;
      await canRead(pool, req.params.id, p.userId, p.role, "download");
      const token = await new SignJWT({
        documentId: req.params.id,
        userId: p.userId,
        role: p.role,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setAudience("careorbit-document-download")
        .setExpirationTime(`${config.DOCUMENT_URL_TTL_SECONDS}s`)
        .sign(secret);
      sendSuccess(res, {
        url: `/api/v1/documents/${req.params.id}/content?token=${encodeURIComponent(token)}`,
        expiresIn: config.DOCUMENT_URL_TTL_SECONDS,
      });
    } catch (e) {
      next(e);
    }
  });
  r.get("/documents/:id/content", async (req, res, next) => {
    try {
      const verified = await jwtVerify(String(req.query.token ?? ""), secret, {
          audience: "careorbit-document-download",
          algorithms: ["HS256"],
        }),
        p = verified.payload;
      if (
        p.documentId !== req.params.id ||
        typeof p.userId !== "string" ||
        typeof p.role !== "string"
      )
        throw apiErrors.privateNotFound();
      const doc = await canRead(
          pool,
          req.params.id,
          p.userId,
          p.role,
          "download",
        ),
        data = await getDecrypted(doc.object_key);
      res
        .setHeader("cache-control", "private, no-store")
        .setHeader("content-security-policy", "default-src 'none'; sandbox")
        .type(doc.mime_type)
        .setHeader(
          "content-disposition",
          `inline; filename="${encodeURIComponent(doc.display_name)}"`,
        )
        .send(data);
    } catch (e) {
      next(e instanceof AppError ? e : apiErrors.privateNotFound());
    }
  });
  r.post(
    "/documents/:id/grants",
    auth,
    patient,
    validate(grant),
    async (req, res, next) => {
      try {
        const owner = (req as AuthenticatedRequest).auth.userId,
          x = res.locals.validated.body;
        if (x.expiresAt && new Date(x.expiresAt) <= new Date())
          throw new AppError(
            422,
            "EXPIRY_INVALID",
            "Grant expiry must be in the future",
          );
        const doctor = await pool.query(
          `SELECT 1 FROM users u JOIN doctor_profiles d ON d.user_id=u.id WHERE u.id=$1 AND u.status='active' AND d.verification_status='approved'`,
          [x.doctorId],
        );
        if (!doctor.rowCount) throw apiErrors.privateNotFound();
        if (x.appointmentId) {
          const related = await pool.query(
            `SELECT 1 FROM appointments WHERE id=$1 AND patient_id=$2 AND doctor_id=$3`,
            [x.appointmentId, owner, x.doctorId],
          );
          if (!related.rowCount) throw apiErrors.privateNotFound();
        }
        const row = await pool.query(
          `INSERT INTO document_access_grants(document_id,patient_id,doctor_id,appointment_id,scope,purpose,consent_version,expires_at) SELECT id,owner_id,$3,$4,$5,$6,$7,$8 FROM documents WHERE id=$1 AND owner_id=$2 AND scan_status='clean' AND retention_status='active' ON CONFLICT(document_id,doctor_id,scope,appointment_id) DO UPDATE SET purpose=EXCLUDED.purpose,consent_version=EXCLUDED.consent_version,expires_at=EXCLUDED.expires_at,revoked_at=NULL,consented_at=now(),granted_at=now() RETURNING id,doctor_id,scope,purpose,consent_version,consented_at,expires_at,revoked_at`,
          [
            req.params.id,
            owner,
            x.doctorId,
            x.appointmentId ?? null,
            x.scope,
            x.purpose,
            x.consentVersion,
            x.expiresAt ?? null,
          ],
        );
        if (!row.rows[0]) throw apiErrors.privateNotFound();
        sendSuccess(res, { grant: row.rows[0] }, 201);
      } catch (e) {
        next(e);
      }
    },
  );
  r.delete(
    "/documents/:id/grants/:grantId",
    auth,
    patient,
    async (req, res, next) => {
      try {
        const row = await pool.query(
          `UPDATE document_access_grants SET revoked_at=now() WHERE id=$1 AND document_id=$2 AND patient_id=$3 AND revoked_at IS NULL RETURNING id,revoked_at`,
          [
            req.params.grantId,
            req.params.id,
            (req as AuthenticatedRequest).auth.userId,
          ],
        );
        if (!row.rows[0]) throw apiErrors.privateNotFound();
        sendSuccess(res, { grant: row.rows[0] });
      } catch (e) {
        next(e);
      }
    },
  );
  r.post("/conversations/:id/attachments", auth, async (req, res, next) => {
    try {
      const p = (req as AuthenticatedRequest).auth,
        s = z
          .object({ messageId: z.uuid(), documentId: z.uuid() })
          .parse(req.body),
        conversation = await pool.query(
          `SELECT patient_id,doctor_id FROM conversations WHERE id=$1 AND($2=patient_id OR $2=doctor_id) AND status='active'`,
          [req.params.id, p.userId],
        );
      if (!conversation.rows[0]) throw apiErrors.privateNotFound();
      await canRead(pool, s.documentId, p.userId, p.role);
      const row = await pool.query(
        `INSERT INTO message_attachments(message_id,document_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM messages WHERE id=$1 AND conversation_id=$3 AND sender_id=$4) RETURNING id,message_id,document_id`,
        [s.messageId, s.documentId, req.params.id, p.userId],
      );
      if (!row.rows[0]) throw apiErrors.privateNotFound();
      sendSuccess(res, { attachment: row.rows[0], aiProcessing: false }, 201);
    } catch (e) {
      next(e);
    }
  });
  return r;
}

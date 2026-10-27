import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DownloadSimple,
  FileText,
  ShieldCheck,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { Badge, Button, Empty, SectionHead } from "./components";
import { listAppointments, type Appointment } from "./services/appointments";
import { getMyDoctors, type MyDoctor } from "./services/patient";
import {
  cancelUpload,
  completeUpload,
  downloadDocument,
  getDocument,
  grantDocument,
  initiateUpload,
  listDocuments,
  requestDelete,
  revokeGrant,
  updateDocument,
  uploadContent,
  type DocumentRecord,
  type Grant,
} from "./services/documents";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Request failed");
export function SecureDocuments() {
  const [items, setItems] = useState<DocumentRecord[] | null>(null),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null),
    load = () =>
      Promise.all([listDocuments(), listAppointments()])
        .then(([documents, visits]) => {
          setItems(documents);
          setAppointments(visits);
        })
        .catch((e) => setError(msg(e)));
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      file = f.get("file");
    if (!(file instanceof File) || !file.size) return;
    setError("");
    setProgress(0);
    abort.current = new AbortController();
    let activeUploadId = "";
    try {
      const start = await initiateUpload(file, {
        documentType: String(f.get("type")),
        clinicalDate: String(f.get("date") || "") || null,
        appointmentId: String(f.get("appointment") || "") || null,
      });
      activeUploadId = start.uploadId;
      await uploadContent(
        start.uploadUrl,
        file,
        setProgress,
        abort.current.signal,
      );
      setProgress(100);
      await completeUpload(start.uploadId);
      setProgress(null);
      e.currentTarget.reset();
      await load();
    } catch (x) {
      if (activeUploadId)
        await cancelUpload(activeUploadId).catch(() => undefined);
      setProgress(null);
      setError(msg(x));
    }
  }
  return (
    <div className="stack">
      <SectionHead
        title="Medical documents"
        subtitle="Encrypted private storage; uploads remain quarantined until validation and malware scanning pass."
      />
      <form className="panel settings-form" onSubmit={submit}>
        <label className="upload-zone">
          <UploadSimple />
          <strong>Select PDF, JPEG, or PNG</strong>
          <small>
            20 MB maximum · PDF maximum 50 pages · encrypted PDFs are rejected
          </small>
          <input
            name="file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Document type
            <input name="type" defaultValue="Medical record" required />
          </label>
          <label>
            Clinical date
            <input name="date" type="date" />
          </label>
          <label>
            Related appointment
            <select name="appointment">
              <option value="">None</option>
              {appointments.map((appointment) => (
                <option value={appointment.id} key={appointment.id}>
                  {appointment.doctor_name} · {new Date(appointment.starts_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
        </div>
        {progress !== null ? (
          <div role="status">
            <progress value={progress} max="100" /> {progress}%{" "}
            <Button
              type="button"
              variant="danger"
              onClick={() => abort.current?.abort()}
            >
              Cancel
            </Button>
          </div>
        ) : null}
        <Button type="submit">Upload securely</Button>
        {error ? (
          <div className="form-error" role="alert">
            {error}{" "}
            <button type="button" onClick={load}>
              Retry
            </button>
          </div>
        ) : null}
      </form>
      {items === null ? (
        <section className="panel" aria-busy="true">
          Loading documents…
        </section>
      ) : items.length ? (
        <div className="document-grid">
          {items.map((d) => (
            <Link
              className="document-card"
              to={`/app/documents/${d.id}`}
              key={d.id}
            >
              <div>
                <FileText />
                <Badge status={d.scan_status} />
              </div>
              <h3>{d.display_name}</h3>
              <p>
                {d.document_type} · {(d.size_bytes / 1024).toFixed(1)} KB
              </p>
              <footer>
                <span>{d.retention_status}</span>
                <span>{new Date(d.created_at).toLocaleDateString()}</span>
              </footer>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No documents"
          text="Your private uploads will appear here after scanning."
        />
      )}
    </div>
  );
}
export function SecureDocumentDetail() {
  const { id = "" } = useParams(),
    [doc, setDoc] = useState<DocumentRecord | null>(null),
    [grants, setGrants] = useState<Grant[]>([]),
    [doctors, setDoctors] = useState<MyDoctor[]>([]),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [error, setError] = useState("");
  const load = () =>
    Promise.all([getDocument(id), getMyDoctors(), listAppointments()])
      .then(([x, d, visits]) => {
        setDoc(x.document);
        setGrants(x.grants);
        setDoctors(d);
        setAppointments(visits);
      })
      .catch((e) => setError(msg(e)));
  useEffect(() => {
    void load();
  }, [id]);
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await updateDocument(id, {
        displayName: f.get("name"),
        documentType: f.get("type"),
        clinicalDate: f.get("date") || null,
        appointmentId: f.get("appointment") || null,
      });
      await load();
    } catch (x) {
      setError(msg(x));
    }
  }
  async function share(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await grantDocument(id, {
        doctorId: f.get("doctor"),
        appointmentId: null,
        scope: f.get("scope"),
        purpose: f.get("purpose"),
        expiresAt: f.get("expires")
          ? new Date(String(f.get("expires"))).toISOString()
          : null,
        consentVersion: "document-sharing-v1",
      });
      await load();
    } catch (x) {
      setError(msg(x));
    }
  }
  if (error && !doc)
    return (
      <section className="panel form-error" role="alert">
        {error} <button onClick={load}>Retry</button>
      </section>
    );
  if (!doc)
    return (
      <section className="panel" aria-busy="true">
        Loading secure document…
      </section>
    );
  return (
    <div className="stack">
      <Link to="/app/documents">← Documents</Link>
      <div className="detail-head">
        <div>
          <span className="eyebrow">{doc.document_type}</span>
          <h2>{doc.display_name}</h2>
          <p>
            {doc.mime_type} · {doc.scan_status} · {doc.retention_status}
          </p>
        </div>
        <div className="button-row">
          <Button
            variant="secondary"
            onClick={() => downloadDocument(id).catch((e) => setError(msg(e)))}
          >
            <DownloadSimple /> Protected preview
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              requestDelete(id)
                .then(load)
                .catch((e) => setError(msg(e)))
            }
          >
            <Trash /> Request deletion
          </Button>
        </div>
      </div>
      {error ? <div className="form-error">{error}</div> : null}
      <div className="content-grid">
        <form className="panel settings-form" onSubmit={edit}>
          <h3>Metadata</h3>
          <label>
            Display name
            <input name="name" defaultValue={doc.display_name} />
          </label>
          <label>
            Type
            <input name="type" defaultValue={doc.document_type} />
          </label>
          <label>
            Clinical date
            <input
              name="date"
              type="date"
              defaultValue={doc.clinical_date ?? ""}
            />
          </label>
          <label>
            Related appointment
            <select name="appointment" defaultValue={doc.appointment_id ?? ""}>
              <option value="">None</option>
              {appointments.map((appointment) => (
                <option value={appointment.id} key={appointment.id}>
                  {appointment.doctor_name} · {new Date(appointment.starts_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <Button>Save metadata</Button>
        </form>
        <form className="panel settings-form" onSubmit={share}>
          <h3>
            <ShieldCheck /> Grant access
          </h3>
          <label>
            Doctor
            <select name="doctor" required>
              <option value="">Select a care relationship</option>
              {doctors.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scope
            <select name="scope">
              <option value="view">View</option>
              <option value="download">Download</option>
              <option value="encounter">Encounter</option>
            </select>
          </label>
          <label>
            Purpose
            <input name="purpose" defaultValue="Appointment care" required />
          </label>
          <label>
            Optional expiry
            <input name="expires" type="datetime-local" />
          </label>
          <Button>Grant with consent</Button>
        </form>
      </div>
      <section className="panel">
        <SectionHead
          title="Access grants"
          subtitle="Revocation blocks all new previews and signed links immediately."
        />
        {grants.length ? (
          grants.map((g) => (
            <div className="permission-row" key={g.id}>
              <div>
                <ShieldCheck />
                <span>
                  <strong>{g.doctor_name}</strong>
                  <small>
                    {g.scope} · {g.purpose} ·{" "}
                    {g.expires_at
                      ? `expires ${new Date(g.expires_at).toLocaleString()}`
                      : "no expiry"}{" "}
                    {g.revoked_at ? "· revoked" : ""}
                  </small>
                </span>
              </div>
              {!g.revoked_at ? (
                <Button
                  variant="danger"
                  onClick={() =>
                    revokeGrant(id, g.id)
                      .then(load)
                      .catch((e) => setError(msg(e)))
                  }
                >
                  Revoke
                </Button>
              ) : (
                <Badge status="revoked" />
              )}
            </div>
          ))
        ) : (
          <Empty
            title="Private to you"
            text="No doctor currently has access."
          />
        )}
      </section>
    </div>
  );
}

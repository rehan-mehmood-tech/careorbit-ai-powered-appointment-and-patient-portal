exports.up=pgm=>pgm.sql(`
 CREATE TABLE document_uploads(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,display_name text NOT NULL,document_type text NOT NULL,clinical_date date,appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  expected_mime text NOT NULL CHECK(expected_mime IN('application/pdf','image/jpeg','image/png')),expected_size bigint NOT NULL CHECK(expected_size BETWEEN 1 AND 20971520),
  token_hash char(64) NOT NULL UNIQUE,status text NOT NULL DEFAULT 'initiated' CHECK(status IN('initiated','uploaded','completed','failed','cancelled','expired')),
  expires_at timestamptz NOT NULL,uploaded_at timestamptz,completed_at timestamptz,failure_code text,created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE INDEX document_uploads_owner_idx ON document_uploads(patient_id,created_at DESC);
 CREATE INDEX document_uploads_expiry_idx ON document_uploads(expires_at) WHERE status IN('initiated','uploaded');
 ALTER TABLE document_access_grants ADD COLUMN consented_at timestamptz NOT NULL DEFAULT now();
`);
exports.down=pgm=>pgm.sql(`ALTER TABLE document_access_grants DROP COLUMN consented_at;DROP TABLE document_uploads;`);

exports.up=pgm=>pgm.sql(`
 CREATE TABLE patient_data_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
  request_type text NOT NULL CHECK(request_type IN('export','deletion')),status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','ready','completed','rejected')),
  reason text,retention_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,requested_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
  CHECK(completed_at IS NULL OR completed_at>=requested_at)
 );
 CREATE INDEX patient_data_requests_patient_idx ON patient_data_requests(patient_id,requested_at DESC);
 CREATE TABLE phone_verification_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE CASCADE,token_hash char(64) NOT NULL UNIQUE,phone text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX phone_verification_active_idx ON phone_verification_tokens(user_id,expires_at) WHERE used_at IS NULL;
`);
exports.down=pgm=>pgm.sql(`DROP TABLE phone_verification_tokens;DROP TABLE patient_data_requests;`);

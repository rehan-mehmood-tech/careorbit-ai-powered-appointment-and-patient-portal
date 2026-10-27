exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE TABLE payment_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
      provider text NOT NULL,
      provider_reference text UNIQUE,
      idempotency_key text NOT NULL UNIQUE,
      amount_minor integer NOT NULL CHECK (amount_minor >= 0),
      currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      status text NOT NULL CHECK (status IN ('hold','pending','paid','failed','expired','refunded','manual_review')),
      hold_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE payment_webhook_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider text NOT NULL,
      provider_event_id text NOT NULL,
      signature_verified boolean NOT NULL DEFAULT false,
      event_type text NOT NULL,
      payment_attempt_id uuid REFERENCES payment_attempts(id) ON DELETE RESTRICT,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      processing_error_code text,
      UNIQUE (provider, provider_event_id)
    );

    CREATE TABLE payment_refunds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_attempt_id uuid NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
      provider_reference text UNIQUE,
      amount_minor integer NOT NULL CHECK (amount_minor > 0),
      reason text NOT NULL,
      status text NOT NULL CHECK (status IN ('pending','succeeded','failed','manual_review')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE calendar_connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      provider text NOT NULL CHECK (provider IN ('google','microsoft')),
      encrypted_access_token bytea NOT NULL,
      encrypted_refresh_token bytea,
      token_expires_at timestamptz,
      status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','revoked','error')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, provider)
    );

    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id uuid NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
      appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
      provider_event_id text,
      status text NOT NULL CHECK (status IN ('pending','synced','cancelled','failed')),
      last_synced_at timestamptz,
      last_error_code text,
      UNIQUE (connection_id, appointment_id)
    );

    CREATE TABLE video_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
      provider text NOT NULL,
      provider_room_reference text NOT NULL UNIQUE,
      status text NOT NULL CHECK (status IN ('created','waiting','active','ended','failed')),
      recording_enabled boolean NOT NULL DEFAULT false CHECK (recording_enabled = false),
      starts_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE prescriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
      patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      prescriber_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','superseded','void')),
      current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
      issued_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((status = 'issued' AND issued_at IS NOT NULL) OR status <> 'issued')
    );

    CREATE TABLE prescription_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
      version_number integer NOT NULL CHECK (version_number >= 1),
      medication text NOT NULL,
      dose text NOT NULL,
      route text NOT NULL,
      frequency text NOT NULL,
      duration text NOT NULL,
      instructions text,
      amendment_reason text,
      authored_by uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (prescription_id, version_number)
    );

    CREATE TABLE analytics_daily_aggregates (
      metric_date date NOT NULL,
      metric_name text NOT NULL,
      dimension_key text NOT NULL DEFAULT 'all',
      metric_value numeric NOT NULL,
      cohort_definition text NOT NULL,
      generated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (metric_date, metric_name, dimension_key)
    );

    CREATE TRIGGER prescription_versions_immutable BEFORE UPDATE OR DELETE ON prescription_versions
      FOR EACH ROW EXECUTE FUNCTION careorbit_reject_mutation();
    CREATE TRIGGER payment_attempts_touch BEFORE UPDATE ON payment_attempts
      FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER payment_refunds_touch BEFORE UPDATE ON payment_refunds
      FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER calendar_connections_touch BEFORE UPDATE ON calendar_connections
      FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();

    CREATE INDEX payment_attempts_status_idx ON payment_attempts(status, hold_expires_at);
    CREATE INDEX payment_webhooks_pending_idx ON payment_webhook_events(processed_at, received_at) WHERE processed_at IS NULL;
    CREATE INDEX calendar_events_status_idx ON calendar_events(status, last_synced_at);
    CREATE INDEX prescriptions_patient_idx ON prescriptions(patient_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TABLE IF EXISTS analytics_daily_aggregates, prescription_versions, prescriptions, video_sessions,
      calendar_events, calendar_connections, payment_refunds, payment_webhook_events, payment_attempts CASCADE;
  `);
};

/* eslint-disable camelcase */
exports.up = (pgm) => {
  pgm.sql(String.raw`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    CREATE FUNCTION careorbit_valid_timezone(value text) RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE AS $$
      SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = value);
    $$;

    CREATE FUNCTION careorbit_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $$;

    CREATE FUNCTION careorbit_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END;
    $$;

    CREATE FUNCTION careorbit_safe_operational_json(value jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
      SELECT value IS NULL OR value::text !~* '"(body|content|clinical_body|document_text|chat_body|message_body|note_body|raw_text)"\s*:';
    $$;

    CREATE FUNCTION careorbit_enforce_profile_role() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE actual_role text;
    BEGIN
      SELECT role INTO actual_role FROM users WHERE id = NEW.user_id;
      IF actual_role IS DISTINCT FROM TG_ARGV[0] THEN
        RAISE EXCEPTION 'user role % cannot create % profile', actual_role, TG_ARGV[0] USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
      password_hash text NOT NULL CHECK (length(password_hash) >= 60),
      role text NOT NULL CHECK (role IN ('patient','doctor','admin')),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','closed')),
      email_verified_at timestamptz,
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized),
      CONSTRAINT users_email_trimmed CHECK (email = btrim(email) AND length(email) BETWEEN 3 AND 320)
    );

    CREATE TABLE sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash text NOT NULL UNIQUE,
      family_id uuid NOT NULL,
      user_agent text,
      ip_hash text,
      expires_at timestamptz NOT NULL,
      rotated_at timestamptz,
      revoked_at timestamptz,
      revocation_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expires_at > created_at)
    );

    CREATE TABLE email_verification_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expires_at > created_at)
    );

    CREATE TABLE password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expires_at > created_at)
    );

    CREATE TABLE patient_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
      display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
      phone text,
      phone_verified_at timestamptz,
      date_of_birth date,
      timezone text NOT NULL DEFAULT 'Asia/Karachi' CHECK (careorbit_valid_timezone(timezone)),
      demographics jsonb NOT NULL DEFAULT '{}'::jsonb,
      allergies text[] NOT NULL DEFAULT '{}',
      relevant_history text,
      communication_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE doctor_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
      display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
      biography text,
      qualifications text[] NOT NULL DEFAULT '{}',
      years_experience integer NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 80),
      registration_number text,
      public_photo_key text,
      verification_status text NOT NULL DEFAULT 'not_submitted' CHECK (verification_status IN ('not_submitted','pending','approved','rejected','suspended')),
      verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE specialties (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      name text NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE languages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE CHECK (code ~ '^[a-z]{2,3}(?:-[A-Z]{2})?$'),
      name text NOT NULL UNIQUE
    );

    CREATE TABLE doctor_specialties (
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE CASCADE,
      specialty_id uuid NOT NULL REFERENCES specialties(id) ON DELETE RESTRICT,
      is_primary boolean NOT NULL DEFAULT false,
      PRIMARY KEY (doctor_id, specialty_id)
    );
    CREATE UNIQUE INDEX doctor_one_primary_specialty_idx ON doctor_specialties(doctor_id) WHERE is_primary;

    CREATE TABLE doctor_languages (
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE CASCADE,
      language_id uuid NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
      PRIMARY KEY (doctor_id, language_id)
    );

    CREATE TABLE clinics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      address_line1 text NOT NULL,
      address_line2 text,
      city text NOT NULL,
      country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
      timezone text NOT NULL CHECK (careorbit_valid_timezone(timezone)),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE doctor_clinics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE CASCADE,
      clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
      consultation_mode text NOT NULL CHECK (consultation_mode IN ('in_person','video')),
      fee_minor integer NOT NULL CHECK (fee_minor >= 0),
      currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (doctor_id, clinic_id, consultation_mode),
      UNIQUE (id, doctor_id)
    );

    CREATE TABLE doctor_verification_applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
      registration_number_snapshot text NOT NULL,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      reviewed_at timestamptz,
      review_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((status = 'pending' AND reviewed_at IS NULL) OR status <> 'pending')
    );

    CREATE TABLE doctor_verification_artifacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id uuid NOT NULL REFERENCES doctor_verification_applications(id) ON DELETE CASCADE,
      object_key text NOT NULL UNIQUE,
      mime_type text NOT NULL,
      size_bytes bigint NOT NULL CHECK (size_bytes > 0),
      sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','quarantined','rejected')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE availability_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_clinic_id uuid NOT NULL REFERENCES doctor_clinics(id) ON DELETE CASCADE,
      timezone text NOT NULL CHECK (careorbit_valid_timezone(timezone)),
      weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      local_start time NOT NULL,
      local_end time NOT NULL,
      effective_from date NOT NULL,
      effective_to date,
      appointment_minutes integer NOT NULL CHECK (appointment_minutes BETWEEN 5 AND 480),
      buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 240),
      buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 240),
      minimum_notice_minutes integer NOT NULL DEFAULT 0 CHECK (minimum_notice_minutes >= 0),
      booking_horizon_days integer NOT NULL DEFAULT 90 CHECK (booking_horizon_days BETWEEN 1 AND 730),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (local_end > local_start),
      CHECK (effective_to IS NULL OR effective_to >= effective_from)
    );

    CREATE TABLE availability_exceptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE CASCADE,
      doctor_clinic_id uuid,
      exception_type text NOT NULL CHECK (exception_type IN ('unavailable','available_override','break','leave')),
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      timezone text NOT NULL CHECK (careorbit_valid_timezone(timezone)),
      reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at),
      FOREIGN KEY (doctor_clinic_id, doctor_id) REFERENCES doctor_clinics(id, doctor_id) ON DELETE CASCADE
    );

    CREATE TABLE appointments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      doctor_clinic_id uuid NOT NULL REFERENCES doctor_clinics(id) ON DELETE RESTRICT,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      timezone text NOT NULL CHECK (careorbit_valid_timezone(timezone)),
      buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 240),
      buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 240),
      occupied_at tstzrange NOT NULL,
      patient_interval tstzrange NOT NULL,
      status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','declined','no_show')),
      mode text NOT NULL CHECK (mode IN ('in_person','video')),
      fee_minor integer NOT NULL CHECK (fee_minor >= 0),
      currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      visit_reason text NOT NULL CHECK (length(btrim(visit_reason)) BETWEEN 2 AND 1000),
      policy_snapshot jsonb NOT NULL,
      idempotency_key text NOT NULL,
      rescheduled_from_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
      confirmation_deadline_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at),
      UNIQUE (patient_id, idempotency_key),
      UNIQUE (id, patient_id, doctor_id),
      FOREIGN KEY (doctor_clinic_id, doctor_id) REFERENCES doctor_clinics(id, doctor_id) ON DELETE RESTRICT,
      CONSTRAINT appointments_doctor_no_overlap EXCLUDE USING gist (doctor_id WITH =, occupied_at WITH &&)
        WHERE (status IN ('scheduled','confirmed')) DEFERRABLE INITIALLY IMMEDIATE,
      CONSTRAINT appointments_patient_no_overlap EXCLUDE USING gist (patient_id WITH =, patient_interval WITH &&)
        WHERE (status IN ('scheduled','confirmed')) DEFERRABLE INITIALLY IMMEDIATE
    );

    CREATE FUNCTION careorbit_set_appointment_ranges() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      NEW.occupied_at = tstzrange(
        NEW.starts_at - NEW.buffer_before_minutes * interval '1 minute',
        NEW.ends_at + NEW.buffer_after_minutes * interval '1 minute', '[)');
      NEW.patient_interval = tstzrange(NEW.starts_at, NEW.ends_at, '[)');
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER appointments_set_ranges BEFORE INSERT OR UPDATE OF starts_at, ends_at, buffer_before_minutes, buffer_after_minutes ON appointments
      FOR EACH ROW EXECUTE FUNCTION careorbit_set_appointment_ranges();

    CREATE FUNCTION careorbit_validate_appointment_transition() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status = OLD.status THEN RETURN NEW; END IF;
      IF OLD.status IN ('completed','cancelled','declined','no_show') THEN
        RAISE EXCEPTION 'terminal appointment status % cannot transition', OLD.status USING ERRCODE = '23514';
      END IF;
      IF OLD.status = 'scheduled' AND NEW.status NOT IN ('confirmed','cancelled','declined') THEN
        RAISE EXCEPTION 'invalid appointment transition % to %', OLD.status, NEW.status USING ERRCODE = '23514';
      END IF;
      IF OLD.status = 'confirmed' AND NEW.status NOT IN ('completed','cancelled','no_show') THEN
        RAISE EXCEPTION 'invalid appointment transition % to %', OLD.status, NEW.status USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE FUNCTION careorbit_guard_appointment_identity() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.patient_id, NEW.doctor_id, NEW.doctor_clinic_id, NEW.starts_at, NEW.ends_at, NEW.timezone,
          NEW.buffer_before_minutes, NEW.buffer_after_minutes, NEW.mode, NEW.fee_minor, NEW.currency,
          NEW.policy_snapshot, NEW.idempotency_key, NEW.rescheduled_from_id)
         IS DISTINCT FROM
         (OLD.patient_id, OLD.doctor_id, OLD.doctor_clinic_id, OLD.starts_at, OLD.ends_at, OLD.timezone,
          OLD.buffer_before_minutes, OLD.buffer_after_minutes, OLD.mode, OLD.fee_minor, OLD.currency,
          OLD.policy_snapshot, OLD.idempotency_key, OLD.rescheduled_from_id) THEN
        RAISE EXCEPTION 'appointment identity and snapshots are immutable; create a linked reschedule' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER appointments_transition_guard BEFORE UPDATE OF status ON appointments
      FOR EACH ROW EXECUTE FUNCTION careorbit_validate_appointment_transition();
    CREATE TRIGGER appointments_identity_guard BEFORE UPDATE ON appointments
      FOR EACH ROW EXECUTE FUNCTION careorbit_guard_appointment_identity();

    CREATE TABLE appointment_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
      event_type text NOT NULL CHECK (event_type IN ('created','confirmed','cancelled','declined','completed','no_show','rescheduled','expired','corrected')),
      from_status text,
      to_status text,
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      reason text,
      policy_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER appointment_events_immutable BEFORE UPDATE OR DELETE ON appointment_events
      FOR EACH ROW EXECUTE FUNCTION careorbit_reject_mutation();

    CREATE TABLE documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
      object_key text NOT NULL UNIQUE,
      display_name text NOT NULL,
      document_type text NOT NULL,
      clinical_date date,
      mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
      size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
      page_count integer CHECK (page_count BETWEEN 1 AND 50),
      sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','quarantined','rejected','failed')),
      extraction_status text NOT NULL DEFAULT 'not_requested' CHECK (extraction_status IN ('not_requested','queued','extracting','completed','needs_review','failed')),
      retention_status text NOT NULL DEFAULT 'active' CHECK (retention_status IN ('active','deletion_requested','retained','deleted')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, owner_id)
    );

    CREATE TABLE document_access_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
      scope text NOT NULL CHECK (scope IN ('view','download','encounter')),
      purpose text NOT NULL,
      consent_version text NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz,
      revoked_at timestamptz,
      UNIQUE (document_id, doctor_id, scope, appointment_id),
      FOREIGN KEY (document_id, patient_id) REFERENCES documents(id, owner_id) ON DELETE CASCADE,
      FOREIGN KEY (appointment_id, patient_id, doctor_id) REFERENCES appointments(id, patient_id, doctor_id) ON DELETE RESTRICT,
      CHECK (expires_at IS NULL OR expires_at > granted_at)
    );

    CREATE TABLE ai_consents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      document_id uuid REFERENCES documents(id) ON DELETE RESTRICT,
      purpose text NOT NULL,
      provider text NOT NULL,
      consent_version text NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      withdrawn_at timestamptz,
      UNIQUE (patient_id, document_id, purpose, consent_version)
    );

    CREATE TABLE ai_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      consent_id uuid NOT NULL REFERENCES ai_consents(id) ON DELETE RESTRICT,
      state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','extracting','processing','completed','needs_review','failed','cancelled')),
      input_sha256 char(64) NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
      next_attempt_at timestamptz,
      locked_at timestamptz,
      locked_by text,
      last_error_code text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (document_id, input_sha256, consent_id)
    );

    CREATE TABLE ai_summaries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ai_job_id uuid NOT NULL UNIQUE REFERENCES ai_jobs(id) ON DELETE RESTRICT,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      schema_version text NOT NULL,
      model_version text NOT NULL,
      prompt_version text NOT NULL,
      structured_output jsonb NOT NULL,
      source_references jsonb NOT NULL,
      limitations text[] NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ai_summary_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      summary_id uuid NOT NULL REFERENCES ai_summaries(id) ON DELETE RESTRICT,
      reviewer_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      status text NOT NULL CHECK (status IN ('reviewed','needs_correction')),
      annotation text,
      reviewed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (summary_id, reviewer_id)
    );

    CREATE TABLE encounters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      opened_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (closed_at IS NULL OR closed_at >= opened_at),
      FOREIGN KEY (appointment_id, patient_id, doctor_id) REFERENCES appointments(id, patient_id, doctor_id) ON DELETE RESTRICT
    );

    CREATE TABLE notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
      author_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      visibility text NOT NULL CHECK (visibility IN ('provider_private','patient_visible')),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
      finalized_at timestamptz,
      current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((status = 'draft' AND finalized_at IS NULL) OR (status = 'final' AND finalized_at IS NOT NULL))
    );

    CREATE TABLE note_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id uuid NOT NULL REFERENCES notes(id) ON DELETE RESTRICT,
      version_number integer NOT NULL CHECK (version_number >= 1),
      body text NOT NULL,
      amendment_reason text,
      authored_by uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (note_id, version_number)
    );
    CREATE TRIGGER note_versions_immutable BEFORE UPDATE OR DELETE ON note_versions
      FOR EACH ROW EXECUTE FUNCTION careorbit_reject_mutation();

    CREATE TABLE conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE RESTRICT,
      doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT,
      eligibility_appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','read_only','closed')),
      last_message_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (patient_id, doctor_id),
      FOREIGN KEY (eligibility_appointment_id, patient_id, doctor_id) REFERENCES appointments(id, patient_id, doctor_id) ON DELETE RESTRICT
    );

    CREATE TABLE messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      client_message_id text NOT NULL,
      body text,
      sent_at timestamptz NOT NULL DEFAULT now(),
      edited_at timestamptz,
      UNIQUE (conversation_id, client_message_id),
      CHECK (body IS NULL OR length(body) BETWEEN 1 AND 5000)
    );

    CREATE TABLE message_attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (message_id, document_id)
    );

    CREATE TABLE message_receipts (
      message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      delivered_at timestamptz,
      read_at timestamptz,
      PRIMARY KEY (message_id, recipient_id),
      CHECK (read_at IS NULL OR delivered_at IS NOT NULL),
      CHECK (read_at IS NULL OR read_at >= delivered_at)
    );

    CREATE TABLE notification_preferences (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      timezone text NOT NULL DEFAULT 'Asia/Karachi' CHECK (careorbit_valid_timezone(timezone)),
      in_app_enabled boolean NOT NULL DEFAULT true,
      email_enabled boolean NOT NULL DEFAULT false,
      sms_enabled boolean NOT NULL DEFAULT false,
      reminder_enabled boolean NOT NULL DEFAULT true,
      quiet_hours_start time,
      quiet_hours_end time,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((quiet_hours_start IS NULL) = (quiet_hours_end IS NULL))
    );

    CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      event_id text NOT NULL,
      kind text NOT NULL,
      title text NOT NULL,
      safe_preview text,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (recipient_id, event_id, kind)
    );

    CREATE TABLE durable_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type text NOT NULL,
      dedup_key text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled','expired')),
      payload jsonb NOT NULL CHECK (careorbit_safe_operational_json(payload)),
      scheduled_at timestamptz NOT NULL,
      expires_at timestamptz,
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 50),
      next_attempt_at timestamptz,
      locked_at timestamptz,
      locked_by text,
      last_error_code text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expires_at IS NULL OR expires_at > scheduled_at)
    );

    CREATE TABLE notification_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE RESTRICT,
      job_id uuid REFERENCES durable_jobs(id) ON DELETE SET NULL,
      channel text NOT NULL CHECK (channel IN ('in_app','email','sms','push')),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','expired','cancelled')),
      provider_message_id text,
      attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
      error_code text,
      attempted_at timestamptz,
      delivered_at timestamptz,
      UNIQUE (notification_id, channel, attempt_number)
    );

    CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      action text NOT NULL,
      resource_type text NOT NULL,
      resource_id uuid,
      reason text,
      request_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (careorbit_safe_operational_json(metadata)),
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION careorbit_reject_mutation();

    CREATE INDEX sessions_user_active_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
    CREATE INDEX verification_tokens_user_idx ON email_verification_tokens(user_id, expires_at) WHERE used_at IS NULL;
    CREATE INDEX reset_tokens_user_idx ON password_reset_tokens(user_id, expires_at) WHERE used_at IS NULL;
    CREATE INDEX doctor_profiles_discovery_idx ON doctor_profiles(verification_status, years_experience DESC);
    CREATE INDEX doctor_specialties_specialty_idx ON doctor_specialties(specialty_id, doctor_id);
    CREATE INDEX doctor_languages_language_idx ON doctor_languages(language_id, doctor_id);
    CREATE INDEX clinics_city_active_idx ON clinics(city, active);
    CREATE INDEX doctor_clinics_fee_idx ON doctor_clinics(fee_minor, currency) WHERE active;
    CREATE INDEX verification_applications_status_idx ON doctor_verification_applications(status, submitted_at);
    CREATE INDEX availability_rules_lookup_idx ON availability_rules(doctor_clinic_id, weekday, effective_from, effective_to) WHERE active;
    CREATE INDEX availability_exceptions_doctor_time_idx ON availability_exceptions(doctor_id, starts_at, ends_at);
    CREATE INDEX appointments_doctor_time_status_idx ON appointments(doctor_id, starts_at, status);
    CREATE INDEX appointments_patient_time_status_idx ON appointments(patient_id, starts_at, status);
    CREATE INDEX appointments_status_start_idx ON appointments(status, starts_at);
    CREATE INDEX appointment_events_timeline_idx ON appointment_events(appointment_id, occurred_at, id);
    CREATE INDEX documents_owner_created_idx ON documents(owner_id, created_at DESC);
    CREATE INDEX documents_scan_extract_idx ON documents(scan_status, extraction_status, created_at);
    CREATE INDEX document_grants_doctor_idx ON document_access_grants(doctor_id, document_id, expires_at) WHERE revoked_at IS NULL;
    CREATE INDEX ai_jobs_due_idx ON ai_jobs(state, next_attempt_at, created_at) WHERE state IN ('queued','failed');
    CREATE INDEX encounters_doctor_patient_idx ON encounters(doctor_id, patient_id, opened_at DESC);
    CREATE INDEX note_versions_note_idx ON note_versions(note_id, version_number DESC);
    CREATE INDEX conversations_doctor_activity_idx ON conversations(doctor_id, last_message_at DESC);
    CREATE INDEX conversations_patient_activity_idx ON conversations(patient_id, last_message_at DESC);
    CREATE INDEX messages_cursor_idx ON messages(conversation_id, sent_at DESC, id DESC);
    CREATE INDEX notifications_recipient_idx ON notifications(recipient_id, read_at, created_at DESC);
    CREATE INDEX durable_jobs_due_idx ON durable_jobs(status, next_attempt_at, scheduled_at) WHERE status IN ('queued','failed');
    CREATE INDEX audit_events_resource_idx ON audit_events(resource_type, resource_id, occurred_at DESC);
    CREATE INDEX audit_events_actor_idx ON audit_events(actor_id, occurred_at DESC);

    CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER patient_profile_role_guard BEFORE INSERT OR UPDATE OF user_id ON patient_profiles
      FOR EACH ROW EXECUTE FUNCTION careorbit_enforce_profile_role('patient');
    CREATE TRIGGER doctor_profile_role_guard BEFORE INSERT OR UPDATE OF user_id ON doctor_profiles
      FOR EACH ROW EXECUTE FUNCTION careorbit_enforce_profile_role('doctor');
    CREATE TRIGGER patient_profiles_touch BEFORE UPDATE ON patient_profiles FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER doctor_profiles_touch BEFORE UPDATE ON doctor_profiles FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER clinics_touch BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER availability_rules_touch BEFORE UPDATE ON availability_rules FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER appointments_touch BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER documents_touch BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER ai_jobs_touch BEFORE UPDATE ON ai_jobs FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER notes_touch BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
    CREATE TRIGGER durable_jobs_touch BEFORE UPDATE ON durable_jobs FOR EACH ROW EXECUTE FUNCTION careorbit_touch_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(String.raw`
    DROP TABLE IF EXISTS audit_events, notification_deliveries, durable_jobs, notifications, notification_preferences,
      message_receipts, message_attachments, messages, conversations, note_versions, notes, encounters,
      ai_summary_reviews, ai_summaries, ai_jobs, ai_consents, document_access_grants, documents,
      appointment_events, appointments, availability_exceptions, availability_rules,
      doctor_verification_artifacts, doctor_verification_applications, doctor_clinics, clinics,
      doctor_languages, doctor_specialties, languages, specialties, doctor_profiles, patient_profiles,
      password_reset_tokens, email_verification_tokens, sessions, users CASCADE;
    DROP FUNCTION IF EXISTS careorbit_validate_appointment_transition();
    DROP FUNCTION IF EXISTS careorbit_guard_appointment_identity();
    DROP FUNCTION IF EXISTS careorbit_set_appointment_ranges();
    DROP FUNCTION IF EXISTS careorbit_enforce_profile_role();
    DROP FUNCTION IF EXISTS careorbit_safe_operational_json(jsonb);
    DROP FUNCTION IF EXISTS careorbit_reject_mutation();
    DROP FUNCTION IF EXISTS careorbit_touch_updated_at();
    DROP FUNCTION IF EXISTS careorbit_valid_timezone(text);
  `);
};

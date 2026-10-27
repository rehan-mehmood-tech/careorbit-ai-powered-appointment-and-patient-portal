exports.up = pgm => pgm.sql(`
  CREATE TABLE appointment_slot_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id uuid NOT NULL REFERENCES doctor_profiles(user_id) ON DELETE CASCADE,
    patient_id uuid NOT NULL REFERENCES patient_profiles(user_id) ON DELETE CASCADE,
    doctor_clinic_id uuid NOT NULL REFERENCES doctor_clinics(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_before_minutes BETWEEN 0 AND 240),
    buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_after_minutes BETWEEN 0 AND 240),
    doctor_interval tstzrange NOT NULL,
    patient_interval tstzrange NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK(ends_at>starts_at), CHECK(expires_at>created_at),
    FOREIGN KEY(doctor_clinic_id,doctor_id) REFERENCES doctor_clinics(id,doctor_id) ON DELETE CASCADE
  );
  CREATE FUNCTION careorbit_set_hold_ranges() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    NEW.doctor_interval=tstzrange(NEW.starts_at-NEW.buffer_before_minutes*interval '1 minute',NEW.ends_at+NEW.buffer_after_minutes*interval '1 minute','[)');
    NEW.patient_interval=tstzrange(NEW.starts_at,NEW.ends_at,'[)'); RETURN NEW; END $$;
  CREATE TRIGGER slot_holds_set_ranges BEFORE INSERT OR UPDATE OF starts_at,ends_at,buffer_before_minutes,buffer_after_minutes ON appointment_slot_holds FOR EACH ROW EXECUTE FUNCTION careorbit_set_hold_ranges();
  ALTER TABLE appointment_slot_holds ADD CONSTRAINT active_hold_doctor_no_overlap EXCLUDE USING gist(doctor_id WITH =,doctor_interval WITH &&) WHERE(expires_at>'2000-01-01');
  ALTER TABLE appointment_slot_holds ADD CONSTRAINT active_hold_patient_no_overlap EXCLUDE USING gist(patient_id WITH =,patient_interval WITH &&) WHERE(expires_at>'2000-01-01');
  CREATE INDEX slot_holds_expiry_idx ON appointment_slot_holds(expires_at);

  ALTER TABLE availability_exceptions ADD CONSTRAINT availability_exception_clinic_required
    CHECK(exception_type<>'available_override' OR doctor_clinic_id IS NOT NULL);
  ALTER TABLE availability_rules ADD CONSTRAINT availability_rule_no_midnight_crossing CHECK(local_end>local_start);
`);
exports.down = pgm => pgm.sql(`
  ALTER TABLE availability_rules DROP CONSTRAINT availability_rule_no_midnight_crossing;
  ALTER TABLE availability_exceptions DROP CONSTRAINT availability_exception_clinic_required;
  DROP TABLE appointment_slot_holds;
  DROP FUNCTION careorbit_set_hold_ranges();
`);

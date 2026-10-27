import pg from 'pg';
import { databaseUrl } from './environment.mjs';

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl() });

const ids = Object.freeze({
  patient: '00000000-0000-4000-8000-000000000101',
  doctor: '00000000-0000-4000-8000-000000000201',
  admin: '00000000-0000-4000-8000-000000000301',
  cardiology: '00000000-0000-4000-8000-000000000401',
  generalMedicine: '00000000-0000-4000-8000-000000000402',
  english: '00000000-0000-4000-8000-000000000411',
  urdu: '00000000-0000-4000-8000-000000000412',
  clinic: '00000000-0000-4000-8000-000000000501',
  doctorClinic: '00000000-0000-4000-8000-000000000601',
  availability: '00000000-0000-4000-8000-000000000701',
  appointment: '00000000-0000-4000-8000-000000000801',
  appointmentEvent: '00000000-0000-4000-8000-000000000901',
});

const passwordHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

  await client.query(
    `INSERT INTO users (id, email, password_hash, role, status, email_verified_at)
     VALUES ($1, 'patient@careorbit.test', $4, 'patient', 'active', now()),
            ($2, 'doctor@careorbit.test', $4, 'doctor', 'active', now()),
            ($3, 'admin@careorbit.test', $4, 'admin', 'active', now())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       email_verified_at = EXCLUDED.email_verified_at`,
    [ids.patient, ids.doctor, ids.admin, passwordHash],
  );

  await client.query(
    `INSERT INTO patient_profiles (user_id, display_name, phone, date_of_birth, timezone, allergies, relevant_history)
     VALUES ($1, 'Sara Ahmed', '+92-300-0000000', DATE '1992-05-14', 'Asia/Karachi', ARRAY['Penicillin'], 'Synthetic development record only')
     ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, timezone = EXCLUDED.timezone`,
    [ids.patient],
  );

  await client.query(
    `INSERT INTO doctor_profiles (user_id, display_name, biography, qualifications, years_experience, registration_number, verification_status, verified_at)
     VALUES ($1, 'Dr. Ayesha Khan', 'Synthetic cardiology provider profile.', ARRAY['MBBS','FCPS Cardiology'], 12, 'SYNTH-PMDC-0001', 'approved', now())
     ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, verification_status = 'approved', verified_at = COALESCE(doctor_profiles.verified_at, now())`,
    [ids.doctor],
  );

  await client.query(
    `INSERT INTO specialties (id, slug, name) VALUES
       ($1, 'cardiology', 'Cardiology'), ($2, 'general-medicine', 'General Medicine')
     ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, active = true`,
    [ids.cardiology, ids.generalMedicine],
  );

  await client.query(
    `INSERT INTO languages (id, code, name) VALUES
       ($1, 'en', 'English'), ($2, 'ur', 'Urdu')
     ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name`,
    [ids.english, ids.urdu],
  );

  await client.query(
    `INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary)
     VALUES ($1, $2, true) ON CONFLICT (doctor_id, specialty_id) DO UPDATE SET is_primary = true`,
    [ids.doctor, ids.cardiology],
  );
  await client.query(
    `INSERT INTO doctor_languages (doctor_id, language_id) VALUES ($1, $2), ($1, $3)
     ON CONFLICT DO NOTHING`,
    [ids.doctor, ids.english, ids.urdu],
  );

  await client.query(
    `INSERT INTO clinics (id, name, address_line1, city, country_code, timezone)
     VALUES ($1, 'Gulberg Medical Centre', 'Main Boulevard, Gulberg', 'Lahore', 'PK', 'Asia/Karachi')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = true`,
    [ids.clinic],
  );

  await client.query(
    `INSERT INTO doctor_clinics (id, doctor_id, clinic_id, consultation_mode, fee_minor, currency)
     VALUES ($1, $2, $3, 'in_person', 350000, 'PKR')
     ON CONFLICT (id) DO UPDATE SET fee_minor = EXCLUDED.fee_minor, active = true`,
    [ids.doctorClinic, ids.doctor, ids.clinic],
  );

  await client.query(
    `INSERT INTO availability_rules
       (id, doctor_clinic_id, timezone, weekday, local_start, local_end, effective_from, appointment_minutes,
        buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
     VALUES ($1, $2, 'Asia/Karachi', 4, TIME '09:00', TIME '17:00', DATE '2026-01-01', 30, 5, 5, 120, 180)
     ON CONFLICT (id) DO UPDATE SET active = true, local_start = EXCLUDED.local_start, local_end = EXCLUDED.local_end`,
    [ids.availability, ids.doctorClinic],
  );

  await client.query(
    `INSERT INTO appointments
       (id, patient_id, doctor_id, doctor_clinic_id, starts_at, ends_at, timezone, buffer_before_minutes,
        buffer_after_minutes, status, mode, fee_minor, currency, visit_reason, policy_snapshot, idempotency_key)
     VALUES ($1, $2, $3, $4, TIMESTAMPTZ '2030-10-10 10:30:00+05', TIMESTAMPTZ '2030-10-10 11:00:00+05',
       'Asia/Karachi', 5, 5, 'confirmed', 'in_person', 350000, 'PKR', 'Synthetic development follow-up',
       '{"cancellationCutoffMinutes":120,"currency":"PKR","synthetic":true}'::jsonb, 'seed-appointment-001')
     ON CONFLICT (id) DO NOTHING`,
    [ids.appointment, ids.patient, ids.doctor, ids.doctorClinic],
  );

  await client.query(
    `INSERT INTO appointment_events (id, appointment_id, event_type, to_status, actor_id, reason, policy_outcome, occurred_at)
     VALUES ($1, $2, 'created', 'confirmed', $3, 'Synthetic deterministic seed', '{"synthetic":true}'::jsonb,
       TIMESTAMPTZ '2030-10-01 09:00:00+05') ON CONFLICT (id) DO NOTHING`,
    [ids.appointmentEvent, ids.appointment, ids.admin],
  );

  await client.query(
    `INSERT INTO notification_preferences (user_id, timezone, in_app_enabled, reminder_enabled)
     VALUES ($1, 'Asia/Karachi', true, true), ($2, 'Asia/Karachi', true, true)
     ON CONFLICT (user_id) DO UPDATE SET timezone = EXCLUDED.timezone`,
    [ids.patient, ids.doctor],
  );

  await client.query('COMMIT');
  console.log('PostgreSQL synthetic seed complete (deterministic and idempotent).');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}

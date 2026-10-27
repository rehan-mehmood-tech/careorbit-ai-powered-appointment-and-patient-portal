import pg from 'pg';
import { databaseUrl } from './environment.mjs';

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl() });
let savepointNumber = 0;

async function expectDatabaseError(expectedCode, action, label) {
  const savepoint = `verify_${++savepointNumber}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await action();
    throw new Error(`${label}: expected PostgreSQL error ${expectedCode}`);
  } catch (error) {
    if (error.code !== expectedCode) throw error;
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    console.log(`PASS ${label} (${expectedCode})`);
  } finally {
    await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => undefined);
  }
}

const hash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const seeded = {
  patient: '00000000-0000-4000-8000-000000000101',
  doctor: '00000000-0000-4000-8000-000000000201',
  admin: '00000000-0000-4000-8000-000000000301',
  doctorClinic: '00000000-0000-4000-8000-000000000601',
  appointment: '00000000-0000-4000-8000-000000000801',
};

try {
  await client.connect();
  await client.query('BEGIN');

  const migrationCount = await client.query('SELECT count(*)::int AS count FROM careorbit_migrations');
  if (migrationCount.rows[0].count < 2) throw new Error('Expected both CareOrbit migrations');

  await expectDatabaseError('23505', () => client.query(
    `INSERT INTO users (email, password_hash, role) VALUES ('PATIENT@careorbit.test', $1, 'patient')`, [hash],
  ), 'normalized email uniqueness');

  await expectDatabaseError('23503', () => client.query(
    `INSERT INTO sessions (user_id, refresh_token_hash, family_id, expires_at)
     VALUES ('99999999-9999-4999-8999-999999999999', 'missing-user', gen_random_uuid(), now() + interval '1 day')`,
  ), 'foreign-key integrity');

  await expectDatabaseError('23514', () => client.query(
    `INSERT INTO patient_profiles (user_id, display_name, timezone) VALUES ($1, 'Invalid Admin Patient', 'Asia/Karachi')`, [seeded.admin],
  ), 'profile role enforcement');

  const secondPatient = '10000000-0000-4000-8000-000000000102';
  await client.query(
    `INSERT INTO users (id, email, password_hash, role, status) VALUES ($1, 'overlap-patient@careorbit.test', $2, 'patient', 'active')`,
    [secondPatient, hash],
  );
  await client.query(
    `INSERT INTO patient_profiles (user_id, display_name, timezone) VALUES ($1, 'Overlap Patient', 'Asia/Karachi')`, [secondPatient],
  );
  await expectDatabaseError('23P01', () => client.query(
    `INSERT INTO appointments
       (patient_id, doctor_id, doctor_clinic_id, starts_at, ends_at, timezone, status, mode, fee_minor, currency, visit_reason, policy_snapshot, idempotency_key)
     VALUES ($1, $2, $3, TIMESTAMPTZ '2030-10-10 10:45:00+05', TIMESTAMPTZ '2030-10-10 11:15:00+05',
       'Asia/Karachi', 'scheduled', 'in_person', 350000, 'PKR', 'Doctor overlap test', '{}'::jsonb, 'verify-doctor-overlap')`,
    [secondPatient, seeded.doctor, seeded.doctorClinic],
  ), 'doctor interval overlap');

  const secondDoctor = '20000000-0000-4000-8000-000000000202';
  const secondDoctorClinic = '20000000-0000-4000-8000-000000000602';
  await client.query(
    `INSERT INTO users (id, email, password_hash, role, status) VALUES ($1, 'overlap-doctor@careorbit.test', $2, 'doctor', 'active')`,
    [secondDoctor, hash],
  );
  await client.query(
    `INSERT INTO doctor_profiles (user_id, display_name, verification_status) VALUES ($1, 'Dr. Overlap Test', 'approved')`, [secondDoctor],
  );
  await client.query(
    `INSERT INTO doctor_clinics (id, doctor_id, clinic_id, consultation_mode, fee_minor, currency)
     SELECT $1, $2, clinic_id, 'in_person', 250000, 'PKR' FROM doctor_clinics WHERE id = $3`,
    [secondDoctorClinic, secondDoctor, seeded.doctorClinic],
  );
  await expectDatabaseError('23P01', () => client.query(
    `INSERT INTO appointments
       (patient_id, doctor_id, doctor_clinic_id, starts_at, ends_at, timezone, status, mode, fee_minor, currency, visit_reason, policy_snapshot, idempotency_key)
     VALUES ($1, $2, $3, TIMESTAMPTZ '2030-10-10 10:40:00+05', TIMESTAMPTZ '2030-10-10 10:50:00+05',
       'Asia/Karachi', 'confirmed', 'in_person', 250000, 'PKR', 'Patient overlap test', '{}'::jsonb, 'verify-patient-overlap')`,
    [seeded.patient, secondDoctor, secondDoctorClinic],
  ), 'patient interval overlap');

  await client.query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [seeded.appointment]);
  await expectDatabaseError('23514', () => client.query(
    `UPDATE appointments SET status = 'confirmed' WHERE id = $1`, [seeded.appointment],
  ), 'terminal appointment transition');

  await expectDatabaseError('55000', () => client.query(
    `UPDATE appointment_events SET reason = 'tampered' WHERE appointment_id = $1`, [seeded.appointment],
  ), 'append-only appointment events');

  await expectDatabaseError('23514', () => client.query(
    `INSERT INTO audit_events (action, resource_type, metadata)
     VALUES ('unsafe.test', 'test', '{"message_body":"must not be logged"}'::jsonb)`,
  ), 'clinical/chat body exclusion from audit metadata');

  const expectedIndexes = [
    'appointments_doctor_time_status_idx', 'appointments_patient_time_status_idx', 'messages_cursor_idx',
    'durable_jobs_due_idx', 'document_grants_doctor_idx', 'doctor_profiles_discovery_idx',
  ];
  const indexes = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ANY($1::text[])`, [expectedIndexes],
  );
  if (indexes.rowCount !== expectedIndexes.length) throw new Error('Required query indexes are missing');
  console.log('PASS required query indexes');

  await client.query('SET LOCAL enable_seqscan = off');
  const plan = await client.query(
    `EXPLAIN (FORMAT JSON) SELECT * FROM appointments
     WHERE doctor_id = $1 AND starts_at >= TIMESTAMPTZ '2030-01-01' AND status IN ('scheduled','confirmed') ORDER BY starts_at`,
    [seeded.doctor],
  );
  if (!JSON.stringify(plan.rows).includes('appointments_doctor_time_status_idx')) throw new Error('Representative appointment query did not use the expected index');
  console.log('PASS representative appointment query plan');

  await client.query('ROLLBACK');
  console.log('All PostgreSQL integrity checks passed. Verification data was rolled back.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}

import { createServer } from 'node:http';
import { Pool } from 'pg';

const port = Number(process.env.WORKER_HEALTH_PORT ?? 3002);
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL}):null;
let timer:NodeJS.Timeout|undefined;
async function processExpiry(){if(!pool)return;const client=await pool.connect();try{await client.query('BEGIN');const jobs=await client.query(`SELECT id,(payload->>'appointmentId')::uuid appointment_id FROM durable_jobs WHERE job_type='appointment_expiry' AND status='queued' AND scheduled_at<=now() ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 25`);for(const job of jobs.rows){const appointment=await client.query(`UPDATE appointments SET status='declined' WHERE id=$1 AND status='scheduled' AND confirmation_deadline_at<=now() RETURNING patient_id,doctor_id`,[job.appointment_id]);if(appointment.rows[0]){await client.query(`INSERT INTO appointment_events(appointment_id,event_type,from_status,to_status,reason,policy_outcome) VALUES($1,'expired','scheduled','declined','Confirmation deadline elapsed','{"worker":true}')`,[job.appointment_id]);for(const recipient of[appointment.rows[0].patient_id,appointment.rows[0].doctor_id])await client.query(`INSERT INTO notifications(recipient_id,event_id,kind,title,safe_preview) VALUES($1,$2,'expired','Appointment request expired','Open CareOrbit for details') ON CONFLICT DO NOTHING`,[recipient,`${job.appointment_id}:expired`]);}await client.query(`UPDATE durable_jobs SET status='succeeded',updated_at=now() WHERE id=$1`,[job.id]);}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');console.error('appointment expiry processing failed',error instanceof Error?error.name:'unknown');}finally{client.release();}}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WORKER_HEALTH_PORT must be a valid port');

const server = createServer((request, response) => {
  if (request.url === '/health/live' || request.url === '/health/ready') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: request.url.endsWith('ready') ? 'ready' : 'ok', service: 'careorbit-worker', jobsRegistered: 0 }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
});

server.listen(port, '127.0.0.1', () => {console.log(`CareOrbit worker listening on 127.0.0.1:${port}`);void processExpiry();timer=setInterval(()=>void processExpiry(),15000);});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {if(timer)clearInterval(timer);void pool?.end();server.close(() => process.exit(0));});

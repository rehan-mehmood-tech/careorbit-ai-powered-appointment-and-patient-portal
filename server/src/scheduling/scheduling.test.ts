import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {Pool} from 'pg';
import {acquireSlotHold} from './service.js';

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL??process.env.DATABASE_URL});
const doctorId='00000000-0000-4000-8000-000000000201',patientId='00000000-0000-4000-8000-000000000101',doctorClinicId='00000000-0000-4000-8000-000000000601';
before(async()=>{await pool.query(`DELETE FROM appointment_slot_holds WHERE doctor_id=$1 OR patient_id=$2`,[doctorId,patientId])});after(async()=>{await pool.query(`DELETE FROM appointment_slot_holds WHERE doctor_id=$1 OR patient_id=$2`,[doctorId,patientId]);await pool.end()});
test('concurrent holds for one buffered interval yield exactly one success',async()=>{const input={doctorId,patientId,doctorClinicId,startsAt:'2026-10-29T04:00:00.000Z',endsAt:'2026-10-29T04:30:00.000Z',bufferBeforeMinutes:5,bufferAfterMinutes:5,ttlSeconds:300};const outcomes=await Promise.allSettled([acquireSlotHold(pool,input),acquireSlotHold(pool,input)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);});
test('buffers reject different start times whose occupied intervals overlap',async()=>{await assert.rejects(()=>acquireSlotHold(pool,{doctorId,patientId,doctorClinicId,startsAt:'2026-10-29T04:30:00.000Z',endsAt:'2026-10-29T05:00:00.000Z',bufferBeforeMinutes:5,bufferAfterMinutes:5}),/no longer available/i)});
test('timezone conversion is DST-aware and midnight-crossing rules must be split',async()=>{const converted=await pool.query(`SELECT ('2026-03-29 01:30'::timestamp AT TIME ZONE 'Europe/London') utc_instant,('2026-10-25 01:30'::timestamp AT TIME ZONE 'Europe/London') fallback_instant`);assert.ok(converted.rows[0].utc_instant);assert.ok(converted.rows[0].fallback_instant);await assert.rejects(()=>pool.query(`INSERT INTO availability_rules(doctor_clinic_id,timezone,weekday,local_start,local_end,effective_from,appointment_minutes) VALUES($1,'Asia/Karachi',1,'23:00','01:00','2026-01-01',30)`,[doctorClinicId]),(error:{code?:string})=>error.code==='23514');});

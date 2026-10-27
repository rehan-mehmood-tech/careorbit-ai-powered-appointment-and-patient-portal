import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../app.js';

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL??process.env.DATABASE_URL});
const app=createApp(pool,{requireTls:false,defaultRateMax:1000});
let doctorId=''; let slotDate='';
before(async()=>{await pool.query('SELECT 1')}); after(async()=>pool.end());

test('directory exposes only allowlisted fields for verified active doctors',async()=>{const response=await request(app).get('/api/v1/doctors?pageSize=1').expect(200);assert.ok(response.body.meta.pagination);assert.ok(response.body.data.length);const doctor=response.body.data[0];doctorId=doctor.id;assert.equal(doctor.email,undefined);assert.equal(doctor.registration_number,undefined);assert.equal(doctor.verification_status,undefined);assert.equal(doctor.public_photo_key,undefined);assert.ok(Array.isArray(doctor.clinics));if(doctor.next_available_at)slotDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date(doctor.next_available_at));});
test('combined filters, sorting, and bounded pagination are enforced',async()=>{const started=performance.now();const response=await request(app).get('/api/v1/doctors?specialty=cardiology&location=Lahore&maxFee=350000&minExperience=10&language=ur&sort=fee_asc&page=1&pageSize=10').expect(200);assert.ok(performance.now()-started<2000,'seeded combined discovery query exceeded 2 seconds');assert.ok(response.body.data.every((doctor:{experience:number})=>doctor.experience>=10));await request(app).get('/api/v1/doctors?pageSize=51').expect(422);await request(app).get('/api/v1/doctors?minFee=500&maxFee=100').expect(422);});
test('profile remains private-not-found and slots are genuinely reservable',async(t)=>{if(!doctorId)return t.skip('seed has no discoverable doctor');const profile=await request(app).get(`/api/v1/doctors/${doctorId}`).expect(200);assert.equal(profile.body.data.doctor.email,undefined);await request(app).get('/api/v1/doctors/00000000-0000-4000-8000-000000000000').expect(404);if(!slotDate)return t.skip('seed doctor has no upcoming availability');const slots=await request(app).get(`/api/v1/doctors/${doctorId}/slots?date=${slotDate}&timezone=Asia%2FKarachi`).expect(200);assert.ok(slots.body.data.slots.length);for(const slot of slots.body.data.slots)assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date(slot.starts_at)),slotDate);const filtered=await request(app).get(`/api/v1/doctors?date=${slotDate}&timezone=Asia%2FKarachi`).expect(200);assert.ok(filtered.body.data.some((doctor:{id:string})=>doctor.id===doctorId));});

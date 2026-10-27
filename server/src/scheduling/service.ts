import type { Pool } from 'pg';
import { AppError } from '../errors.js';
import { withTransaction } from '../database.js';

export type HoldInput={doctorId:string;patientId:string;doctorClinicId:string;startsAt:string;endsAt:string;bufferBeforeMinutes:number;bufferAfterMinutes:number;ttlSeconds?:number};
export async function acquireSlotHold(pool:Pool,input:HoldInput){return withTransaction(pool,async db=>{
  // Every future appointment creator must take these same entity locks before conflict checks/inserts.
  const locks=[`doctor:${input.doctorId}`,`patient:${input.patientId}`].sort();
  for(const key of locks)await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[key]);
  await db.query(`DELETE FROM appointment_slot_holds WHERE expires_at<=now()`);
  const conflict=await db.query(`SELECT 1 FROM appointments WHERE status IN('scheduled','confirmed') AND ((doctor_id=$1 AND occupied_at && tstzrange($3::timestamptz-$5*interval '1 minute',$4::timestamptz+$6*interval '1 minute','[)')) OR (patient_id=$2 AND patient_interval && tstzrange($3,$4,'[)'))) LIMIT 1`,[input.doctorId,input.patientId,input.startsAt,input.endsAt,input.bufferBeforeMinutes,input.bufferAfterMinutes]);
  if(conflict.rowCount)throw new AppError(409,'SLOT_NO_LONGER_AVAILABLE','The selected interval is no longer available');
  try{return (await db.query(`INSERT INTO appointment_slot_holds(doctor_id,patient_id,doctor_clinic_id,starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 second') RETURNING id,starts_at,ends_at,expires_at`,[input.doctorId,input.patientId,input.doctorClinicId,input.startsAt,input.endsAt,input.bufferBeforeMinutes,input.bufferAfterMinutes,input.ttlSeconds??300])).rows[0];}
  catch(error){if((error as {code?:string}).code==='23P01')throw new AppError(409,'SLOT_NO_LONGER_AVAILABLE','The selected interval is no longer available');throw error;}
 },'SERIALIZABLE');}

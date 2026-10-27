import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { createRateLimit } from '../rate-limits.js';
import { sendPage, sendSuccess } from '../responses.js';
import { validate } from '../validation.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date');
const listSchema = z.object({
  body:z.unknown(), params:z.object({}), query:z.object({
    q:z.string().trim().max(100).optional(), specialty:z.string().trim().max(80).optional(), location:z.string().trim().max(100).optional(),
    date:date.optional(), timezone:z.string().trim().max(64).default('Asia/Karachi'), minFee:z.coerce.number().int().min(0).max(10000000).optional(),
    maxFee:z.coerce.number().int().min(0).max(10000000).optional(), minExperience:z.coerce.number().int().min(0).max(80).optional(),
    language:z.string().trim().max(80).optional(), sort:z.enum(['availability','fee_asc','fee_desc','experience_desc']).default('availability'),
    page:z.coerce.number().int().min(1).default(1), pageSize:z.coerce.number().int().min(1).max(50).default(12),
  }).superRefine((value,ctx)=>{if(value.minFee!==undefined&&value.maxFee!==undefined&&value.minFee>value.maxFee)ctx.addIssue({code:'custom',message:'minFee must not exceed maxFee',path:['minFee']});}),
});
const idSchema=z.object({body:z.unknown(),query:z.object({}),params:z.object({id:uuid})});
const slotSchema=z.object({body:z.unknown(),params:z.object({id:uuid}),query:z.object({date:date,timezone:z.string().trim().max(64).default('Asia/Karachi')})});

// Generates only slots that satisfy rules, notice/horizon, exceptions, and existing occupied intervals.
const slotCte = (rangeStart:string,rangeEnd=rangeStart) => `
  candidate_slots AS (
    SELECT dp.user_id doctor_id, dc.id doctor_clinic_id, dc.consultation_mode mode, dc.fee_minor, dc.currency,
      c.id clinic_id,c.name clinic_name,c.address_line1,c.city,c.country_code,c.timezone clinic_timezone,
      ar.timezone rule_timezone, ar.appointment_minutes, ar.buffer_before_minutes, ar.buffer_after_minutes,
      gs starts_at, gs + ar.appointment_minutes * interval '1 minute' ends_at
    FROM doctor_profiles dp JOIN users u ON u.id=dp.user_id AND u.status='active'
    JOIN doctor_clinics dc ON dc.doctor_id=dp.user_id AND dc.active JOIN clinics c ON c.id=dc.clinic_id AND c.active
    JOIN availability_rules ar ON ar.doctor_clinic_id=dc.id AND ar.active
    JOIN LATERAL generate_series(${rangeStart}, ${rangeEnd}, interval '1 day') day ON true
    JOIN LATERAL generate_series((day::date + ar.local_start) AT TIME ZONE ar.timezone,
      ((day::date + ar.local_end) AT TIME ZONE ar.timezone) - ar.appointment_minutes * interval '1 minute',
      ar.appointment_minutes * interval '1 minute') gs ON true
    WHERE dp.verification_status='approved' AND extract(dow from day)::int=ar.weekday
      AND day::date BETWEEN ar.effective_from AND COALESCE(ar.effective_to,'infinity'::date)
      AND gs >= now() + ar.minimum_notice_minutes * interval '1 minute'
      AND day::date <= (now() AT TIME ZONE ar.timezone)::date + ar.booking_horizon_days
      AND NOT EXISTS (SELECT 1 FROM availability_exceptions ae WHERE ae.doctor_id=dp.user_id
        AND ae.exception_type IN ('unavailable','break','leave') AND tstzrange(ae.starts_at,ae.ends_at,'[)') && tstzrange(gs,gs+ar.appointment_minutes*interval '1 minute','[)'))
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id=dp.user_id AND a.status IN ('scheduled','confirmed')
        AND a.occupied_at && tstzrange(gs-ar.buffer_before_minutes*interval '1 minute',gs+(ar.appointment_minutes+ar.buffer_after_minutes)*interval '1 minute','[)'))
  )`;

const publicFields=`dp.user_id id,dp.display_name name,dp.biography bio,dp.qualifications,dp.years_experience experience,dp.public_photo_url photo_url,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'primary',ds.is_primary) ORDER BY ds.is_primary DESC,s.name) FROM doctor_specialties ds JOIN specialties s ON s.id=ds.specialty_id AND s.active WHERE ds.doctor_id=dp.user_id),'[]') specialties,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('code',l.code,'name',l.name) ORDER BY l.name) FROM doctor_languages dl JOIN languages l ON l.id=dl.language_id WHERE dl.doctor_id=dp.user_id),'[]') languages,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',dc.id,'clinicId',c.id,'name',c.name,'address',c.address_line1,'city',c.city,'countryCode',c.country_code,'timezone',c.timezone,'mode',dc.consultation_mode,'feeMinor',dc.fee_minor,'currency',dc.currency) ORDER BY dc.fee_minor,c.name) FROM doctor_clinics dc JOIN clinics c ON c.id=dc.clinic_id AND c.active WHERE dc.doctor_id=dp.user_id AND dc.active),'[]') clinics`;

export function createDiscoveryRouter(pool:Pool):Router{
  const router=Router();
  router.use(['/doctors','/doctors/:id','/doctors/:id/slots','/specialties'],createRateLimit({windowMs:60_000,limit:120},'public-discovery'));
  router.get('/doctors',validate(listSchema),async(_req,res,next)=>{try{
    const q=res.locals.validated.query as z.infer<typeof listSchema>['query']; const offset=(q.page-1)*q.pageSize;
    const values=[q.q??null,q.specialty??null,q.location??null,q.date??null,q.timezone,q.minFee??null,q.maxFee??null,q.minExperience??null,q.language??null,q.pageSize,offset];
    const result=await pool.query(`WITH ${slotCte(`COALESCE($4::date,(now() AT TIME ZONE $5)::date)`,`COALESCE($4::date,(now() AT TIME ZONE $5)::date+90)`)}, eligible AS (
      SELECT ${publicFields}, min(cs.starts_at) next_available_at, min(dc.fee_minor) min_fee_minor, count(*) OVER() total_count
      FROM doctor_profiles dp JOIN users u ON u.id=dp.user_id AND u.status='active' JOIN doctor_clinics dc ON dc.doctor_id=dp.user_id AND dc.active JOIN clinics c ON c.id=dc.clinic_id AND c.active
      JOIN candidate_slots cs ON cs.doctor_id=dp.user_id
      WHERE dp.verification_status='approved'
        AND ($1::text IS NULL OR dp.display_name ILIKE '%'||$1||'%' OR EXISTS(SELECT 1 FROM doctor_specialties dx JOIN specialties sx ON sx.id=dx.specialty_id WHERE dx.doctor_id=dp.user_id AND sx.name ILIKE '%'||$1||'%') OR c.city ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM doctor_specialties dx JOIN specialties sx ON sx.id=dx.specialty_id WHERE dx.doctor_id=dp.user_id AND (sx.slug=$2 OR sx.name ILIKE $2)))
        AND ($3::text IS NULL OR c.city ILIKE $3 OR c.address_line1 ILIKE '%'||$3||'%')
        AND ($4::date IS NULL OR (cs.starts_at AT TIME ZONE $5)::date=$4::date)
        AND ($6::int IS NULL OR dc.fee_minor >= $6) AND ($7::int IS NULL OR dc.fee_minor <= $7) AND ($8::int IS NULL OR dp.years_experience >= $8)
        AND ($9::text IS NULL OR EXISTS(SELECT 1 FROM doctor_languages dl JOIN languages l ON l.id=dl.language_id WHERE dl.doctor_id=dp.user_id AND (l.code=$9 OR l.name ILIKE $9)))
      GROUP BY dp.user_id
    ) SELECT * FROM eligible ORDER BY
      CASE WHEN $12='availability' THEN next_available_at END ASC NULLS LAST, CASE WHEN $12='fee_asc' THEN min_fee_minor END ASC,
      CASE WHEN $12='fee_desc' THEN min_fee_minor END DESC, CASE WHEN $12='experience_desc' THEN experience END DESC, name ASC LIMIT $10 OFFSET $11`,[...values,q.sort]);
    const total=Number(result.rows[0]?.total_count??0); result.rows.forEach(row=>delete row.total_count);
    sendPage(res,result.rows,{page:q.page,pageSize:q.pageSize,total,totalPages:Math.ceil(total/q.pageSize)});
  }catch(e){next(e);}});
  router.get('/doctors/:id',validate(idSchema),async(req,res,next)=>{try{const result=await pool.query(`WITH ${slotCte(`(now() AT TIME ZONE 'Asia/Karachi')::date`,`(now() AT TIME ZONE 'Asia/Karachi')::date+90`)} SELECT ${publicFields},min(cs.starts_at) next_available_at FROM doctor_profiles dp JOIN users u ON u.id=dp.user_id AND u.status='active' LEFT JOIN candidate_slots cs ON cs.doctor_id=dp.user_id WHERE dp.user_id=$1 AND dp.verification_status='approved' GROUP BY dp.user_id`,[req.params.id]);if(!result.rows[0])throw new AppError(404,'NOT_FOUND','Resource not found');sendSuccess(res,{doctor:result.rows[0]});}catch(e){next(e);}});
  router.get('/doctors/:id/slots',validate(slotSchema),async(_req,res,next)=>{try{const q=res.locals.validated.query;const id=res.locals.validated.params.id;const result=await pool.query(`WITH ${slotCte(`$2::date`)} SELECT doctor_clinic_id,mode,fee_minor,currency,clinic_id,clinic_name,address_line1,city,country_code,clinic_timezone,rule_timezone,starts_at,ends_at FROM candidate_slots WHERE doctor_id=$1 AND (starts_at AT TIME ZONE $3)::date=$2::date ORDER BY starts_at,fee_minor`,[id,q.date,q.timezone]);sendSuccess(res,{date:q.date,timezone:q.timezone,slots:result.rows});}catch(e){next(e);}});
  router.get('/specialties',async(_req,res,next)=>{try{const result=await pool.query(`SELECT s.id,s.slug,s.name,count(DISTINCT u.id)::int doctor_count FROM specialties s LEFT JOIN doctor_specialties ds ON ds.specialty_id=s.id LEFT JOIN doctor_profiles dp ON dp.user_id=ds.doctor_id AND dp.verification_status='approved' LEFT JOIN users u ON u.id=dp.user_id AND u.status='active' WHERE s.active GROUP BY s.id ORDER BY s.name`);sendSuccess(res,{specialties:result.rows});}catch(e){next(e);}});
  return router;
}

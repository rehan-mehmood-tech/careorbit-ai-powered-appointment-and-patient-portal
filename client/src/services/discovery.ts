const apiBase=(import.meta.env.VITE_API_URL||'http://127.0.0.1:3001').replace(/\/$/,'');
export type Specialty={id:string;slug:string;name:string;doctor_count:number};
export type Clinic={id:string;clinicId:string;name:string;address:string;city:string;countryCode:string;timezone:string;mode:string;feeMinor:number;currency:string};
export type PublicDoctor={id:string;name:string;bio:string|null;qualifications:string[];experience:number;photo_url:string|null;specialties:Array<{id:string;slug:string;name:string;primary:boolean}>;languages:Array<{code:string;name:string}>;clinics:Clinic[];next_available_at:string|null;min_fee_minor?:number};
export type Slot={doctor_clinic_id:string;mode:string;fee_minor:number;currency:string;clinic_name:string;city:string;clinic_timezone:string;starts_at:string;ends_at:string};
type Page<T>={data:T[];meta:{requestId:string;pagination:{page:number;pageSize:number;total:number;totalPages:number}}};
async function get<T>(path:string):Promise<T>{const response=await fetch(`${apiBase}/api/v1${path}`);const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error?.message||'Unable to load doctor information');return payload}
export async function findDoctors(params:URLSearchParams){return get<Page<PublicDoctor>>(`/doctors?${params}`)}
export async function getDoctor(id:string){return (await get<{data:{doctor:PublicDoctor}}>(`/doctors/${encodeURIComponent(id)}`)).data.doctor}
export async function getSlots(id:string,date:string,timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Karachi'){return (await get<{data:{slots:Slot[]}}>(`/doctors/${encodeURIComponent(id)}/slots?date=${date}&timezone=${encodeURIComponent(timezone)}`)).data.slots}
export async function getSpecialties(){return (await get<{data:{specialties:Specialty[]}}>('/specialties')).data.specialties}
export function money(minor:number,currency:string){return new Intl.NumberFormat('en-PK',{style:'currency',currency,maximumFractionDigits:0}).format(minor/100)}
export function localTime(value:string,timezone:string){return new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:timezone,timeZoneName:'short'}).format(new Date(value))}

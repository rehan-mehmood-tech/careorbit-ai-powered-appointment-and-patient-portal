import { authenticatedRequest } from './auth';
type Envelope<T>={data:T};
export type AvailabilityRule={id:string;doctor_clinic_id:string;clinic_name:string;consultation_mode:string;timezone:string;weekday:number;local_start:string;local_end:string;effective_from:string;effective_to:string|null;appointment_minutes:number;buffer_before_minutes:number;buffer_after_minutes:number;minimum_notice_minutes:number;booking_horizon_days:number};
export type AvailabilityException={id:string;doctor_clinic_id:string|null;exception_type:string;starts_at:string;ends_at:string;timezone:string;reason:string};
export type DoctorClinic={id:string;name:string;consultation_mode:string;fee_minor:number;currency:string;timezone:string};
export type CalendarAppointment={id:string;starts_at:string;ends_at:string;status:string;mode:string;timezone:string;patient_name:string;clinic_name:string};
export async function getAvailability(){return (await authenticatedRequest<Envelope<{rules:AvailabilityRule[];exceptions:AvailabilityException[];clinics:DoctorClinic[]}>>('/doctor/availability')).data}
export async function createRule(input:Record<string,unknown>){return authenticatedRequest('/doctor/availability',{method:'POST',body:JSON.stringify(input)})}
export async function updateRule(id:string,input:Record<string,unknown>){return authenticatedRequest(`/doctor/availability/${id}`,{method:'PUT',body:JSON.stringify(input)})}
export async function deleteRule(id:string,resolutions:unknown[]=[]){return authenticatedRequest(`/doctor/availability/${id}`,{method:'DELETE',body:JSON.stringify({resolutions})})}
export async function createException(input:Record<string,unknown>){return authenticatedRequest('/doctor/availability/exceptions',{method:'POST',body:JSON.stringify(input)})}
export async function deleteException(id:string,reason:string){return authenticatedRequest(`/doctor/availability/exceptions/${id}`,{method:'DELETE',body:JSON.stringify({reason})})}
export async function getCalendar(from:string,to:string,view:'day'|'week'){return (await authenticatedRequest<Envelope<{appointments:CalendarAppointment[]}>>(`/doctor/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&view=${view}`)).data.appointments}

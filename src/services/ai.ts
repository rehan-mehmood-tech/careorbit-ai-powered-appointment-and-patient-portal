import { auth } from './firebase';

const API_URL = import.meta.env.VITE_AI_API_URL || 'http://127.0.0.1:8000';
export type Intake = {intake_id:string; appointment_id?:string|null; chief_concern?:string|null; symptoms:string[]; onset_duration_severity?:string|null; associated_symptoms:string[]; relevant_history:string[]; medications:string[]; allergies:string[]; unknown_or_skipped:string[]; questions_for_doctor:string[]; patient_confirmed_summary?:string|null; status:string; language:'en'|'ur'; potential_urgent_concern:boolean};

async function request<T>(path:string, init:RequestInit={}, signal?:AbortSignal):Promise<T>{
  const token=await auth.currentUser?.getIdToken();
  if(!token)throw new Error('Please sign in again.');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30000);
  if(signal)signal.addEventListener('abort',()=>controller.abort(),{once:true});
  try{
    const response=await fetch(`${API_URL}${path}`,{...init,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...init.headers}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'The assistant could not complete that request.');
    return data;
  }finally{clearTimeout(timer)}
}
export function sendIntakeMessage(session_id:string,message:string,appointment_id?:string,signal?:AbortSignal){return request<{session_id:string;message:string;intake:Intake;requires_confirmation:boolean;urgent:boolean}>('/api/intakes/message',{method:'POST',body:JSON.stringify({session_id,message,appointment_id:appointment_id||null})},signal)}
export function confirmIntake(id:string,appointment_id:string|undefined,share_with_doctor:boolean){return request<Intake>(`/api/intakes/${id}/confirm`,{method:'POST',body:JSON.stringify({appointment_id:appointment_id||null,share_with_doctor})})}
export function getDoctorIntakes(){return request<Intake[]>('/api/doctor/intakes')}
export function markIntakeReviewed(id:string,note:string){return request<Intake>(`/api/doctor/intakes/${id}/review`,{method:'POST',body:JSON.stringify({note})})}


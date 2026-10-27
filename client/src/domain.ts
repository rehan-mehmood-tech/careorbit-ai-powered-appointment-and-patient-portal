export const ROLES = ['patient', 'doctor', 'admin'] as const;
export type Role = typeof ROLES[number];
export type AppointmentStatus = 'Scheduled' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Declined' | 'No show';
export type DocumentStatus = 'Ready' | 'Processing' | 'Needs review' | 'Failed';

export interface User { id: string; name: string; email: string; role: Role; avatar: string; }
export interface Doctor { id: string; name: string; specialty: string; experience: number; languages: string[]; location: string; fee: number; nextSlot: string; qualification: string; verified: boolean; mode: string; bio: string; }
export interface Appointment { id: string; doctorId: string; patientName: string; doctorName: string; specialty: string; date: string; time: string; status: AppointmentStatus; mode: string; location: string; fee: number; reason: string; }
export interface MedicalDocument { id: string; title: string; type: string; date: string; size: string; status: DocumentStatus; sharedWith: string[]; aiConsent: boolean; }
export interface Conversation { id: string; person: string; role: string; unread: number; lastMessage: string; time: string; online: boolean; }
export interface NotificationItem { id: string; title: string; body: string; time: string; read: boolean; kind: string; }
export interface Toast { id: number; tone: 'success' | 'error' | 'info'; message: string; }

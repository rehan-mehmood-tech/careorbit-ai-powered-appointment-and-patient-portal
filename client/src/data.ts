import type { Appointment, Conversation, Doctor, MedicalDocument, NotificationItem } from './domain';

// Collections intentionally start empty. Runtime records are loaded from Firestore.
export const doctors: Doctor[] = [];
export const initialAppointments: Appointment[] = [];
export const initialDocuments: MedicalDocument[] = [];
export const conversations: Conversation[] = [];
export const notifications: NotificationItem[] = [];
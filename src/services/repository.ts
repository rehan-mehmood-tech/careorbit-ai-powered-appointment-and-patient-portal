import type { Appointment, AppointmentStatus, MedicalDocument, Role, User } from '../domain';

/** Backend boundary. The UI does not depend on Firebase SDK types. */
export interface CareOrbitRepository {
  signIn(email: string, password: string, expectedRole: Role): Promise<User>;
  signOut(): Promise<void>;
  listAppointments(): Promise<Appointment[]>;
  createAppointment(input: Omit<Appointment, 'id' | 'status'>, idempotencyKey: string): Promise<Appointment>;
  transitionAppointment(id: string, status: AppointmentStatus, reason?: string): Promise<Appointment>;
  listDocuments(): Promise<MedicalDocument[]>;
  createDocument(file: File): Promise<MedicalDocument>;
  grantDocumentAccess(documentId: string, doctorId: string, purpose: string): Promise<void>;
  revokeDocumentAccess(documentId: string, doctorId: string): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED'|'FORBIDDEN'|'CONFLICT'|'VALIDATION'|'UNAVAILABLE', message: string) { super(message); }
}

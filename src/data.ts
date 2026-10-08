import type { Appointment, Conversation, Doctor, MedicalDocument, NotificationItem, User } from './domain';

export const users: Record<string, User> = {
  patient: { id: 'p-001', name: 'Sara Ahmed', email: 'sara@example.com', role: 'patient', avatar: 'SA' },
  doctor: { id: 'd-001', name: 'Dr. Ayesha Khan', email: 'ayesha@careorbit.demo', role: 'doctor', avatar: 'AK' },
  admin: { id: 'a-001', name: 'Hassan Raza', email: 'hassan@careorbit.demo', role: 'admin', avatar: 'HR' },
};

export const doctors: Doctor[] = [
  { id: 'd-001', name: 'Dr. Ayesha Khan', specialty: 'Cardiology', experience: 12, languages: ['English', 'Urdu'], location: 'Gulberg, Lahore', fee: 3500, nextSlot: 'Sat, 10 Oct · 10:30 AM', qualification: 'MBBS, FCPS Cardiology', verified: true, mode: 'Clinic & video', bio: 'Consultant cardiologist focused on preventive heart care and long-term patient education.' },
  { id: 'd-002', name: 'Dr. Bilal Qureshi', specialty: 'Dermatology', experience: 9, languages: ['English', 'Urdu', 'Punjabi'], location: 'DHA, Lahore', fee: 3000, nextSlot: 'Fri, 9 Oct · 4:00 PM', qualification: 'MBBS, FCPS Dermatology', verified: true, mode: 'Clinic', bio: 'Dermatologist providing evidence-led care for adult and adolescent skin conditions.' },
  { id: 'd-003', name: 'Dr. Hira Saleem', specialty: 'General Medicine', experience: 8, languages: ['English', 'Urdu'], location: 'Johar Town, Lahore', fee: 2200, nextSlot: 'Today · 6:30 PM', qualification: 'MBBS, MRCP', verified: true, mode: 'Video & clinic', bio: 'General physician with a special interest in continuity of care and preventive health.' },
  { id: 'd-004', name: 'Dr. Omar Siddiqui', specialty: 'Neurology', experience: 15, languages: ['English', 'Urdu'], location: 'Model Town, Lahore', fee: 4500, nextSlot: 'Mon, 12 Oct · 11:00 AM', qualification: 'MBBS, FCPS Neurology', verified: true, mode: 'Clinic', bio: 'Consultant neurologist supporting adults with complex and chronic neurological concerns.' },
];

export const initialAppointments: Appointment[] = [
  { id: 'apt-1048', doctorId: 'd-001', patientName: 'Sara Ahmed', doctorName: 'Dr. Ayesha Khan', specialty: 'Cardiology', date: '10 Oct 2026', time: '10:30 AM', status: 'Confirmed', mode: 'In clinic', location: 'Gulberg Medical Centre', fee: 3500, reason: 'Follow-up consultation' },
  { id: 'apt-1031', doctorId: 'd-003', patientName: 'Sara Ahmed', doctorName: 'Dr. Hira Saleem', specialty: 'General Medicine', date: '22 Sep 2026', time: '3:00 PM', status: 'Completed', mode: 'Video', location: 'Online', fee: 2200, reason: 'Annual wellness consultation' },
  { id: 'apt-1052', doctorId: 'd-001', patientName: 'Ali Hassan', doctorName: 'Dr. Ayesha Khan', specialty: 'Cardiology', date: '8 Oct 2026', time: '2:00 PM', status: 'Scheduled', mode: 'In clinic', location: 'Gulberg Medical Centre', fee: 3500, reason: 'Initial consultation' },
  { id: 'apt-1053', doctorId: 'd-001', patientName: 'Mariam Noor', doctorName: 'Dr. Ayesha Khan', specialty: 'Cardiology', date: '8 Oct 2026', time: '3:30 PM', status: 'Confirmed', mode: 'Video', location: 'Online', fee: 3500, reason: 'Review test results' },
];

export const initialDocuments: MedicalDocument[] = [
  { id: 'doc-1', title: 'Complete blood count', type: 'Lab report', date: '2 Oct 2026', size: '1.2 MB', status: 'Ready', sharedWith: ['Dr. Ayesha Khan'], aiConsent: true },
  { id: 'doc-2', title: 'Chest X-ray report', type: 'Radiology', date: '18 Sep 2026', size: '820 KB', status: 'Needs review', sharedWith: [], aiConsent: true },
  { id: 'doc-3', title: 'Previous prescription', type: 'Prescription', date: '8 Aug 2026', size: '540 KB', status: 'Ready', sharedWith: [], aiConsent: false },
];

export const conversations: Conversation[] = [
  { id: 'c-1', person: 'Dr. Ayesha Khan', role: 'Cardiologist', unread: 2, lastMessage: 'Please bring your recent reports.', time: '9:42 AM', online: true },
  { id: 'c-2', person: 'Dr. Hira Saleem', role: 'General physician', unread: 0, lastMessage: 'Your visit summary is now available.', time: 'Yesterday', online: false },
];

export const notifications: NotificationItem[] = [
  { id: 'n-1', title: 'Appointment confirmed', body: 'Dr. Ayesha Khan confirmed your appointment for 10 Oct at 10:30 AM PKT.', time: '12 min ago', read: false, kind: 'Appointment' },
  { id: 'n-2', title: 'Summary ready', body: 'Your Complete blood count summary is ready to review.', time: '2 hours ago', read: false, kind: 'Document' },
  { id: 'n-3', title: 'Reminder', body: 'Your video consultation is tomorrow. Open CareOrbit to view details.', time: 'Yesterday', read: true, kind: 'Reminder' },
];

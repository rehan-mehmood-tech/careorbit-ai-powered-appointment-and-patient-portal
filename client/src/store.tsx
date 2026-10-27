import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { readUser, signOut } from './services/auth';
import type { Appointment, AppointmentStatus, MedicalDocument, NotificationItem, Role, Toast, User } from './domain';

interface StoreValue {
  user: User | null; role: Role | null; authLoading: boolean; appointments: Appointment[]; documents: MedicalDocument[];
  notifications: NotificationItem[]; toasts: Toast[]; setAuthenticatedUser: (user: User) => void;
  logout: () => Promise<void>; addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, status: AppointmentStatus) => void; addDocument: (document: MedicalDocument) => void;
  toggleShare: (id: string, doctor: string) => void; markAllRead: () => void; notify: (message: string, tone?: Toast['tone']) => void;
}
const Store = createContext<StoreValue | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [authLoading, setAuthLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]); const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]); const [toasts, setToasts] = useState<Toast[]>([]);
  const role = user?.role ?? null;
  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser) { setUser(null); setAppointments([]); setDocuments([]); setNotifications([]); setAuthLoading(false); return; }
    try { setUser(await readUser(firebaseUser)); } catch { await signOut(); setUser(null); } finally { setAuthLoading(false); }
  }), []);
  useEffect(() => {
    if (!user) return; const field = user.role === 'patient' ? 'patientId' : user.role === 'doctor' ? 'doctorId' : null; const stops: Array<() => void> = [];
    const appointmentsQuery = field ? query(collection(db, 'appointments'), where(field, '==', user.id)) : query(collection(db, 'appointments'));
    stops.push(onSnapshot(appointmentsQuery, snap => setAppointments(snap.docs.map(item => ({ id: item.id, ...item.data() }) as Appointment)), () => setAppointments([])));
    if (user.role === 'patient') stops.push(onSnapshot(query(collection(db, 'documents'), where('ownerId', '==', user.id)), snap => setDocuments(snap.docs.map(item => ({ id: item.id, ...item.data() }) as MedicalDocument)), () => setDocuments([])));
    stops.push(onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', user.id)), snap => setNotifications(snap.docs.map(item => ({ id: item.id, ...item.data() }) as NotificationItem)), () => setNotifications([])));
    return () => stops.forEach(stop => stop());
  }, [user]);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => { const id = Date.now(); setToasts(items => [...items, { id, tone, message }]); window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 3200); }, []);
  const value = useMemo<StoreValue>(() => ({ user, role, authLoading, appointments, documents, notifications, toasts, setAuthenticatedUser: setUser,
    logout: async () => { await signOut(); setUser(null); }, addAppointment: a => setAppointments(items => [a, ...items]),
    updateAppointment: (id, status) => setAppointments(items => items.map(item => item.id === id ? { ...item, status } : item)), addDocument: d => setDocuments(items => [d, ...items]),
    toggleShare: (id, doctor) => setDocuments(items => items.map(item => item.id === id ? { ...item, sharedWith: item.sharedWith.includes(doctor) ? item.sharedWith.filter(name => name !== doctor) : [...item.sharedWith, doctor] } : item)),
    markAllRead: () => setNotifications(items => items.map(item => ({ ...item, read: true }))), notify }), [user, role, authLoading, appointments, documents, notifications, toasts, notify]);
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
export function useStore() { const value = useContext(Store); if (!value) throw new Error('StoreProvider missing'); return value; }
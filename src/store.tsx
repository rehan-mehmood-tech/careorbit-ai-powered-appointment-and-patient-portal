import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { initialAppointments, initialDocuments, notifications as seedNotifications, users } from './data';
import type { Appointment, AppointmentStatus, MedicalDocument, NotificationItem, Role, Toast, User } from './domain';

interface StoreValue {
  user: User | null; role: Role; appointments: Appointment[]; documents: MedicalDocument[];
  notifications: NotificationItem[]; toasts: Toast[];
  login: (role: Role) => void; logout: () => void; switchRole: (role: Role) => void;
  addAppointment: (appointment: Appointment) => void; updateAppointment: (id: string, status: AppointmentStatus) => void;
  addDocument: (document: MedicalDocument) => void; toggleShare: (id: string, doctor: string) => void;
  markAllRead: () => void; notify: (message: string, tone?: Toast['tone']) => void;
}

const Store = createContext<StoreValue | null>(null);
const STORAGE_KEY = 'careorbit-demo-state-v1';

function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as { appointments: Appointment[]; documents: MedicalDocument[] } : null; }
  catch { return null; }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(loadState, []);
  const [user, setUser] = useState<User | null>(users.patient);
  const [appointments, setAppointments] = useState<Appointment[]>(saved?.appointments ?? initialAppointments);
  const [documents, setDocuments] = useState<MedicalDocument[]>(saved?.documents ?? initialDocuments);
  const [notifications, setNotifications] = useState(seedNotifications);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const role = user?.role ?? 'patient';
  const persist = useCallback((nextAppointments: Appointment[], nextDocuments: MedicalDocument[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ appointments: nextAppointments, documents: nextDocuments })), []);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now(); setToasts(items => [...items, { id, tone, message }]);
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 3200);
  }, []);
  const value = useMemo<StoreValue>(() => ({
    user, role, appointments, documents, notifications, toasts,
    login: selectedRole => setUser(users[selectedRole]), logout: () => setUser(null), switchRole: selectedRole => setUser(users[selectedRole]),
    addAppointment: appointment => setAppointments(items => { const next = [appointment, ...items]; persist(next, documents); return next; }),
    updateAppointment: (id, status) => setAppointments(items => { const next = items.map(item => item.id === id ? { ...item, status } : item); persist(next, documents); return next; }),
    addDocument: document => setDocuments(items => { const next = [document, ...items]; persist(appointments, next); return next; }),
    toggleShare: (id, doctor) => setDocuments(items => { const next = items.map(item => item.id === id ? { ...item, sharedWith: item.sharedWith.includes(doctor) ? item.sharedWith.filter(name => name !== doctor) : [...item.sharedWith, doctor] } : item); persist(appointments, next); return next; }),
    markAllRead: () => setNotifications(items => items.map(item => ({ ...item, read: true }))), notify,
  }), [user, role, appointments, documents, notifications, toasts, persist, notify]);
  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore() { const value = useContext(Store); if (!value) throw new Error('StoreProvider missing'); return value; }

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Doctor } from '../domain';

export function useDoctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => onSnapshot(
    query(collection(db, 'doctorProfiles'), where('verified', '==', true), where('status', '==', 'active')),
    snapshot => { setDoctors(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as Doctor)); setLoading(false); },
    () => { setError('Doctor availability could not be loaded. Please try again shortly.'); setLoading(false); },
  ), []);
  return { doctors, loading, error };
}

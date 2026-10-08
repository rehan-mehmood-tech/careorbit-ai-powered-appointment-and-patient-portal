import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut as firebaseSignOut, updateProfile, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import type { Role, User } from '../domain';

type PublicRole = Exclude<Role, 'admin'>;
interface UserRecord { displayName: string; email: string; role: Role; status: 'active'|'pending'|'suspended'; photoURL?: string; }

async function readUser(firebaseUser: FirebaseUser): Promise<User> {
  const snapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!snapshot.exists()) throw new Error('Your account profile is not configured. Contact CareOrbit support.');
  const record = snapshot.data() as UserRecord;
  if (record.status === 'suspended') throw new Error('This account is suspended. Contact CareOrbit support.');
  return { id: firebaseUser.uid, name: record.displayName || firebaseUser.displayName || 'CareOrbit member', email: firebaseUser.email ?? record.email, role: record.role, avatar: initials(record.displayName || firebaseUser.displayName || 'CO') };
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join(''); }

export async function registerWithEmail(name: string, email: string, password: string, role: PublicRole) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', credential.user.uid), { displayName: name.trim(), email: email.trim().toLowerCase(), role, status: role === 'doctor' ? 'pending' : 'active', createdAt: serverTimestamp() });
  await setDoc(doc(db, role === 'doctor' ? 'doctorProfiles' : 'patientProfiles', credential.user.uid), { userId: credential.user.uid, onboardingComplete: false, createdAt: serverTimestamp() });
  await sendEmailVerification(credential.user);
  return readUser(credential.user);
}

export async function loginWithEmail(email: string, password: string, expectedRole: Role) {
  const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  const user = await readUser(credential.user);
  if (user.role !== expectedRole) { await firebaseSignOut(auth); throw new Error(`This account belongs to the ${user.role} portal.`); }
  return user;
}

export async function signInWithGoogle(expectedRole: Role, createIfMissing: boolean) {
  const credential = await signInWithPopup(auth, googleProvider);
  const ref = doc(db, 'users', credential.user.uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    if (!createIfMissing || expectedRole === 'admin') { await firebaseSignOut(auth); throw new Error('No authorized CareOrbit account exists for this Google identity.'); }
    const role = expectedRole as PublicRole;
    await setDoc(ref, { displayName: credential.user.displayName ?? 'CareOrbit member', email: credential.user.email, role, status: role === 'doctor' ? 'pending' : 'active', photoURL: credential.user.photoURL, createdAt: serverTimestamp() });
    await setDoc(doc(db, role === 'doctor' ? 'doctorProfiles' : 'patientProfiles', credential.user.uid), { userId: credential.user.uid, onboardingComplete: false, createdAt: serverTimestamp() });
  }
  const user = await readUser(credential.user);
  if (user.role !== expectedRole) { await firebaseSignOut(auth); throw new Error(`This Google account belongs to the ${user.role} portal.`); }
  return user;
}

export async function resetPassword(email: string) { await sendPasswordResetEmail(auth, email.trim().toLowerCase()); }
export async function signOut() { await firebaseSignOut(auth); }
export { readUser };

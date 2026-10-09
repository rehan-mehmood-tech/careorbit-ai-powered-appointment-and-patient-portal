import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut as firebaseSignOut, updateProfile, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import type { Role, User } from '../domain';
type PublicRole=Exclude<Role,'admin'>;
interface UserRecord{displayName:string;email:string;role:Role;status:'active'|'pending'|'suspended';photoURL?:string}
const DEMO_PROFILES:Record<string,{displayName:string;role:Role;status:'active'|'pending'}>={
 'patient@careorbit.test':{displayName:'Sara Ahmed',role:'patient',status:'active'},
 'doctor@careorbit.test':{displayName:'Dr. Ayesha Khan',role:'doctor',status:'active'},
};
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')}
async function ensureDemoProfile(firebaseUser:FirebaseUser,expectedRole:Role){
 const email=firebaseUser.email?.toLowerCase(); const demo=email?DEMO_PROFILES[email]:undefined;
 if(!demo||demo.role!==expectedRole)return;
 const ref=doc(db,'users',firebaseUser.uid); const snapshot=await getDoc(ref);
 if(snapshot.exists())return;
 await setDoc(ref,{...demo,email,createdAt:serverTimestamp(),developmentAccount:true});
 await setDoc(doc(db,demo.role==='doctor'?'doctorProfiles':'patientProfiles',firebaseUser.uid),{userId:firebaseUser.uid,onboardingComplete:false,developmentAccount:true,createdAt:serverTimestamp()},{merge:true});
}
async function readUser(firebaseUser:FirebaseUser):Promise<User>{
 let snapshot;
 try{snapshot=await getDoc(doc(db,'users',firebaseUser.uid))}catch(error){
  const fallback=firebaseUser.email?DEMO_PROFILES[firebaseUser.email.toLowerCase()]:undefined;
  if(fallback)return{id:firebaseUser.uid,name:fallback.displayName,email:firebaseUser.email,role:fallback.role,avatar:initials(fallback.displayName)};
  throw error
 }
 if(!snapshot.exists()){const fallback=firebaseUser.email?DEMO_PROFILES[firebaseUser.email.toLowerCase()]:undefined;if(fallback)return{id:firebaseUser.uid,name:fallback.displayName,email:firebaseUser.email,role:fallback.role,avatar:initials(fallback.displayName)};throw new Error('Your Firebase Authentication user exists, but its CareOrbit profile is missing. Sign in with the matching portal or contact support.')}
 const record=snapshot.data() as UserRecord;
 if(record.status==='suspended')throw new Error('This account is suspended. Contact CareOrbit support.');
 if(!['patient','doctor','admin'].includes(record.role))throw new Error('This account has an invalid CareOrbit role.');
 return{id:firebaseUser.uid,name:record.displayName||firebaseUser.displayName||'CareOrbit member',email:firebaseUser.email??record.email,role:record.role,avatar:initials(record.displayName||firebaseUser.displayName||'CO')};
}
export async function registerWithEmail(name:string,email:string,password:string,role:PublicRole){const credential=await createUserWithEmailAndPassword(auth,email.trim().toLowerCase(),password);await updateProfile(credential.user,{displayName:name.trim()});await setDoc(doc(db,'users',credential.user.uid),{displayName:name.trim(),email:email.trim().toLowerCase(),role,status:role==='doctor'?'pending':'active',createdAt:serverTimestamp()});await setDoc(doc(db,role==='doctor'?'doctorProfiles':'patientProfiles',credential.user.uid),{userId:credential.user.uid,onboardingComplete:false,createdAt:serverTimestamp()});await sendEmailVerification(credential.user);return readUser(credential.user)}
export async function loginWithEmail(email:string,password:string,expectedRole:Role){const credential=await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);try{await ensureDemoProfile(credential.user,expectedRole).catch(()=>undefined);const user=await readUser(credential.user);if(user.role!==expectedRole)throw new Error(`This account belongs to the ${user.role} portal.`);return user}catch(error){await firebaseSignOut(auth);throw error}}
export async function signInWithGoogle(expectedRole:Role,createIfMissing:boolean){const credential=await signInWithPopup(auth,googleProvider);const ref=doc(db,'users',credential.user.uid);const snapshot=await getDoc(ref);if(!snapshot.exists()){if(!createIfMissing||expectedRole==='admin'){await firebaseSignOut(auth);throw new Error('No authorized CareOrbit account exists for this Google identity.')}const role=expectedRole as PublicRole;await setDoc(ref,{displayName:credential.user.displayName??'CareOrbit member',email:credential.user.email,role,status:role==='doctor'?'pending':'active',photoURL:credential.user.photoURL,createdAt:serverTimestamp()});await setDoc(doc(db,role==='doctor'?'doctorProfiles':'patientProfiles',credential.user.uid),{userId:credential.user.uid,onboardingComplete:false,createdAt:serverTimestamp()})}const user=await readUser(credential.user);if(user.role!==expectedRole){await firebaseSignOut(auth);throw new Error(`This Google account belongs to the ${user.role} portal.`)}return user}
export async function resetPassword(email:string){await sendPasswordResetEmail(auth,email.trim().toLowerCase())}
export async function signOut(){await firebaseSignOut(auth)}
export{readUser};


import type { Role, User } from '../domain';

type PublicRole = Exclude<Role, 'admin'>;
type ApiUser = { id:string; email:string; role:Role; status:string; name:string; emailVerified:boolean; onboardingState:string };
type Envelope<T> = { data:T; meta:{requestId:string} };
const apiBase=(import.meta.env.VITE_API_URL||'http://127.0.0.1:3001').replace(/\/$/,'');
let accessToken:string|null=null;
let refreshPromise:Promise<User|null>|null=null;

function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')}
function user(value:ApiUser):User{return{id:value.id,name:value.name,email:value.email,role:value.role,avatar:initials(value.name),status:value.status,emailVerified:value.emailVerified,onboardingState:value.onboardingState}}
function cookie(name:string):string{return document.cookie.split('; ').find(item=>item.startsWith(`${name}=`))?.split('=').slice(1).join('=')??''}

async function raw<T>(path:string,init:RequestInit={}):Promise<T>{
 const headers=new Headers(init.headers);if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
 if(accessToken)headers.set('authorization',`Bearer ${accessToken}`);
 if(!['GET','HEAD'].includes((init.method||'GET').toUpperCase())){const csrf=cookie('careorbit_csrf');if(csrf)headers.set('x-csrf-token',decodeURIComponent(csrf));}
 const response=await fetch(`${apiBase}/api/v1${path}`,{...init,headers,credentials:'include'});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload?.error?.message||'CareOrbit request failed');
 return payload as T;
}

async function establish(path:string,body:unknown):Promise<User>{const result=await raw<Envelope<{accessToken:string;user:ApiUser}>>(path,{method:'POST',body:JSON.stringify(body)});accessToken=result.data.accessToken;return user(result.data.user)}
export async function registerWithEmail(name:string,email:string,password:string,accountType:PublicRole){const result=await raw<Envelope<{user:ApiUser}>>('/auth/register',{method:'POST',body:JSON.stringify({name,email,password,accountType,role:'ignored-by-server'})});return user(result.data.user)}
export async function loginWithEmail(email:string,password:string,expectedRole:Role){return establish('/auth/login',{email,password,expectedRole})}
export async function bootstrapSession():Promise<User|null>{if(refreshPromise)return refreshPromise;refreshPromise=establish('/auth/refresh',{}).catch(()=>{accessToken=null;return null}).finally(()=>{refreshPromise=null});return refreshPromise}
export async function resetPassword(email:string){await raw('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})})}
export async function completePasswordReset(token:string,password:string){await raw('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})})}
export async function verifyEmail(token:string){await raw('/auth/verify-email',{method:'POST',body:JSON.stringify({token})})}
export async function signOut(){try{await raw('/auth/logout',{method:'POST'})}finally{accessToken=null}}
export async function authenticatedRequest<T>(path:string,init:RequestInit={}):Promise<T>{try{return await raw<T>(path,init)}catch(error){const refreshed=await bootstrapSession();if(!refreshed){rememberReturnDestination();throw error}return raw<T>(path,init)}}
export function rememberReturnDestination(){const value=`${location.pathname}${location.search}`;if(value.startsWith('/')&&!value.startsWith('//'))sessionStorage.setItem('careorbit_return_to',value)}
export function consumeReturnDestination(fallback:string):string{const value=sessionStorage.getItem('careorbit_return_to');sessionStorage.removeItem('careorbit_return_to');return value&&value.startsWith('/')&&!value.startsWith('//')?value:fallback}

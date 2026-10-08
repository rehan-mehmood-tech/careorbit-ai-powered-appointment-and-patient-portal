import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarBlank, ChartBar, ChatsCircle, ClipboardText, ClockCounterClockwise, FileText, Gear, House, List, MagnifyingGlass, SignOut, Stethoscope, Users, X, Bell, ShieldCheck, Briefcase, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useStore } from './store';
import type { AppointmentStatus } from './domain';

export function Logo({ compact = false }: { compact?: boolean }) { return <Link to="/" className="logo" aria-label="CareOrbit home"><span className="logo-mark"><img src="/assets/careorbit-logo.png" alt="" /></span>{compact ? null : <span>Care<span>Orbit</span></span>}</Link>; }
const patientNav = [['Overview','/app'],['Find a doctor','/app/doctors'],['Appointments','/app/appointments'],['Documents','/app/documents'],['Messages','/app/messages'],['History','/app/history'],['Notifications','/app/notifications'],['Settings','/app/settings']] as const;
const doctorNav = [['Overview','/doctor'],['Appointments','/doctor/appointments'],['Calendar','/doctor/calendar'],['Availability','/doctor/availability'],['Patient workspace','/doctor/workspace'],['Messages','/doctor/messages'],['Profile & clinics','/doctor/profile'],['Settings','/doctor/settings']] as const;
const adminNav = [['Overview','/admin'],['Patients','/admin/patients'],['Doctors','/admin/doctors'],['Appointments','/admin/appointments'],['Reports','/admin/reports'],['Audit log','/admin/audit'],['Processing jobs','/admin/jobs'],['Settings','/admin/settings']] as const;
const icons: Record<string, ReactNode> = { Overview:<House/>, 'Find a doctor':<MagnifyingGlass/>, Appointments:<CalendarBlank/>, Documents:<FileText/>, Messages:<ChatsCircle/>, History:<ClockCounterClockwise/>, Notifications:<Bell/>, Settings:<Gear/>, Calendar:<CalendarBlank/>, Availability:<ClockCounterClockwise/>, 'Patient workspace':<ClipboardText/>, 'Profile & clinics':<Stethoscope/>, Patients:<Users/>, Doctors:<Stethoscope/>, Reports:<ChartBar/>, 'Audit log':<ShieldCheck/>, 'Processing jobs':<Briefcase/> };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, logout, notifications } = useStore(); const [open, setOpen] = useState(false); const navigate = useNavigate(); const location = useLocation();
  const nav = role === 'patient' ? patientNav : role === 'doctor' ? doctorNav : adminNav;
  const title = nav.find(([, href]) => href === location.pathname)?.[0] ?? 'CareOrbit';
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}><div className="side-head"><Logo/><button className="icon-btn mobile-only" onClick={() => setOpen(false)} aria-label="Close menu"><X/></button></div>
      <div className="role-label">{role} portal</div><nav>{nav.map(([label, href]) => <NavLink end={href === '/app' || href === '/doctor' || href === '/admin'} key={href} to={href} onClick={() => setOpen(false)}>{icons[label]}<span>{label}</span></NavLink>)}</nav>
      <div className="side-footer"><div className="privacy-note"><ShieldCheck/><div><strong>Private by design</strong><span>Your health data stays protected.</span></div></div><button className="nav-button" onClick={() => { logout(); navigate('/login'); }}><SignOut/>Sign out</button></div>
    </aside>
    {open ? <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation"/> : null}
    <main><header className="topbar"><button className="icon-btn mobile-only" onClick={() => setOpen(true)} aria-label="Open menu"><List/></button><div><p>{new Date().toLocaleDateString('en-PK', { weekday:'long', day:'numeric', month:'long' })}</p><h1>{title}</h1></div><div className="top-actions"><Link className="icon-btn notification-button" to={role === 'patient' ? '/app/notifications' : role === 'doctor' ? '/doctor/messages' : '/admin/jobs'} aria-label="Notifications"><Bell/>{notifications.some(n => !n.read) ? <i/> : null}</Link><div className="avatar">{user?.avatar}</div><div className="user-meta"><strong>{user?.name}</strong><span>{role}</span></div></div></header><div className="page">{children}</div></main>
  </div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'danger'|'ghost' }) { return <button className={`button ${variant} ${className}`} {...props}>{children}</button>; }
export function Badge({ status }: { status: AppointmentStatus | string }) { return <span className={`badge ${status.toLowerCase().replaceAll(' ','-')}`}>{status}</span>; }
export function Metric({ label, value, detail, icon }: { label:string; value:string; detail:string; icon:ReactNode }) { return <article className="metric"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>; }
export function Empty({ icon = <FileText/>, title, text, action }: { icon?:ReactNode; title:string; text:string; action?:ReactNode }) { return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function SectionHead({ title, subtitle, action }: { title:string; subtitle?:string; action?:ReactNode }) { return <div className="section-head"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{action}</div>; }
export function Toasts() { const { toasts } = useStore(); return <div className="toasts" aria-live="polite">{toasts.map(toast => <div key={toast.id} className={`toast ${toast.tone}`}>{toast.tone === 'error' ? <WarningCircle/> : <CheckCircle/>}{toast.message}</div>)}</div>; }
export function Modal({ title, children, onClose }: { title:string; children:ReactNode; onClose:()=>void }) { return <div className="modal-layer" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X/></button></div>{children}</div></div>; }
export function PageTabs({ tabs, active, onChange }: { tabs:string[]; active:string; onChange:(tab:string)=>void }) { return <div className="tabs" role="tablist">{tabs.map(tab => <button role="tab" aria-selected={active === tab} className={active === tab ? 'active' : ''} onClick={() => onChange(tab)} key={tab}>{tab}</button>)}</div>; }

import { CalendarBlank, ChatCircleDots, CreditCard, DeviceMobile, Prescription, VideoCamera } from '@phosphor-icons/react';
import { Badge, Button, SectionHead } from './components';

const features=[
  {icon:<ChatCircleDots/>,name:'AI appointment assistant',release:'R2',text:'Conversational discovery using live availability, with explicit booking review.'},
  {icon:<CalendarBlank/>,name:'External calendar sync',release:'R2',text:'Private ICS and permissioned Google or Outlook connections.'},
  {icon:<CreditCard/>,name:'Payments & refunds',release:'R3',text:'Hosted checkout, signed webhooks, receipts, and reconciliation.'},
  {icon:<VideoCamera/>,name:'Video consultations',release:'R3',text:'Appointment-authorized rooms with device check and reconnect.'},
  {icon:<Prescription/>,name:'Digital prescriptions',release:'R3',text:'Doctor-only, encounter-linked, versioned issuance after legal review.'},
  {icon:<DeviceMobile/>,name:'Progressive web app',release:'R2',text:'Installable shell; private clinical records excluded from offline cache.'},
];
export function ExtendedFeatures(){return <div className="stack"><SectionHead title="Platform settings & roadmap" subtitle="External services remain disabled until providers, policy, and credentials are approved."/><section className="panel"><div className="setting-row"><div><strong>Market & timezone</strong><p>Lahore, Pakistan · PKR · Asia/Karachi</p></div><Button variant="secondary">Configure</Button></div><div className="setting-row"><div><strong>Cancellation cutoff</strong><p>2 hours before appointment start</p></div><Button variant="secondary">Configure</Button></div><div className="setting-row"><div><strong>Auto-confirmation</strong><p>Disabled · doctors confirm new requests</p></div><Badge status="Disabled"/></div></section><SectionHead title="Extended releases" subtitle="Designed in the product model, but correctly labeled unavailable until integrations pass release gates."/><div className="feature-grid">{features.map(f=><article className="panel feature-card" key={f.name}><span>{f.icon}</span><Badge status={f.release}/><h3>{f.name}</h3><p>{f.text}</p><Button variant="secondary" disabled>Provider not connected</Button></article>)}</div></div>}

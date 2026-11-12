import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarCheck2, CarFront, CheckCircle2, ChevronRight, Clock3, CreditCard, LocateFixed, MapPin, Navigation2, Search, ShieldCheck, Sparkles, TicketCheck, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import LocationCard from '../components/LocationCard';
import { Spinner } from '../components/Status';
const perks=[{icon:Search,title:'Discover instantly',text:'Find nearby parking that actually has space.'},{icon:CalendarCheck2,title:'Book in seconds',text:'Reserve your preferred spot before you leave.'},{icon:TicketCheck,title:'Drive right in',text:'One QR ticket. Smooth entry and exit.'}];
export default function Home(){
  const [q,setQ]=useState(''),[locations,setLocations]=useState([]),[loading,setLoading]=useState(true);
  const nav=useNavigate();
  useEffect(()=>{api('/locations').then(setLocations).catch(()=>{}).finally(()=>setLoading(false));},[]);
  return <>
    <div className="hero-wrapper"><div className="container hero-grid"><div className="hero-content"><div className="eyebrow"><span className="eyebrow-dot"/> THE SMARTER WAY TO PARK <Sparkles size={13}/></div>
      <h1>Less searching.<br/><span>More living.</span></h1><p className="hero-description">Your perfect parking spot is just a few taps away. Find, reserve, and park with complete peace of mind.</p>
      <form className="hero-search" onSubmit={e=>{e.preventDefault();nav(`/parkings?q=${encodeURIComponent(q)}`);}}><MapPin size={21} className="search-pin"/><input aria-label="Where would you like to park?" value={q} onChange={e=>setQ(e.target.value)} placeholder="Enter a city, area or destination"/><button className="btn btn-primary" type="submit">Find parking <ArrowRight size={18}/></button></form>
      <div className="hero-checks"><span><CheckCircle2 size={17}/> Real-time availability</span><span><CheckCircle2 size={17}/> Secure booking</span></div>
      <div className="hero-trust"><div className="avatar-stack"><span>AS</span><span>RK</span><span>MS</span><span>VP</span></div><div><strong>Made for effortless parking</strong><small>One simple experience for every journey</small></div></div>
    </div><div className="hero-scene"><div className="hero-scene-glow"/><div className="scene-orbit orb-a"/><div className="scene-orbit orb-b"/><div className="scene-topbadge"><div className="scene-round-icon"><Navigation2 size={20}/></div><div><strong>Spot found!</strong><span>Ready for your arrival</span></div><CheckCircle2 size={20} color="#1dcf9f"/></div><div className="parking-visual"><div className="visual-top"><span><span className="visual-green-dot"/> LIVE PARKING MAP</span><span>FLOOR G · ZONE A</span></div><div className="visual-lanes"><div className="visual-road"><div className="lane-center"/></div>{['A1','A2','A3','A4','B1','B2','B3','B4'].map((s,i)=><div key={s} className={`visual-slot visual-slot-${i%4===1?'occupied':i===2?'selected':'free'}`}><CarFront size={27}/><span>{s}</span></div>)}</div><div className="visual-bottom"><span><i/> 5 AVAILABLE SPOTS</span><div className="visual-signal">↗</div></div></div>
    <div className="scene-bottombadge"><span className="ticket-illustration"><TicketCheck size={25}/></span><div><strong>You're all set.</strong><small>QR ticket generated instantly</small></div><span className="scene-check">✓</span></div></div></div></div>
    <section className="container section section-locations"><div className="section-heading"><div><div className="section-kicker">HANDPICKED FOR YOU</div><h2>Popular parking spots<span className="heading-dot">.</span></h2><p>Great locations. Effortless parking. Every time.</p></div><Link to="/parkings" className="text-link">Explore all parking <ArrowUpRight size={18}/></Link></div>
    {loading?<Spinner/>:<div className="locations-grid">{locations.slice(0,3).map(l=><LocationCard key={l._id} location={l}/>)}</div>}
    </section>
    <section className="steps-section"><div className="container"><div className="section-heading center-heading"><div className="section-kicker">HOW IT WORKS</div><h2>Three steps. Zero stress<span className="heading-dot">.</span></h2><p>From searching to parking, we've made it delightfully easy.</p></div><div className="steps-grid">{perks.map(({icon:Icon,title,text},i)=><div className="step-card" key={title}><span className="step-number">0{i+1}</span><div className="step-icon"><Icon size={28}/></div><h3>{title}</h3><p>{text}</p>{i!==2&&<ChevronRight className="step-chevron" size={22}/>}</div>)}</div></div></section>
    <section className="container bottom-cta"><div className="cta-pattern"/><div><div className="section-kicker">PARK SMARTER TODAY</div><h2>Ready to make parking<br/>the easiest part of your day?</h2><p>Discover available parking spaces and secure your spot in seconds.</p><Link to="/parkings" className="btn btn-white">Explore parking spots <ArrowRight size={18}/></Link></div><div className="cta-icon"><CarFront size={120} strokeWidth={1}/></div></section>
  </>;
}

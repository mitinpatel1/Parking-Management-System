import { ArrowUpRight, CarFront, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney, locationImageClass } from '../lib/api';
export default function LocationCard({ location, distanceKm }) {
  const total = location.stats?.total || 0, busy = location.stats?.occupied || 0;
  return <Link to={`/parking/${location._id}`} className="location-card">
    <div className={locationImageClass(location.cover)}>
      <div className="art-street"><div className="art-building b1"/><div className="art-building b2"/><div className="art-building b3"/></div>
      <div className="art-ground"><div className="art-roadline"/><CarFront className="art-car" size={73} strokeWidth={1.1}/></div>
      <span className="art-chip"><ShieldCheck size={13}/> Verified lot</span>
      <span className="art-open">{location.isOpen ? 'Open 24/7' : 'Closed'}</span>
    </div>
    <div className="location-card-body"><div className="location-topline"><span className="muted">{location.kind?.toUpperCase()} PARKING</span><ArrowUpRight size={19}/></div>
      <h3>{location.name}</h3><p className="address"><MapPin size={15}/> {location.area}, {location.city}</p>
      {Number.isFinite(distanceKm) && <div className="distance-chip"><MapPin size={13}/> Approx. {distanceKm.toFixed(1)} km from you (straight-line)</div>}
      <div className="location-bottom"><span><CarFront size={16}/> {Math.max(0,total-busy)} / {total} spots</span><span className="location-rate">From <b>{formatMoney(Math.min(...Object.values(location.prices || { car: 40 })))}/hr</b></span></div>
      {location.stats?.ev > 0 && <div className="ev-label"><Zap size={12}/> EV charging available</div>}
    </div>
  </Link>;
}

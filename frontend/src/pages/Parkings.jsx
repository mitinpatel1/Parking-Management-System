import { useEffect, useMemo, useState } from 'react';
import { Filter, LocateFixed, MapPinned, Search, SlidersHorizontal, Zap } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import LocationCard from '../components/LocationCard';
import { Empty, ErrorBanner, Spinner } from '../components/Status';
function km(a,b,c,d){const p=Math.PI/180, x=(c-a)*p, y=(d-b)*p, z=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));}
export default function Parkings(){
  const [params,setParams]=useSearchParams();const [query,setQuery]=useState(params.get('q')||'');
  const [locations,setLocations]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[kind,setKind]=useState(''),[ev,setEv]=useState(false),[userPos,setUserPos]=useState(null),[sort,setSort]=useState('recommended');
  useEffect(()=>{
    const controller=new AbortController();
    setError('');
    setLoading(true);
    api(`/locations?q=${encodeURIComponent(params.get('q')||'')}`,{signal:controller.signal})
      .then(d=>{ setError(''); setLocations(d); })
      .catch(e=>{ if(e.name!=='AbortError') setError(e.message); })
      .finally(()=>{ if(!controller.signal.aborted) setLoading(false); });
    return()=>controller.abort();
  },[params]);
  const shown=useMemo(()=>{let arr=locations.filter(l=>(!kind||l.kind===kind)&&(!ev||l.stats?.ev>0));if(sort==='low')arr.sort((a,b)=>a.prices?.car-b.prices?.car);if(sort==='near'&&userPos)arr.sort((a,b)=>km(userPos.lat,userPos.lng,a.lat,a.lng)-km(userPos.lat,userPos.lng,b.lat,b.lng));return arr;},[locations,kind,ev,sort,userPos]);
  const locate=()=>{if(!navigator.geolocation){setError('Geolocation not supported in this browser');return;}navigator.geolocation.getCurrentPosition(p=>{setUserPos({lat:p.coords.latitude,lng:p.coords.longitude});setSort('near');},()=>setError('Location permission denied. Allow location access to sort by distance.'),{enableHighAccuracy:false,timeout:10000});};
  return <div className="container inner-page"><div className="page-intro"><div className="section-kicker">EXPLORE PARKING</div><h1>Find your happy place to <em>park.</em></h1><p>Discover secure, convenient parking near your destination.</p></div>
    <div className="search-toolbar"><form className="wide-search" onSubmit={e=>{e.preventDefault();setParams(query?{q:query}:{});}}><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search city, area or parking name"/><button type="submit" className="btn btn-primary btn-sm">Search</button></form><button className="btn btn-outline" onClick={locate}><LocateFixed size={17}/> Near me</button></div>
    <div className="filter-bar"><div className="filter-group"><SlidersHorizontal size={18}/><span>Filter by:</span><select value={kind} onChange={e=>setKind(e.target.value)} aria-label="Location type"><option value="">All types</option><option value="mall">Shopping malls</option><option value="office">Office</option><option value="airport">Airport</option><option value="station">Metro / station</option><option value="public">Public parking</option></select><label className="filter-check"><input type="checkbox" checked={ev} onChange={e=>setEv(e.target.checked)}/><Zap size={15}/> EV charging</label></div><div className="filter-group"><span>Sort:</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">Recommended</option><option value="low">Lowest car rate</option><option value="near" disabled={!userPos}>Nearest to me</option></select></div></div>
    <ErrorBanner message={error} onClose={()=>setError('')}/>
    <div className="results-title"><h2>{loading?'Searching':`${shown.length} parking locations`}</h2><p>All listed venues are seeded demonstration locations</p></div>
    {loading?<Spinner/>:shown.length?<div className="locations-grid locations-grid-results">{shown.map(l=><LocationCard location={l} key={l._id} distanceKm={userPos && l.lat && l.lng ? km(userPos.lat,userPos.lng,l.lat,l.lng) : undefined}/>)}</div>:<Empty icon={MapPinned} title="No parking spots found" message="Try another city or remove one of your filters."/>}
  </div>;
}

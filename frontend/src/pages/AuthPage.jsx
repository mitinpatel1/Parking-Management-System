import { useState } from 'react';
import { ArrowRight, CarFront, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { ErrorBanner } from '../components/Status';
import { useAuth } from '../contexts/AuthContext';
export default function AuthPage({mode}){
  const isRegister=mode==='register', {user,login,register}=useAuth(),nav=useNavigate(),location=useLocation();
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[phone,setPhone]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(user)return <Navigate to={user.role==='admin'?'/dashboard':user.role==='staff'?'/gate':'/'} replace/>;
  const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{const result=isRegister?await register({name,email,password,phone}):await login(email,password);nav(location.state?.from || (result.role==='admin'?'/dashboard':result.role==='staff'?'/gate':'/'),{replace:true});}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <div className="auth-shell"><div className="auth-left"><div className="auth-brand"><Brand light/></div><div className="auth-illustration"><div className="auth-glow"/><div className="auth-parking-card"><span><i/> PARKING CONFIRMED</span><CarFront size={128} strokeWidth={1.1}/><div><b>Spot A03</b><small>Ready when you are</small></div></div><div className="auth-float-card"><CheckCircle2 size={21}/><div><b>Easy. Reliable. Smart.</b><small>Parking, just how it should be.</small></div></div></div><div className="auth-copy"><span className="section-kicker">MOVE FREELY</span><h2>Every great journey<br/>starts with an easy park.</h2><p>Find a spot you'll love, book it in seconds, and spend more time where it matters.</p></div><div className="auth-footer">© {new Date().getFullYear()} ParkEase. Park happier.</div></div>
    <div className="auth-right"><Link to="/" className="auth-back">← Back to Parking</Link><div className="auth-form-wrap"><div className="auth-topicon"><LockKeyhole size={22}/></div><div className="section-kicker">OPERATOR PORTAL</div><h1>Staff & Admin Sign In</h1><p>Sign in with your operator credentials to manage parking gate, slots, and revenue.</p><ErrorBanner message={error} onClose={()=>setError('')}/>
      <form className="auth-form" onSubmit={submit}>
        <label className="field">Email address<div className="input-icon-wrap"><Mail size={19}/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="admin@parkease.local"/></div></label>
        <label className="field">Password<div className="input-icon-wrap"><LockKeyhole size={19}/><input type={show?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Enter password"/><button type="button" className="show-pass" aria-label="Toggle password visibility" onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
        <button disabled={busy} className="btn btn-primary btn-block auth-submit">{busy?'Please wait…':'Sign in to Console'} <ArrowRight size={19}/></button></form>
      <div style={{marginTop:'1.2rem',padding:'0.8rem 1rem',borderRadius:'10px',background:'#f4f5fa',fontSize:'0.85rem',color:'#555e77'}}>
        <strong>Demo Credentials:</strong><br/>
        Admin: <code>admin@parkease.local</code><br/>
        Staff: <code>staff@parkease.local</code><br/>
        Password: <code>ChangeThisAdminPassword123!</code>
      </div>
      <div className="auth-safe" style={{marginTop:'1rem'}}><ShieldCheck size={16}/> Protected operator workspace</div>
    </div></div></div>;
}

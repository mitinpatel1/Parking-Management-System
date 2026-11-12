import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api, formatDate } from '../lib/api';
import { useLive } from '../contexts/LiveContext';
export default function Notifications() {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]);
  const { version } = useLive();
  useEffect(() => { api('/notifications').then(setRows).catch(() => {}); }, [version, open]);
  const unread = rows.filter(r => !r.read).length;
  const readAll = async () => { try { await api('/notifications/read-all', { method: 'PATCH' }); setRows(r => r.map(n => ({...n,read:true}))); } catch {} };
  return <div className="notif-wrapper"><button className="icon-btn notif-btn" aria-label="Notifications" onClick={() => setOpen(!open)}><Bell size={20}/>{unread>0 && <span className="notif-dot"/>}</button>
    {open && <><div className="notif-dismiss" onClick={() => setOpen(false)}/><div className="notif-panel"><div className="notif-panel-head"><b>Notifications</b><button className="link-button" onClick={readAll}><CheckCheck size={14}/> Mark read</button></div>
    <div className="notif-list">{rows.length ? rows.map(n => <div className={`notif-entry ${n.read ? '' : 'is-unread'}`} key={n._id}><strong>{n.title}</strong><p>{n.message}</p><small>{formatDate(n.createdAt)}</small></div>) : <div className="notif-entry">You're all caught up.</div>}</div></div></>}
  </div>;
}

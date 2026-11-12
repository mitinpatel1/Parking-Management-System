export function Status({ value }) {
  const cls = { confirmed: 'success', completed: 'neutral', checked_in: 'blue', payment_due: 'warning', pending_payment: 'warning', cancelled: 'danger', expired: 'danger', paid: 'success', unpaid: 'warning', available: 'success', occupied: 'danger', maintenance: 'neutral' }[value] || 'neutral';
  return <span className={`status-pill status-${cls}`}><i/>{String(value || '—').replace(/_/g, ' ')}</span>;
}
export function Empty({ icon: Icon, title, message, action }) { return <div className="empty-state">{Icon && <span className="empty-icon"><Icon size={30}/></span>}<h3>{title}</h3><p>{message}</p>{action}</div>; }
export function Spinner() { return <div className="loading-container"><div className="spinner"/><span>Loading ParkEase…</span></div>; }
export function ErrorBanner({ message, onClose }) { return message && <div className="error-banner" role="alert"><span>{message}</span>{onClose && <button onClick={onClose}>×</button>}</div>; }

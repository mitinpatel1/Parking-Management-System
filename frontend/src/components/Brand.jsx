import { SquareParking } from 'lucide-react';
import { Link } from 'react-router-dom';
export default function Brand({ light = false }) { return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-logo"><SquareParking size={22} strokeWidth={2.5}/></span><span>Park<span>Ease</span><small>.</small></span></Link>; }

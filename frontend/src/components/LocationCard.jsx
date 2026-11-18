
import {
  ArrowUpRight,
  CarFront,
  MapPin,
  ShieldCheck,
  Zap
} from 'lucide-react';

import { Link } from 'react-router-dom';
import { formatMoney, locationImageClass } from '../lib/api';

export default function LocationCard({ location, distanceKm }) {
  const total = location.stats?.total || 0;

  const available =
    location.stats?.available ??
    Math.max(0, total - (location.stats?.occupied || 0));

  const prices = Object.values(location.prices || {})
    .map(Number)
    .filter(price => Number.isFinite(price) && price >= 0);

  const minimumPrice = prices.length
    ? Math.min(...prices)
    : 40;

  const distance =
    Number.isFinite(distanceKm)
      ? distanceKm
      : Number.isFinite(location.distanceKm)
        ? location.distanceKm
        : null;

  return (
    <Link
      to={`/parking/${location._id}`}
      className="location-card"
    >
      <div className={locationImageClass(location.cover)}>
        <div className="art-street">
          <div className="art-building b1" />
          <div className="art-building b2" />
          <div className="art-building b3" />
        </div>

        <div className="art-ground">
          <div className="art-roadline" />
          <CarFront
            className="art-car"
            size={73}
            strokeWidth={1.1}
          />
        </div>

        <span className="art-chip">
          <ShieldCheck size={13} />
          Verified lot
        </span>

        <span className="art-open">
          {location.isOpen ? 'Open' : 'Closed'}
        </span>
      </div>

      <div className="location-card-body">
        <div className="location-topline">
          <span className="muted">
            {location.kind?.toUpperCase()} PARKING
          </span>

          <ArrowUpRight size={19} />
        </div>

        <h3>{location.name}</h3>

        <p className="address">
          <MapPin size={15} />
          {location.area}, {location.city}
        </p>

        {distance !== null && (
          <div className="distance-chip">
            <MapPin size={13} />
            {distance.toFixed(1)} km from you
          </div>
        )}

        <div className="location-bottom">
          <span>
            <CarFront size={16} />
            {available} / {total} available
          </span>

          <span className="location-rate">
            From <b>{formatMoney(minimumPrice)}/hr</b>
          </span>
        </div>

        {location.stats?.ev > 0 && (
          <div className="ev-label">
            <Zap size={12} />
            EV charging available
          </div>
        )}
      </div>
    </Link>
  );
}

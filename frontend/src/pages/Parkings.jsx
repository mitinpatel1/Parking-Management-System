
import { useEffect, useMemo, useState } from 'react';
import {
  LocateFixed,
  MapPinned,
  Search,
  SlidersHorizontal,
  Zap,
  Navigation
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { api } from '../lib/api';
import LocationCard from '../components/LocationCard';
import { Empty, ErrorBanner, Spinner } from '../components/Status';

export default function Parkings() {
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(params.get('q') || '');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [kind, setKind] = useState('');
  const [ev, setEv] = useState(false);

  const [userPos, setUserPos] = useState(() => {
    const lat = params.get('lat');
    const lng = params.get('lng');

    return lat && lng
      ? { lat: Number(lat), lng: Number(lng) }
      : null;
  });

  const [radius, setRadius] = useState(
    params.get('radiusKm') || '10'
  );

  const [sort, setSort] = useState(
    params.has('lat') ? 'near' : 'recommended'
  );

  // Fetch parking locations from backend.
  useEffect(() => {
    const controller = new AbortController();

    const fetchLocations = async () => {
      setLoading(true);
      setError('');

      try {
        const searchParams = new URLSearchParams();

        const q = params.get('q');
        const city = params.get('city');
        const lat = params.get('lat');
        const lng = params.get('lng');
        const radiusKm = params.get('radiusKm');

        if (q) searchParams.set('q', q);
        if (city) searchParams.set('city', city);

        if (kind) searchParams.set('kind', kind);
        if (ev) searchParams.set('ev', 'true');

        if (lat && lng) {
          searchParams.set('lat', lat);
          searchParams.set('lng', lng);
          searchParams.set('radiusKm', radiusKm || '10');
        }

        const data = await api(
          `/locations?${searchParams.toString()}`,
          { signal: controller.signal }
        );

        if (!controller.signal.aborted) {
          setLocations(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message || 'Unable to load parking locations');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchLocations();

    return () => controller.abort();
  }, [params, kind, ev]);

  // Apply frontend sorting and filtering.
  const shown = useMemo(() => {
    const arr = [...locations];

    if (sort === 'low') {
      arr.sort(
        (a, b) =>
          Number(a.prices?.car || 0) -
          Number(b.prices?.car || 0)
      );
    }

    if (sort === 'near') {
      arr.sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    return arr;
  }, [locations, sort]);

  // GPS live location.
  const locate = () => {
    setError('');

    if (!navigator.geolocation) {
      setError('GPS location is not supported by this browser.');
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setUserPos({ lat, lng });
        setSort('near');

        setParams({
          ...(query.trim() ? { q: query.trim() } : {}),
          lat: String(lat),
          lng: String(lng),
          radiusKm: radius
        });
      },
      err => {
        setLoading(false);

        if (err.code === 1) {
          setError(
            'Location permission denied. Allow location access in your browser or search manually.'
          );
        } else if (err.code === 2) {
          setError('Your current location could not be detected.');
        } else {
          setError('Location request timed out. Please try again.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000
      }
    );
  };

  // Manual location search.
  const searchManually = event => {
    event.preventDefault();

    setUserPos(null);
    setSort('recommended');

    setParams(
      query.trim()
        ? { q: query.trim() }
        : {}
    );
  };

  // Change GPS search radius.
  const changeRadius = value => {
    setRadius(value);

    if (userPos) {
      setParams({
        ...(query.trim() ? { q: query.trim() } : {}),
        lat: String(userPos.lat),
        lng: String(userPos.lng),
        radiusKm: value
      });
    }
  };

  const clearLocation = () => {
    setUserPos(null);
    setSort('recommended');
    setParams(query.trim() ? { q: query.trim() } : {});
  };

  return (
    <div className="container inner-page">
      <div className="page-intro">
        <div className="section-kicker">EXPLORE PARKING</div>

        <h1>
          Find your happy place to <em>park.</em>
        </h1>

        <p>
          Discover secure, convenient parking near your destination.
        </p>
      </div>

      {/* GPS and manual search */}
      <div className="search-toolbar">
        <form className="wide-search" onSubmit={searchManually}>
          <Search size={20} />

          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search city, area, pincode or parking name"
          />

          <button
            type="submit"
            className="btn btn-primary btn-sm"
          >
            Search
          </button>
        </form>

        <button
          type="button"
          className="btn btn-outline"
          onClick={locate}
          disabled={loading}
        >
          <LocateFixed size={17} />
          Use my location
        </button>
      </div>

      {/* GPS status and radius */}
      {userPos && (
        <div className="filter-bar">
          <div className="filter-group">
            <Navigation size={17} />

            <span>
              Showing parking near your current location
            </span>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={clearLocation}
            >
              Clear GPS
            </button>
          </div>

          <div className="filter-group">
            <span>Search radius:</span>

            <select
              value={radius}
              onChange={event => changeRadius(event.target.value)}
              aria-label="Search radius"
            >
              <option value="1">1 km</option>
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="20">20 km</option>
            </select>
          </div>
        </div>
      )}

      {/* Parking filters */}
      <div className="filter-bar">
        <div className="filter-group">
          <SlidersHorizontal size={18} />
          <span>Filter by:</span>

          <select
            value={kind}
            onChange={event => setKind(event.target.value)}
            aria-label="Location type"
          >
            <option value="">All types</option>
            <option value="mall">Shopping malls</option>
            <option value="office">Office</option>
            <option value="airport">Airport</option>
            <option value="station">Metro / station</option>
            <option value="public">Public parking</option>
          </select>

          <label className="filter-check">
            <input
              type="checkbox"
              checked={ev}
              onChange={event => setEv(event.target.checked)}
            />
            <Zap size={15} />
            EV charging
          </label>
        </div>

        <div className="filter-group">
          <span>Sort:</span>

          <select
            value={sort}
            onChange={event => setSort(event.target.value)}
          >
            <option value="recommended">Recommended</option>
            <option value="low">Lowest car rate</option>
            <option value="near" disabled={!userPos}>
              Nearest to me
            </option>
          </select>
        </div>
      </div>

      <ErrorBanner
        message={error}
        onClose={() => setError('')}
      />

      {/* Results */}
      <div className="results-title">
        <h2>
          {loading
            ? 'Searching'
            : `${shown.length} parking locations`}
        </h2>

        <p>
          {userPos
            ? `Parking locations within ${radius} km`
            : 'Search parking by city, area or address'}
        </p>
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length ? (
        <div className="locations-grid locations-grid-results">
          {shown.map(location => (
            <LocationCard
              location={location}
              key={location._id}
              distanceKm={location.distanceKm ?? undefined}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={MapPinned}
          title="No parking spots found"
          message={
            userPos
              ? 'No parking found in this radius. Try increasing the search radius.'
              : 'Try another city, area or parking name.'
          }
        />
      )}
    </div>
  );
}

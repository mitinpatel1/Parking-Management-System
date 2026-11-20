
const router = require('express').Router();
const mongoose = require('mongoose');

const { Location, Slot } = require('../models');
const { asyncHandler, ApiError } = require('../lib/errors');
const { parseWindow } = require('../lib/pricing');

// Calculate distance between two coordinates in kilometres.
function calculateDistance(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;

  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLng / 2) ** 2;

  return 6371 * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

// Escape special regex characters.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Exact case-insensitive matching.
function exactMatch(value) {
  return new RegExp(
    `^${escapeRegex(String(value).trim())}$`,
    'i'
  );
}

// Validate coordinates.
function validCoordinates(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

// --------------------------------------------------
// GET ALL AVAILABLE CITIES
// GET /api/locations/cities
// --------------------------------------------------

router.get('/cities', asyncHandler(async (req, res) => {
  const cities = await Location.distinct('city', {
    isOpen: true,
    city: { $exists: true, $nin: ['', null] }
  });

  res.json(
    cities
      .filter(city => typeof city === 'string' && city.trim())
      .sort((a, b) => a.localeCompare(b))
  );
}));

// --------------------------------------------------
// GET AREAS BY CITY
// GET /api/locations/areas?city=Delhi
// --------------------------------------------------

router.get('/areas', asyncHandler(async (req, res) => {
  const city = String(req.query.city || '').trim();

  if (!city) {
    throw new ApiError(400, 'Please select a city');
  }

  const areas = await Location.distinct('area', {
    isOpen: true,
    city: exactMatch(city),
    area: { $exists: true, $nin: ['', null] }
  });

  res.json(
    areas
      .filter(area => typeof area === 'string' && area.trim())
      .sort((a, b) => a.localeCompare(b))
  );
}));

// --------------------------------------------------
// GET ALL PARKING LOCATIONS
// Supports city, area, pincode, GPS and EV filters.
// --------------------------------------------------

router.get('/', asyncHandler(async (req, res) => {
  const {
    q = '',
    city = '',
    area = '',
    pincode = '',
    kind = '',
    ev = '',
    lat,
    lng,
    radiusKm = '10'
  } = req.query;

  const filter = {
    isOpen: true
  };

  const selectedCity = String(city).trim();
  const selectedArea = String(area).trim();
  const selectedPincode = String(pincode).trim();

  // City filter.
  if (selectedCity) {
    filter.city = exactMatch(selectedCity);
  }

  // Area filter.
  if (selectedArea) {
    if (!selectedCity) {
      throw new ApiError(
        400,
        'Please select a city before selecting an area'
      );
    }

    filter.area = exactMatch(selectedArea);
  }

  // Pincode filter.
  if (selectedPincode) {
    filter.pincode = exactMatch(selectedPincode);
  }

  // Parking type filter.
  if (kind) {
    filter.kind = kind;
  }

  // General search.
  if (q) {
    const search = new RegExp(
      escapeRegex(String(q).slice(0, 80)),
      'i'
    );

    const searchConditions = [
      { name: search },
      { city: search },
      { area: search },
      { address: search },
      { pincode: search }
    ];

    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: searchConditions
    });
  }

  // GPS validation.
  const hasLat = lat !== undefined && lat !== '';
  const hasLng = lng !== undefined && lng !== '';

  let userLat;
  let userLng;
  let radius;

  if (hasLat !== hasLng) {
    throw new ApiError(
      400,
      'Both latitude and longitude are required'
    );
  }

  if (hasLat && hasLng) {
    userLat = Number(lat);
    userLng = Number(lng);
    radius = Number(radiusKm);

    if (!validCoordinates(userLat, userLng)) {
      throw new ApiError(400, 'Invalid GPS coordinates');
    }

    if (
      !Number.isFinite(radius) ||
      radius < 1 ||
      radius > 100
    ) {
      throw new ApiError(
        400,
        'Radius must be between 1 and 100 km'
      );
    }
  }

  // Fetch parking locations.
  const locations = await Location.find(filter).lean();

  // Fetch slot statistics only for matching locations.
  const locationIds = locations.map(location => location._id);

  const totals = locationIds.length
    ? await Slot.aggregate([
        {
          $match: {
            location: { $in: locationIds }
          }
        },
        {
          $group: {
            _id: '$location',

            total: { $sum: 1 },

            ev: {
              $sum: {
                $cond: [{ $eq: ['$kind', 'ev'] }, 1, 0]
              }
            },

            occupied: {
              $sum: {
                $cond: [{ $eq: ['$state', 'occupied'] }, 1, 0]
              }
            },

            available: {
              $sum: {
                $cond: [{ $eq: ['$state', 'available'] }, 1, 0]
              }
            },

            maintenance: {
              $sum: {
                $cond: [{ $eq: ['$state', 'maintenance'] }, 1, 0]
              }
            }
          }
        }
      ])
    : [];

  const byLoc = Object.fromEntries(
    totals.map(item => [String(item._id), item])
  );

  // Prepare response.
  let result = locations.map(location => {
    const stats = byLoc[String(location._id)] || {
      total: 0,
      ev: 0,
      occupied: 0,
      available: 0,
      maintenance: 0
    };

    const item = {
      ...location,
      stats
    };

    if (hasLat && hasLng) {
      const locationLat = Number(location.lat);
      const locationLng = Number(location.lng);

      if (validCoordinates(locationLat, locationLng)) {
        item.distanceKm = Number(
          calculateDistance(
            userLat,
            userLng,
            locationLat,
            locationLng
          ).toFixed(2)
        );
      } else {
        item.distanceKm = null;
      }
    }

    return item;
  });

  // EV parking filter.
  if (ev === 'true') {
    result = result.filter(item => item.stats.ev > 0);
  }

  // GPS distance filter.
  if (hasLat && hasLng) {
    result = result.filter(
      item =>
        item.distanceKm !== null &&
        item.distanceKm <= radius
    );

    result.sort(
      (a, b) => a.distanceKm - b.distanceKm
    );
  } else {
    result.sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  res.json(result);
}));

// --------------------------------------------------
// PRIMARY OFFICE PARKING
// GET /api/locations/office/primary?city=Delhi
// --------------------------------------------------

router.get('/office/primary', asyncHandler(async (req, res) => {
  const city = String(req.query.city || '').trim();

  if (!city) {
    throw new ApiError(
      400,
      'City is required to find office parking'
    );
  }

  const office = await Location.findOne({
    kind: 'office',
    isOpen: true,
    city: exactMatch(city)
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!office) {
    throw new ApiError(
      404,
      `Office parking not found in ${city}`
    );
  }

  const totals = await Slot.aggregate([
    {
      $match: {
        location: office._id
      }
    },
    {
      $group: {
        _id: '$location',
        total: { $sum: 1 },

        ev: {
          $sum: {
            $cond: [{ $eq: ['$kind', 'ev'] }, 1, 0]
          }
        },

        occupied: {
          $sum: {
            $cond: [{ $eq: ['$state', 'occupied'] }, 1, 0]
          }
        },

        available: {
          $sum: {
            $cond: [{ $eq: ['$state', 'available'] }, 1, 0]
          }
        }
      }
    }
  ]);

  res.json({
    ...office,
    stats: totals[0] || {
      total: 0,
      occupied: 0,
      available: 0,
      ev: 0
    }
  });
}));

// --------------------------------------------------
// GET ONE PARKING LOCATION
// GET /api/locations/:id
// --------------------------------------------------

router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(404, 'Location not found');
  }

  const location = await Location.findById(
    req.params.id
  ).lean();

  if (!location || !location.isOpen) {
    throw new ApiError(404, 'Location not found');
  }

  res.json(location);
}));

// --------------------------------------------------
// GET PARKING SLOTS
// GET /api/locations/:id/slots
// --------------------------------------------------

router.get('/:id/slots', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(404, 'Location not found');
  }

  const { startAt, endAt } = req.query;

  const location = await Location.findById(req.params.id);

  if (!location?.isOpen) {
    throw new ApiError(404, 'Location not available');
  }

  let start;
  let end;

  if (startAt && endAt) {
    ({ start, end } = parseWindow(startAt, endAt));
  }

  const slots = await Slot.find({
    location: req.params.id
  }).lean();

  res.json(slots.map(slot => {
    const reserved =
      start &&
      end &&
      slot.reservations.some(
        reservation =>
          reservation.startAt < end &&
          reservation.endAt > start
      );

    const occupiedNow = slot.state === 'occupied';

    const isNow =
      start &&
      start.getTime() <= Date.now() + 5 * 60 * 1000;

    const isAvailable =
      slot.state !== 'maintenance' &&
      !reserved &&
      !(isNow && occupiedNow);

    return {
      id: slot._id,
      number: slot.number,
      floor: slot.floor,
      zone: slot.zone,
      kind: slot.kind,
      state: slot.state,
      sensorId: slot.sensorId,
      reserved: !!reserved,
      compatible: true,
      available: isAvailable
    };
  }));
}));

module.exports = router;
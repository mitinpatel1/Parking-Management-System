
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ==================== USER MODEL ====================

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 90
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'staff', 'admin'],
    default: 'user'
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);


// ==================== LOCATION MODEL ====================

const locationSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  area: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  pincode: {
    type: String,
    trim: true,
    default: '',
    maxlength: 12
  },
  lat: {
    type: Number,
    default: 0
  },
  lng: {
    type: Number,
    default: 0
  },
  kind: {
    type: String,
    enum: ['mall', 'airport', 'office', 'station', 'public'],
    default: 'public'
  },
  features: {
    type: [String],
    default: ['CCTV', 'Security']
  },
  cover: {
    type: String,
    default: 'violet'
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  prices: {
    car: {
      type: Number,
      default: 40,
      min: 0
    },
    bike: {
      type: Number,
      default: 20,
      min: 0
    },
    ev: {
      type: Number,
      default: 65,
      min: 0
    },
    accessible: {
      type: Number,
      default: 35,
      min: 0
    }
  },
  weekendMultiplier: {
    type: Number,
    default: 1.15,
    min: 1,
    max: 5
  },
  peakMultiplier: {
    type: Number,
    default: 1.2,
    min: 1,
    max: 5
  },
  peakStart: {
    type: Number,
    default: 17,
    min: 0,
    max: 23
  },
  peakEnd: {
    type: Number,
    default: 20,
    min: 0,
    max: 24
  }
}, { timestamps: true });

const Location = mongoose.model('Location', locationSchema);


// ==================== SLOT MODEL ====================

const reservationSchema = new Schema({
  bookingId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  startAt: {
    type: Date,
    required: true
  },
  endAt: {
    type: Date,
    required: true
  },
  state: {
    type: String,
    enum: ['active'],
    default: 'active'
  }
}, { _id: false });

const slotSchema = new Schema({
  location: {
    type: Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true
  },
  number: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  floor: {
    type: String,
    required: true,
    default: 'G'
  },
  zone: {
    type: String,
    default: 'A'
  },
  kind: {
    type: String,
    enum: ['car', 'bike', 'ev', 'accessible'],
    default: 'car'
  },
  state: {
    type: String,
    enum: ['available', 'occupied', 'maintenance'],
    default: 'available'
  },
  sensorId: {
    type: String,
    default: '',
    trim: true
  },
  reservations: {
    type: [reservationSchema],
    default: []
  }
}, { timestamps: true });

slotSchema.index({ location: 1, number: 1 }, { unique: true });
slotSchema.index({ sensorId: 1 }, { sparse: true });

const Slot = mongoose.model('Slot', slotSchema);


// ==================== BOOKING MODEL ====================

const bookingSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  qrToken: {
    type: String,
    required: true,
    unique: true,
    select: false
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true
  },
  guestName: {
    type: String,
    default: '',
    trim: true
  },
  guestPhone: {
    type: String,
    default: '',
    trim: true
  },
  location: {
    type: Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  slot: {
    type: Schema.Types.ObjectId,
    ref: 'Slot',
    required: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  vehicleType: {
    type: String,
    enum: ['car', 'bike', 'ev', 'accessible'],
    required: true
  },
  startAt: {
    type: Date,
    required: true
  },
  endAt: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  extraDue: {
    type: Number,
    default: 0
  },
  extraPaid: {
    type: Number,
    default: 0
  },
  pricingBreakdown: {
    type: Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: [
      'pending_payment',
      'confirmed',
      'checked_in',
      'payment_due',
      'completed',
      'cancelled',
      'expired'
    ],
    default: 'confirmed'
  },

  // ==================== PAYMENT DETAILS ====================

  payment: {
    method: {
      type: String,
      enum: ['online', 'counter'],
      required: true
    },

    status: {
      type: String,
      enum: ['unpaid', 'pending', 'paid'],
      default: 'unpaid',
      index: true
    },

    gatewayOrderId: {
      type: String,
      default: '',
      index: true
    },

    gatewayPaymentId: {
      type: String,
      default: '',
      index: true
    },

    reference: {
      type: String,
      default: ''
    },

    paidAt: {
      type: Date,
      default: undefined
    },

    // Cash payment request
    cashRequestAt: {
      type: Date,
      default: undefined
    },

    cashApprovedAt: {
      type: Date,
      default: undefined
    },

    // UPI QR details
    qrCodeId: {
      type: String,
      default: '',
      index: true
    },

    qrImageUrl: {
      type: String,
      default: ''
    },

    qrShortUrl: {
      type: String,
      default: ''
    },

    qrExpiresAt: {
      type: Date,
      default: undefined
    },

    qrIssuedAt: {
      type: Date,
      default: undefined
    },

    qrIssuedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // Gate QR issue tracking
    gateQrIssuedAt: {
      type: Date,
      default: undefined
    },

    gateQrIssuedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },

  holdUntil: Date,
  checkedInAt: Date,
  checkedOutAt: Date

}, { timestamps: true });

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ vehicleNumber: 1, createdAt: -1 });
bookingSchema.index({ location: 1, startAt: -1 });

const Booking = mongoose.model('Booking', bookingSchema);


// ==================== NOTIFICATION MODEL ====================

const notificationSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  booking: {
    type: Schema.Types.ObjectId,
    ref: 'Booking'
  }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);


// ==================== EXPORT MODELS ====================

module.exports = {
  User,
  Location,
  Slot,
  Booking,
  Notification
};


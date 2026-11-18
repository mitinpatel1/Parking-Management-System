import { useEffect } from 'react';
import { CheckCircle2, Download, Printer, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { clampVehicle, formatDate, formatMoney } from '../lib/api';

export default function ThermalReceipt58mm({ booking, onClose, autoPrint = false }) {
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  if (!booking) return null;

  const isOnline = booking.payment?.method === 'online';
  const isPaid = booking.payment?.status === 'paid';
  const totalPaid = isPaid ? Number(booking.amount || 0) + Number(booking.extraPaid || 0) : 0;
  const printDate = new Date();

  return (
    <div className="modal-backdrop receipt-modal-backdrop" onClick={onClose}>
      <div
        className="receipt-modal-container"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="58mm Thermal Receipt"
      >
        {/* SCREEN-ONLY TOOLBAR */}
        <div className="receipt-screen-toolbar">
          <div className="receipt-toolbar-info">
            <Printer size={18} />
            <span>58mm Thermal Print Receipt</span>
          </div>
          <div className="receipt-toolbar-actions">
            <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
              <Printer size={16} /> Print Receipt (58mm)
            </button>
            <button className="icon-btn modal-close" onClick={onClose} title="Close receipt">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 58MM THERMAL RECEIPT SLIP (ONLY THIS PRINTS IN @MEDIA PRINT) */}
        <div className="receipt-58mm-paper">
          {/* HEADER */}
          <div className="t-center t-bold t-brand">PARKEASE PARKING</div>
          <div className="t-center t-title">{booking.location?.name || 'Office & Campus Parking'}</div>
          {booking.location?.address && (
            <div className="t-center t-muted t-small">{booking.location.address}</div>
          )}
          {booking.location?.city && (
            <div className="t-center t-muted t-small">{booking.location.city}</div>
          )}

          <div className="t-divider" />

          {/* RECEIPT TYPE & CODE */}
          <div className="t-center t-bold t-heading">
            {isPaid
              ? isOnline
                ? '★ ONLINE PAYMENT RECEIPT ★'
                : '★ CASH COUNTER RECEIPT ★'
              : 'PARKING ENTRY SLIP'}
          </div>
          <div className="t-row">
            <span>RECEIPT NO:</span>
            <span className="t-bold">{booking.code}</span>
          </div>
          <div className="t-row">
            <span>DATE & TIME:</span>
            <span>{formatDate(printDate, { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>

          <div className="t-divider" />

          {/* VEHICLE & PARKING DETAILS */}
          <div className="t-row">
            <span>VEHICLE NO:</span>
            <span className="t-bold t-plate">{booking.vehicleNumber}</span>
          </div>
          <div className="t-row">
            <span>VEHICLE TYPE:</span>
            <span>{clampVehicle(booking.vehicleType)?.toUpperCase() || 'CAR'}</span>
          </div>
          <div className="t-row">
            <span>ASSIGNED SLOT:</span>
            <span className="t-bold">
              {booking.slot?.number || '—'} (FL {booking.slot?.floor || 'G'})
            </span>
          </div>
          <div className="t-row">
            <span>DRIVER / GUEST:</span>
            <span>{booking.user?.name || booking.guestName || 'VISITOR'}</span>
          </div>
          {booking.guestPhone && (
            <div className="t-row">
              <span>PHONE:</span>
              <span>{booking.guestPhone}</span>
            </div>
          )}

          <div className="t-divider" />

          {/* TIMING */}
          <div className="t-row">
            <span>SCHEDULED IN:</span>
            <span>{formatDate(booking.startAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          <div className="t-row">
            <span>SCHEDULED OUT:</span>
            <span>{formatDate(booking.endAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          {booking.checkedInAt && (
            <div className="t-row">
              <span>ENTRY TIME:</span>
              <span>{formatDate(booking.checkedInAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          )}
          {booking.checkedOutAt && (
            <div className="t-row">
              <span>EXIT TIME:</span>
              <span>{formatDate(booking.checkedOutAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          )}

          <div className="t-divider" />

          {/* PAYMENT DETAILS */}
          <div className="t-row">
            <span>PAYMENT METHOD:</span>
            <span className="t-bold">{isOnline ? 'ONLINE' : 'CASH / GATE'}</span>
          </div>
          <div className="t-row">
            <span>PAYMENT STATUS:</span>
            <span className="t-bold">{isPaid ? 'PAID [VERIFIED]' : 'PAY AT GATE'}</span>
          </div>
          <div className="t-row">
            <span>BASE PARKING FARE:</span>
            <span>{formatMoney(booking.amount)}</span>
          </div>
          {(booking.extraDue > 0 || booking.extraPaid > 0) && (
            <div className="t-row">
              <span>EXTRA / OVERSTAY:</span>
              <span>{formatMoney(booking.extraPaid || booking.extraDue)}</span>
            </div>
          )}
          <div className="t-divider-dashed" />
          <div className="t-row t-bold t-total">
            <span>TOTAL AMOUNT:</span>
            <span>{formatMoney(totalPaid || booking.amount)}</span>
          </div>
          {booking.payment?.reference && (
            <div className="t-row t-small">
              <span>TXN / REF:</span>
              <span className="t-break">{booking.payment.reference}</span>
            </div>
          )}

          <div className="t-divider" />

          {/* QR CODE FOR GATE ENTRY / EXIT */}
          <div className="t-qr-block">
            {booking.qrToken ? (
              <QRCodeSVG
                value={booking.qrToken}
                size={115}
                level="M"
                includeMargin={false}
              />
            ) : (
              <QRCodeSVG
                value={booking.code}
                size={115}
                level="M"
                includeMargin={false}
              />
            )}
            <div className="t-qr-caption t-bold">{booking.code}</div>
            <div className="t-small t-muted">Scan QR at barrier scanner</div>
          </div>

          <div className="t-divider" />

          {/* FOOTER */}
          <div className="t-center t-small">Thank you for parking with us!</div>
          <div className="t-center t-small">Keep this slip safe until exit.</div>
          <div className="t-center t-small t-muted">Helpline / Security: Gate 1</div>
          <div className="t-center t-small">================================</div>
        </div>

        {/* SCREEN-ONLY FOOTER NOTE */}
        <div className="receipt-screen-note">
          <small>
            <ShieldCheck size={14} /> Ready for 58mm thermal POS printer. Set printer margins to <strong>None</strong> for best result.
          </small>
        </div>
      </div>
    </div>
  );
}

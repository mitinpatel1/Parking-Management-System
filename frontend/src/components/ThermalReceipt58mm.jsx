
import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Printer,
  ShieldCheck,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import {
  clampVehicle,
  formatDate,
  formatMoney
} from '../lib/api';

function svgToPng(svgElement, size = 400) {
  return new Promise((resolve, reject) => {
    if (!svgElement) {
      reject(new Error('Gate QR is not available.'));
      return;
    }

    const svgClone = svgElement.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const svgText = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgText], {
      type: 'image/svg+xml;charset=utf-8'
    });

    const objectUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext('2d');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);

      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not prepare Gate QR for PDF.'));
    };

    image.src = objectUrl;
  });
}

export default function ThermalReceipt58mm({
  booking,
  onClose,
  autoPrint = false
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const paperRef = useRef(null);

  useEffect(() => {
    if (!autoPrint) return;

    const timer = setTimeout(() => {
      window.print();
    }, 400);

    return () => clearTimeout(timer);
  }, [autoPrint]);

  if (!booking) return null;

  const payment = booking.payment || {};
  const isOnline = payment.method === 'online';
  const isPaid = payment.status === 'paid';

  const totalPaid = isPaid
    ? Number(booking.amount || 0) +
      Number(booking.extraPaid || 0)
    : 0;

  const printDate = new Date();

  // Gate QR is valid once issued or payment is completed.
  const hasGateQr = Boolean(
    (payment.gateQrIssuedAt || isPaid) &&
    booking.qrToken
  );

  const downloadReceipt = async () => {
    setDownloading(true);
    setDownloadError('');

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [58, 230]
      });

      const pageWidth = 58;
      const margin = 4;
      const contentWidth = pageWidth - margin * 2;

      let y = 7;

      const centerText = (text, size = 8, bold = false) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(size);
        pdf.text(String(text), pageWidth / 2, y, {
          align: 'center'
        });
        y += size * 0.42 + 1.5;
      };

      const divider = (dashed = false) => {
        pdf.setDrawColor(80);
        pdf.setLineWidth(0.2);

        if (dashed) {
          pdf.setLineDashPattern([1, 1], 0);
        } else {
          pdf.setLineDashPattern([], 0);
        }

        pdf.line(margin, y, pageWidth - margin, y);
        pdf.setLineDashPattern([], 0);
        y += 3;
      };

      const addRow = (label, value, bold = false) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(7);

        const left = String(label);
        const right = String(value ?? '');

        const leftWidth = pdf.getTextWidth(left);
        const rightLines = pdf.splitTextToSize(
          right,
          contentWidth - leftWidth - 2
        );

        pdf.text(left, margin, y);
        pdf.text(rightLines, pageWidth - margin, y, {
          align: 'right'
        });

        y += Math.max(4, rightLines.length * 3.2 + 1);
      };

      const addWrapped = (text, size = 7) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(size);

        const lines = pdf.splitTextToSize(
          String(text),
          contentWidth
        );

        pdf.text(lines, margin, y);
        y += lines.length * 3.4 + 1;
      };

      // Header
      centerText('PARKEASE PARKING', 11, true);
      centerText(
        booking.location?.name || 'Office & Campus Parking',
        8,
        true
      );

      if (booking.location?.address) {
        centerText(booking.location.address, 6);
      }

      if (booking.location?.city) {
        centerText(booking.location.city, 6);
      }

      divider();

      centerText(
        isPaid
          ? isOnline
            ? 'ONLINE PAYMENT RECEIPT'
            : 'COUNTER PAYMENT RECEIPT'
          : 'PARKING ENTRY SLIP',
        8,
        true
      );

      addRow('RECEIPT NO:', booking.code, true);
      addRow(
        'DATE & TIME:',
        formatDate(printDate, {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      );

      divider();

      // Vehicle details
      addRow('VEHICLE NO:', booking.vehicleNumber || '—', true);
      addRow(
        'VEHICLE TYPE:',
        clampVehicle(booking.vehicleType)?.toUpperCase() || 'CAR'
      );
      addRow(
        'ASSIGNED SLOT:',
        `${booking.slot?.number || '—'} (FL ${booking.slot?.floor || 'G'})`,
        true
      );
      addRow(
        'DRIVER / GUEST:',
        booking.user?.name || booking.guestName || 'VISITOR'
      );

      if (booking.guestPhone) {
        addRow('PHONE:', booking.guestPhone);
      }

      divider();

      // Timing
      addRow(
        'SCHEDULED IN:',
        formatDate(booking.startAt, {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      );

      addRow(
        'SCHEDULED OUT:',
        formatDate(booking.endAt, {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      );

      if (booking.checkedInAt) {
        addRow(
          'ENTRY TIME:',
          formatDate(booking.checkedInAt, {
            dateStyle: 'short',
            timeStyle: 'short'
          })
        );
      }

      if (booking.checkedOutAt) {
        addRow(
          'EXIT TIME:',
          formatDate(booking.checkedOutAt, {
            dateStyle: 'short',
            timeStyle: 'short'
          })
        );
      }

      divider();

      // Payment details
      addRow(
        'PAYMENT METHOD:',
        isOnline ? 'ONLINE UPI' : 'CASH AT GATE'
      );

      addRow(
        'PAYMENT STATUS:',
        isPaid ? 'PAID [VERIFIED]' : 'PAYMENT PENDING',
        true
      );

      addRow('BASE PARKING FARE:', formatMoney(booking.amount));

      if (booking.extraDue > 0 || booking.extraPaid > 0) {
        addRow(
          'EXTRA / OVERSTAY:',
          formatMoney(booking.extraPaid || booking.extraDue)
        );
      }

      divider(true);

      addRow(
        'TOTAL AMOUNT:',
        formatMoney(totalPaid || booking.amount),
        true
      );

      if (payment.reference) {
        addRow('TXN / REF:', payment.reference);
      }

      divider();

      // Gate QR if paid or issued
      if (hasGateQr) {
        centerText('GATE PASS & PAYMENT QR', 8, true);

        const qrElement = paperRef.current?.querySelector('svg');

        if (qrElement) {
          const qrImage = await svgToPng(qrElement, 400);

          const qrSize = 34;
          const qrX = (pageWidth - qrSize) / 2;

          pdf.addImage(
            qrImage,
            'PNG',
            qrX,
            y,
            qrSize,
            qrSize
          );

          y += qrSize + 2;
        }

        centerText(booking.code, 8, true);
        centerText('Scan QR at barrier scanner', 6);
      } else {
        centerText('CASH PENDING AT GATE', 7, true);
        centerText(
          'Pay cash at gate counter for entry pass',
          6
        );
      }

      divider();

      centerText('Thank you for parking with us!', 7);
      centerText('Keep this receipt safe until exit.', 6);
      centerText('Helpline / Security: Gate 1', 6);

      y += 4;

      // Resize the PDF to fit its actual content.
      pdf.internal.pageSize.setHeight(y + 4);

      const filename = `ParkEase-Receipt-${booking.code || 'booking'}.pdf`;

      pdf.save(filename);
    } catch (error) {
      setDownloadError(
        error.message || 'Could not download receipt.'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="modal-backdrop receipt-modal-backdrop"
      onClick={onClose}
      style={{
        alignItems: 'flex-start',
        paddingTop: '36px',
        paddingBottom: '40px'
      }}
    >
      <div
        className="receipt-modal-container"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="58mm Thermal Receipt"
        style={{
          margin: '16px auto 40px auto',
          maxWidth: '380px'
        }}
      >
        {/* SCREEN-ONLY TOOLBAR */}
        <div className="receipt-screen-toolbar">
          <div className="receipt-toolbar-info">
            <Printer size={18} />
            <span>58mm Receipt</span>
          </div>

          <div className="receipt-toolbar-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={downloadReceipt}
              disabled={downloading}
              title="Download PDF"
              style={{ padding: '6px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Download size={15} />
              {downloading ? 'PDF…' : 'PDF'}
            </button>

            <button
              className="btn btn-outline btn-sm"
              onClick={() => window.print()}
              title="Print Receipt"
              style={{ padding: '6px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Printer size={15} />
              Print
            </button>

            <button
              className="receipt-close-btn"
              onClick={onClose}
              title="Close receipt"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {downloadError && (
          <div
            className="error-banner"
            style={{ margin: '8px 0' }}
          >
            {downloadError}
          </div>
        )}

        {/* 58MM RECEIPT PAPER */}
        <div
          className="receipt-58mm-paper"
          ref={paperRef}
        >
          <div className="t-center t-bold t-brand">
            PARKEASE PARKING
          </div>

          <div className="t-center t-title">
            {booking.location?.name || 'Office & Campus Parking'}
          </div>

          {booking.location?.address && (
            <div className="t-center t-muted t-small">
              {booking.location.address}
            </div>
          )}

          {booking.location?.city && (
            <div className="t-center t-muted t-small">
              {booking.location.city}
            </div>
          )}

          <div className="t-divider" />

          <div className="t-center t-bold t-heading">
            {isPaid
              ? isOnline
                ? '★ ONLINE PAYMENT RECEIPT ★'
                : '★ COUNTER PAYMENT RECEIPT ★'
              : 'PARKING ENTRY SLIP'}
          </div>

          <div className="t-row">
            <span>RECEIPT NO:</span>
            <span className="t-bold">{booking.code}</span>
          </div>

          <div className="t-row">
            <span>DATE & TIME:</span>
            <span>
              {formatDate(printDate, {
                dateStyle: 'short',
                timeStyle: 'short'
              })}
            </span>
          </div>

          <div className="t-divider" />

          <div className="t-row">
            <span>VEHICLE NO:</span>
            <span className="t-bold t-plate">
              {booking.vehicleNumber}
            </span>
          </div>

          <div className="t-row">
            <span>VEHICLE TYPE:</span>
            <span>
              {clampVehicle(booking.vehicleType)?.toUpperCase() || 'CAR'}
            </span>
          </div>

          <div className="t-row">
            <span>ASSIGNED SLOT:</span>
            <span className="t-bold">
              {booking.slot?.number || '—'} (FL {booking.slot?.floor || 'G'})
            </span>
          </div>

          <div className="t-row">
            <span>DRIVER / GUEST:</span>
            <span>
              {booking.user?.name || booking.guestName || 'VISITOR'}
            </span>
          </div>

          {booking.guestPhone && (
            <div className="t-row">
              <span>PHONE:</span>
              <span>{booking.guestPhone}</span>
            </div>
          )}

          <div className="t-divider" />

          <div className="t-row">
            <span>SCHEDULED IN:</span>
            <span>
              {formatDate(booking.startAt, {
                dateStyle: 'short',
                timeStyle: 'short'
              })}
            </span>
          </div>

          <div className="t-row">
            <span>SCHEDULED OUT:</span>
            <span>
              {formatDate(booking.endAt, {
                dateStyle: 'short',
                timeStyle: 'short'
              })}
            </span>
          </div>

          {booking.checkedInAt && (
            <div className="t-row">
              <span>ENTRY TIME:</span>
              <span>
                {formatDate(booking.checkedInAt, {
                  dateStyle: 'short',
                  timeStyle: 'short'
                })}
              </span>
            </div>
          )}

          {booking.checkedOutAt && (
            <div className="t-row">
              <span>EXIT TIME:</span>
              <span>
                {formatDate(booking.checkedOutAt, {
                  dateStyle: 'short',
                  timeStyle: 'short'
                })}
              </span>
            </div>
          )}

          <div className="t-divider" />

          <div className="t-row">
            <span>PAYMENT METHOD:</span>
            <span className="t-bold">
              {isOnline ? 'ONLINE UPI' : 'CASH AT GATE'}
            </span>
          </div>

          <div className="t-row">
            <span>PAYMENT STATUS:</span>
            <span className="t-bold">
              {isPaid ? 'PAID [VERIFIED]' : 'PAYMENT PENDING'}
            </span>
          </div>

          <div className="t-row">
            <span>BASE PARKING FARE:</span>
            <span>{formatMoney(booking.amount)}</span>
          </div>

          {(booking.extraDue > 0 || booking.extraPaid > 0) && (
            <div className="t-row">
              <span>EXTRA / OVERSTAY:</span>
              <span>
                {formatMoney(booking.extraPaid || booking.extraDue)}
              </span>
            </div>
          )}

          <div className="t-divider-dashed" />

          <div className="t-row t-bold t-total">
            <span>TOTAL AMOUNT:</span>
            <span>{formatMoney(totalPaid || booking.amount)}</span>
          </div>

          {payment.reference && (
            <div className="t-row t-small">
              <span>TXN / REF:</span>
              <span className="t-break">
                {payment.reference}
              </span>
            </div>
          )}

          <div className="t-divider" />

          {/* GATE PASS & PAYMENT QR */}
          <div className="t-qr-block">
            {hasGateQr ? (
              <>
                <QRCodeSVG
                  value={booking.qrToken}
                  size={115}
                  level="M"
                  includeMargin={false}
                />

                <div className="t-qr-caption t-bold">
                  {booking.code}
                </div>

                <div className="t-small t-muted">
                  Gate Entry Pass · Scan at barrier
                </div>
              </>
            ) : (
              <>
                <div className="t-bold">
                  CASH PENDING AT GATE
                </div>

                <div className="t-small t-muted">
                  Pay cash at gate counter for entry pass
                </div>
              </>
            )}
          </div>

          <div className="t-divider" />

          <div className="t-center t-small">
            Thank you for parking with us!
          </div>

          <div className="t-center t-small">
            Keep this slip safe until exit.
          </div>

          <div className="t-center t-small t-muted">
            Helpline / Security: Gate 1
          </div>

          <div className="t-center t-small">
            ================================
          </div>
        </div>

        {/* SCREEN-ONLY FOOTER */}
        <div className="receipt-screen-note">
          <small>
            <ShieldCheck size={14} />
            {' '}58mm thermal receipt. Set printer margins to
            <strong> None </strong>
            for best results.
          </small>
        </div>
      </div>
    </div>
  );
}

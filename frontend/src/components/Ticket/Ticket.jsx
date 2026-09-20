import { useEffect, useState } from 'react';
import { printHtml } from '../../utils/printHtml';
import { formatMoney } from '../../utils/format';

const NEGOCIO = 'Desarrollo by NexusCode';
const NEGOCIONAME = 'NexusCode';

const pad = (n) => String(n).padStart(2, '0');

const formatFecha = (d) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const pagoLabel = (metodo) =>
  metodo === 'efectivo' ? 'EFECTIVO' : metodo === 'transferencia' ? 'TRANSFERENCIA' : 'TARJETA';

const getItems = (sale) =>
  (sale.articulos && sale.articulos.length > 0
    ? sale.articulos
    : [{ producto: sale.producto, cantidad: sale.cantidad, precio: sale.precio, talle: sale.talle, color: '', subtotal: sale.total }]);

const getPagos = (sale) =>
  (sale.pagos && sale.pagos.length > 0 ? sale.pagos : [{ metodo: sale.metodoPago || 'efectivo', monto: sale.total }]);

const getNombre = (item) => item.producto?.nombre || item.nombre || 'Producto';

const getCodigo = (item) => item.producto?.codigo || item.codigo || '';

const getTicketNumber = (sale) => (sale.ticketNumero ? String(sale.ticketNumero) : '');

const getDevolucionLabel = (sale) => {
  if (sale.estado === 'devuelta') return '*** DEVOLUCIÓN ***';
  if ((Number(sale.cantidadDevuelta) || 0) > 0) {
    return `DEVOLUCIÓN PARCIAL ${formatMoney(sale.montoDevuelto)}`;
  }
  return null;
};

const generarImagenesTicket = async (sale) => {
  let qrDataUrl = '';
  const barcodes = {};

  try {
    const numero = getTicketNumber(sale);
    if (numero) {
      const QRCode = (await import('qrcode')).default;
      qrDataUrl = await QRCode.toDataURL(numero, { margin: 1, width: 220 });
    }
  } catch {
    qrDataUrl = '';
  }

  try {
    const JsBarcode = (await import('jsbarcode')).default;
    const codigos = [...new Set(getItems(sale).map((item) => getCodigo(item)).filter(Boolean))];
    for (const codigo of codigos) {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, codigo, {
        format: 'CODE128',
        displayValue: false,
        width: 2,
        height: 40,
        margin: 0,
      });
      barcodes[codigo] = canvas.toDataURL('image/png');
    }
  } catch {
    // sin códigos de barras: el ticket igual se muestra/imprime con el texto del código
  }

  return { qrDataUrl, barcodes };
};

const TicketBody = ({ sale }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [barcodes, setBarcodes] = useState({});

  useEffect(() => {
    let cancelado = false;
    setQrDataUrl('');
    setBarcodes({});
    generarImagenesTicket(sale)
      .then((res) => {
        if (cancelado) return;
        setQrDataUrl(res.qrDataUrl);
        setBarcodes(res.barcodes);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [sale]);

  const items = getItems(sale);
  const pagos = getPagos(sale);
  const descuento = Number(sale.descuento) || 0;
  const subtotal = items.reduce((s, i) => s + (i.subtotal != null ? i.subtotal : i.precio * i.cantidad), 0);
  const codigosBarras = [...new Set(items.map((item) => getCodigo(item)).filter((codigo) => codigo && barcodes[codigo]))];

  return (
    <div className="ticket-body">
      <div className="text-center">
        <p className="text-[15px] font-bold tracking-widest">{NEGOCIONAME.toUpperCase()}</p>
        <p className="text-[10px] opacity-70 mt-0.5">Comprobante de compra</p>
      </div>

      <div className="ticket-sep">==============================</div>

      <div className="ticket-line">
        <span>Ticket Nº</span>
        <span>{getTicketNumber(sale) || '—'}</span>
      </div>
      {getDevolucionLabel(sale) && (
        <div className="ticket-line ticket-devolucion justify-center">
          <span>{getDevolucionLabel(sale)}</span>
        </div>
      )}
      <div className="ticket-line">
        <span>Fecha</span>
        <span>{formatFecha(new Date(sale.fechaCreacion || Date.now()))}</span>
      </div>
      <div className="ticket-line">
        <span>Vendedor</span>
        <span>{sale.empleado || '—'}</span>
      </div>

      <div className="ticket-sep">==============================</div>

      {items.map((item, i) => {
        const cantidad = Number(item.cantidad) || 1;
        const precio = Number(item.precio) || 0;
        const lineSub = item.subtotal != null ? item.subtotal : precio * cantidad;
        const variante = [item.talle, item.color].filter(Boolean).join(' / ');
        const codigo = getCodigo(item);
        return (
          <div key={i} className="mb-1.5">
            <p className="ticket-item-nombre">{getNombre(item)}</p>
            {variante && <p className="ticket-item-var">  {variante}</p>}
            {codigo && <p className="ticket-item-cod">  Cód. {codigo}</p>}
            <p className="ticket-item-line">
              <span>{cantidad} x {formatMoney(precio)}</span>
              <span>{formatMoney(lineSub)}</span>
            </p>
          </div>
        );
      })}

      <div className="ticket-sep">==============================</div>

      <div className="ticket-line">
        <span>SUBTOTAL</span>
        <span>{formatMoney(subtotal)}</span>
      </div>
      {descuento > 0 && (
        <div className="ticket-line">
          <span>DESCUENTO ({descuento}%)</span>
          <span>-{formatMoney(subtotal * descuento / 100)}</span>
        </div>
      )}
      <div className="ticket-line ticket-total">
        <span>TOTAL</span>
        <span>{formatMoney(sale.total)}</span>
      </div>

      <div className="ticket-sep">==============================</div>

      {pagos.map((p, i) => (
        <div className="ticket-line" key={i}>
          <span>{pagoLabel(p.metodo)}</span>
          <span>{formatMoney(p.monto)}</span>
        </div>
      ))}

      <div className="ticket-sep">==============================</div>

      {(qrDataUrl || codigosBarras.length > 0) && (
        <div className="ticket-codes">
          {qrDataUrl && (
            <div className="ticket-qr">
              <img src={qrDataUrl} alt="QR del ticket" />
            </div>
          )}
          {codigosBarras.map((codigo) => (
            <p key={codigo} className="ticket-barcode">
              <img src={barcodes[codigo]} alt={`Código de barras ${codigo}`} />
            </p>
          ))}
        </div>
      )}

      <p className="text-center text-[10px] opacity-70 leading-relaxed">
        ¡Gracias por su compra!
        <br />
        {NEGOCIO}
      </p>
    </div>
  );
};

const buildPrintHtml = (sale, qrDataUrl = '', barcodes = {}) => {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket ${getTicketNumber(sale)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 80mm;
    margin: 0 auto;
    padding: 4mm 3mm;
    background: #fff;
    color: #000;
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 11px;
    line-height: 1.45;
  }
  .ticket-body { width: 100%; }
  .text-center { text-align: center; }
  .ticket-sep { text-align: center; opacity: 0.85; letter-spacing: 1px; margin: 6px 0; white-space: pre; }
  .ticket-line { display: flex; justify-content: space-between; gap: 8px; }
  .ticket-line span:last-child { text-align: right; white-space: nowrap; }
  .ticket-total { font-weight: bold; font-size: 13px; margin-top: 4px; }
  .ticket-devolucion { font-weight: bold; color: #b91c1c; letter-spacing: 1px; }
  .ticket-item-nombre { font-weight: bold; }
  .ticket-item-var { opacity: 0.75; }
  .ticket-item-cod { opacity: 0.75; }
  .ticket-item-line { display: flex; justify-content: space-between; gap: 8px; margin-top: 1px; }
  .ticket-item-line span:last-child { text-align: right; white-space: nowrap; }
  .ticket-codes { text-align: center; margin-top: 6px; page-break-inside: avoid; }
  .ticket-qr { margin: 0; }
  .ticket-qr img { width: 110px; height: 110px; display: block; margin: 0 auto; }
  .ticket-barcode { margin: 5px 0 0; }
  .ticket-barcode img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
</style>
</head>
<body>
${renderToHtml(sale, qrDataUrl, barcodes)}
</body>
</html>`;
};

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const renderToHtml = (sale, qrDataUrl = '', barcodes = {}) => {
  const items = getItems(sale);
  const pagos = getPagos(sale);
  const descuento = Number(sale.descuento) || 0;
  const subtotal = items.reduce((s, i) => s + (i.subtotal != null ? i.subtotal : i.precio * i.cantidad), 0);

  const sep = () => '<div class="ticket-sep">==============================</div>';
  const line = (label, value, extra = '') =>
    `<div class="ticket-line ${extra}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  const itemsHtml = items
    .map((item) => {
      const cantidad = Number(item.cantidad) || 1;
      const precio = Number(item.precio) || 0;
      const lineSub = item.subtotal != null ? item.subtotal : precio * cantidad;
      const variante = [item.talle, item.color].filter(Boolean).join(' / ');
      const codigo = getCodigo(item);
      return `<p class="ticket-item-nombre">${escapeHtml(getNombre(item))}</p>${
        variante ? `<p class="ticket-item-var">&nbsp;&nbsp;${escapeHtml(variante)}</p>` : ''
      }${codigo ? `<p class="ticket-item-cod">&nbsp;&nbsp;Cód. ${escapeHtml(codigo)}</p>` : ''}<p class="ticket-item-line"><span>${cantidad} x ${formatMoney(precio)}</span><span>${formatMoney(lineSub)}</span></p>`;
    })
    .join('');

  const codigosBarras = [...new Set(items.map((item) => getCodigo(item)).filter((codigo) => codigo && barcodes[codigo]))];
  const barcodesHtml = codigosBarras
    .map((codigo) => `<p class="ticket-barcode"><img src="${barcodes[codigo]}" alt="Código de barras" /></p>`)
    .join('');

  const pagosHtml = pagos
    .map((p) => line(pagoLabel(p.metodo), formatMoney(p.monto)))
    .join('');

  return `
<div class="ticket-body">
  <div class="text-center">
    <p style="font-size:15px;font-weight:bold;letter-spacing:2px;">${NEGOCIONAME.toUpperCase()}</p>
    <p style="font-size:10px;opacity:0.7;margin-top:2px;">Comprobante de venta</p>
  </div>
  ${sep()}
  ${line('Ticket Nº', getTicketNumber(sale) || '—')}
  ${getDevolucionLabel(sale) ? `<p class="ticket-devolucion" style="text-align:center;font-weight:bold;letter-spacing:1px;color:#b91c1c;">${escapeHtml(getDevolucionLabel(sale))}</p>` : ''}
  ${line('Fecha', formatFecha(new Date(sale.fechaCreacion || Date.now())))}
  ${line('Vendedor', sale.empleado || '—')}
  ${sep()}
  ${itemsHtml}
  ${sep()}
  ${line('SUBTOTAL', formatMoney(subtotal))}
  ${descuento > 0 ? line(`DESCUENTO (${descuento}%)`, `-${formatMoney(subtotal * descuento / 100)}`) : ''}
  ${line('TOTAL', formatMoney(sale.total), 'ticket-total')}
  ${sep()}
  ${pagosHtml}
  ${sep()}
  ${(qrDataUrl || barcodesHtml) ? `<div class="ticket-codes">${qrDataUrl ? `<div class="ticket-qr"><img src="${qrDataUrl}" alt="QR del ticket" /></div>` : ''}${barcodesHtml}</div>` : ''}
  <p class="text-center" style="font-size:10px;opacity:0.7;">¡Gracias por su compra!<br/>${NEGOCIO}</p>
</div>`;
};

export const printTicket = async (sale) => {
  const { qrDataUrl, barcodes } = await generarImagenesTicket(sale);
  const ok = await printHtml(buildPrintHtml(sale, qrDataUrl, barcodes));
  return ok;
};

const Ticket = ({ sale }) => <TicketBody sale={sale} />;

export default Ticket;

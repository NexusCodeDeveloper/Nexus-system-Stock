const NEGOCIO = 'StockSistem';

const pad = (n) => String(n).padStart(2, '0');

const formatFecha = (d) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const formatMoney = (n) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

const pagoLabel = (metodo) =>
  metodo === 'efectivo' ? 'EFECTIVO' : metodo === 'transferencia' ? 'TRANSFERENCIA' : 'TARJETA';

const getItems = (sale) =>
  (sale.items && sale.items.length > 0
    ? sale.items
    : [{ producto: sale.producto, cantidad: sale.cantidad, precio: sale.precio, talle: sale.talle, color: '', subtotal: sale.total }]);

const getPagos = (sale) =>
  (sale.pagos && sale.pagos.length > 0 ? sale.pagos : [{ metodo: sale.metodoPago || 'efectivo', monto: sale.total }]);

const getNombre = (item) => item.producto?.nombre || item.nombre || 'Producto';

const getTicketNumber = (sale) =>
  sale.ticketNumero
    ? String(sale.ticketNumero)
    : (String(sale.numero || sale._id || '').replace(/[^0-9]/g, '').slice(-6) || '000000');

const getDevolucionLabel = (sale) => {
  if (sale.estado === 'devuelta') return '*** DEVOLUCIÓN ***';
  if ((Number(sale.cantidadDevuelta) || 0) > 0) {
    return `DEVOLUCIÓN PARCIAL ${formatMoney(sale.montoDevuelto)}`;
  }
  return null;
};

const TicketBody = ({ sale }) => {
  const items = getItems(sale);
  const pagos = getPagos(sale);
  const descuento = Number(sale.descuento) || 0;
  const subtotal = items.reduce((s, i) => s + (i.subtotal != null ? i.subtotal : i.precio * i.cantidad), 0);

  return (
    <div className="ticket-body">
      <div className="text-center">
        <p className="text-[15px] font-bold tracking-widest">{NEGOCIO.toUpperCase()}</p>
        <p className="text-[10px] opacity-70 mt-0.5">Comprobante de compra</p>
      </div>

      <div className="ticket-sep">==============================</div>

      <div className="ticket-line">
        <span>Ticket Nº</span>
        <span>{getTicketNumber(sale)}</span>
      </div>
      {getDevolucionLabel(sale) && (
        <div className="ticket-line ticket-devolucion justify-center">
          <span>{getDevolucionLabel(sale)}</span>
        </div>
      )}
      <div className="ticket-line">
        <span>Fecha</span>
        <span>{formatFecha(new Date(sale.createdAt || Date.now()))}</span>
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
        return (
          <div key={i} className="mb-1.5">
            <p className="ticket-item-nombre">{getNombre(item)}</p>
            {variante && <p className="ticket-item-var">  {variante}</p>}
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

      <p className="text-center text-[10px] opacity-70 leading-relaxed">
        ¡Gracias por su compra!
        <br />
        {NEGOCIO}
      </p>
    </div>
  );
};

const buildPrintHtml = (sale) => {
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
  .ticket-item-line { display: flex; justify-content: space-between; gap: 8px; margin-top: 1px; }
  .ticket-item-line span:last-child { text-align: right; white-space: nowrap; }
</style>
</head>
<body>
${renderToHtml(sale)}
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

const renderToHtml = (sale) => {
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
      return `<p class="ticket-item-nombre">${escapeHtml(getNombre(item))}</p>${
        variante ? `<p class="ticket-item-var">&nbsp;&nbsp;${escapeHtml(variante)}</p>` : ''
      }<p class="ticket-item-line"><span>${cantidad} x ${formatMoney(precio)}</span><span>${formatMoney(lineSub)}</span></p>`;
    })
    .join('');

  const pagosHtml = pagos
    .map((p) => line(pagoLabel(p.metodo), formatMoney(p.monto)))
    .join('');

  return `
<div class="ticket-body">
  <div class="text-center">
    <p style="font-size:15px;font-weight:bold;letter-spacing:2px;">${NEGOCIO.toUpperCase()}</p>
    <p style="font-size:10px;opacity:0.7;margin-top:2px;">Comprobante de venta</p>
  </div>
  ${sep()}
  ${line('Ticket Nº', getTicketNumber(sale))}
  ${getDevolucionLabel(sale) ? `<p class="ticket-devolucion" style="text-align:center;font-weight:bold;letter-spacing:1px;color:#b91c1c;">${escapeHtml(getDevolucionLabel(sale))}</p>` : ''}
  ${line('Fecha', formatFecha(new Date(sale.createdAt || Date.now())))}
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
  <p class="text-center" style="font-size:10px;opacity:0.7;">¡Gracias por su compra!<br/>${NEGOCIO}</p>
</div>`;
};

export const printTicket = (sale) => {
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return false;
  win.document.open();
  win.document.write(buildPrintHtml(sale));
  win.document.close();
  win.focus();
  win.onafterprint = () => win.close();
  setTimeout(() => {
    win.print();
  }, 150);
  return true;
};

const Ticket = ({ sale }) => <TicketBody sale={sale} />;

export default Ticket;

import nodemailer from 'nodemailer';

const MAX_LINEAS = 8;

const MODO_API = Boolean(process.env.BREVO_API_KEY);

export const formatoPesos = (n) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pad = (x) => String(x).padStart(2, '0');

const estaConfigurado = () => {
  if (MODO_API) return Boolean(process.env.MAIL_TO);
  return Boolean(
    process.env.MAIL_USER &&
    process.env.MAIL_PASS &&
    process.env.MAIL_TO
  );
};

const crearTransporter = () => {
  const host = process.env.MAIL_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.MAIL_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

const mailFrom = () => process.env.MAIL_FROM || `"NexusCode" <${process.env.MAIL_USER}>`;

export const verificarMail = async () => {
  if (!estaConfigurado()) {
    throw new Error('Mail no configurado: faltan MAIL_USER / MAIL_PASS / MAIL_TO o BREVO_API_KEY en el servidor');
  }

if (MODO_API) {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Brevo API HTTP ${response.status}`);
    }
    return {
      via: 'api',
      host: 'api.brevo.com',
      port: 443,
      user: process.env.BREVO_API_KEY ? `*${process.env.BREVO_API_KEY.slice(-4)}` : '(vacío)',
      to: process.env.MAIL_TO,
    };
  }

  const transporter = crearTransporter();
  await transporter.verify();
  return {
    via: 'smtp',
    host: process.env.MAIL_HOST || 'smtp-relay.brevo.com',
    port: Number(process.env.MAIL_PORT || 587),
    user: process.env.MAIL_USER,
    to: process.env.MAIL_TO,
  };
};

const toLocal = (fecha, offset) => new Date(fecha.getTime() - Number(offset) * 60000);

const buildFecha = (fecha, offset) => {
  const l = toLocal(fecha, offset);
  return `${pad(l.getUTCDate())}/${pad(l.getUTCMonth() + 1)}/${l.getUTCFullYear()}`;
};

const buildHora = (fecha, offset) => {
  const l = toLocal(fecha, offset);
  return `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
};

const getItemsDeVenta = (sale) =>
  (sale.items && sale.items.length > 0
    ? sale.items
    : [{ producto: sale.producto, cantidad: sale.cantidad, talle: sale.talle, precio: sale.precio, subtotal: sale.total }]);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const buildItemsVenta = (ventas) => {
  if (!ventas || ventas.length === 0) return [];
  const items = [];
  for (const s of ventas) {
    for (const item of getItemsDeVenta(s)) {
      items.push({
        nombre: item.producto?.nombre || 'Producto eliminado',
        cantidad: item.cantidad,
        talle: item.talle || '',
        subtotal: Number(item.subtotal ?? (item.precio || 0) * item.cantidad),
        empleado: s.empleado || '—',
      });
    }
  }
  return items;
};

const buildDetalleVentas = (ventas) => {
  const items = buildItemsVenta(ventas);
  if (items.length === 0) return 'Sin ventas registradas';

  const lineas = items.map(
    (i) => `• ${i.nombre} x${i.cantidad}${i.talle ? ` (${i.talle})` : ''} — ${formatoPesos(i.subtotal)} — ${i.empleado}`
  );

  if (lineas.length <= MAX_LINEAS) return lineas.join('\n');
  const restantes = lineas.length - MAX_LINEAS;
  return `${lineas.slice(0, MAX_LINEAS).join('\n')}\n(+${restantes} ventas más)`;
};

const buildEmpleados = (ventas) =>
  [...new Set((ventas || []).map((v) => v.empleado).filter(Boolean))].join(', ') || '—';

export const buildDatosCierre = ({ ventas, close, offset = 0, turno, totalDia }) => {
  const fecha = buildFecha(close.fecha, offset);
  const hora = buildHora(close.cerradoAt, offset);
  const turnoLabel = turno === 'tarde' ? 'turno tarde' : 'turno mañana';
  const total = formatoPesos(close.total);
  const unidades = close.cantidad;
  const efectivo = formatoPesos(close.efectivo?.total || 0);
  const efCantidad = close.efectivo?.cantidad || 0;
  const transferencia = formatoPesos(close.transferencia?.total || 0);
  const trCantidad = close.transferencia?.cantidad || 0;
  const tarjeta = formatoPesos(close.tarjeta?.total || 0);
  const tjCantidad = close.tarjeta?.cantidad || 0;
  const cerradoPor = close.cerradoPor || '—';
  const empleados = buildEmpleados(ventas);
  const items = buildItemsVenta(ventas);
  const detalle = buildDetalleVentas(ventas);

  const filas = [
    ['Total', total],
    ['Unidades', unidades],
    ['Efectivo', efectivo],
    ['Transferencia', transferencia],
    ['Tarjeta', tarjeta],
  ];

  if (totalDia) {
    filas.push(
      ['Total del día', `$${Number(totalDia.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Efectivo del día', `$${Number(totalDia.efectivo.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`],
      ['Transferencia del día', `$${Number(totalDia.transferencia.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`],
      ['Tarjeta del día', `$${Number(totalDia.tarjeta.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`]
    );
  }

  filas.push(['Empleado(s)', empleados], ['Cerrado por', cerradoPor]);

  const textoFilas = filas.map(([k, v]) => `${k}: ${v}`).join('\n');

  const subject = `Cierre ${turnoLabel} del ${fecha}`;

  /* ---------- HTML monocromo blanco / gris / negro ---------- */

  const statCard = (label, valor, cantidad) => `
        <td width="33%" style="padding:5px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bn-stat" style="background:#F2F2F7;border:1px solid #E5E5EA;border-radius:14px;">
            <tr><td style="padding:12px 14px;">
              <p style="margin:0 0 5px;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#8E8E93;font-weight:700;">${label}</p>
              <p style="margin:0;font-size:16px;font-weight:700;color:#000000;white-space:nowrap;" class="bn-olive">${valor}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#8E8E93;" class="bn-m">${cantidad} unid.</p>
            </td></tr>
          </table>
        </td>`;

  const headerHtml = `
    <tr>
      <td class="bn-header" style="background:#000000;padding:26px 32px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0;font-size:11px;letter-spacing:2.5px;color:#C7C7CC;font-weight:700;">&#10022; CIERRE DE CAJA</p>
              <p style="margin:10px 0 0;font-size:24px;color:#FFFFFF;font-weight:800;letter-spacing:-0.3px;">Cierre ${turnoLabel}</p>
              <p style="margin:5px 0 0;font-size:13px;color:#C7C7CC;" class="bn-t2">${fecha} &middot; ${hora} hs</p>
            </td>
            <td align="right" valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0" align="right">
                <tr><td style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.4);color:#FFFFFF;font-size:10px;letter-spacing:1.2px;font-weight:700;padding:6px 11px;border-radius:999px;text-align:center;white-space:nowrap;vertical-align:middle;">CIERRE DE TURNO</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  const totalHtml = `
    <tr><td style="padding:26px 32px 4px;">
      <p style="margin:0 0 2px;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8E8E93;font-weight:700;" class="bn-m">Total del turno</p>
      <p style="margin:0;font-size:34px;font-weight:800;color:#000000;letter-spacing:-0.5px;" class="bn-olive">${total}</p>
    </td></tr>`;

  const statsHtml = `
    <tr><td style="padding:16px 26px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${statCard('Efectivo', efectivo, efCantidad)}
          ${statCard('Transferencia', transferencia, trCantidad)}
          ${statCard('Tarjeta', tarjeta, tjCantidad)}
        </tr>
      </table>
    </td></tr>`;

  const metaHtml = `
    <tr><td style="padding:14px 32px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
        <tr>
          <td style="padding:5px 0;color:#8E8E93;" class="bn-m">Unidades vendidas</td>
          <td align="right" style="padding:5px 0;font-weight:700;color:#000000;" class="bn-t1">${unidades}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;color:#8E8E93;" class="bn-m">Empleado(s)</td>
          <td align="right" style="padding:5px 0;font-weight:700;color:#000000;" class="bn-t1">${escapeHtml(empleados)}</td>
        </tr>
      </table>
    </td></tr>`;

  const restantes = Math.max(0, items.length - MAX_LINEAS);
  const itemsHtml = items
    .slice(0, MAX_LINEAS)
    .map(
      (i) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;line-height:1.45;color:#1C1C1E;" class="bn-t1">
          <span style="font-weight:700;">${escapeHtml(i.nombre)}</span>
          ${i.talle ? `<span style="color:#8E8E93;" class="bn-m"> &middot; Talle ${escapeHtml(i.talle)}</span>` : ''}
        </td>
        <td align="right" style="padding:7px 0;font-size:13px;line-height:1.45;white-space:nowrap;color:#1C1C1E;" class="bn-t1">
          <span style="color:#8E8E93;" class="bn-m">x${i.cantidad}</span>
          <span style="font-weight:700;color:#000000;" class="bn-olive"> ${formatoPesos(i.subtotal)}</span>
        </td>
      </tr>`
    )
    .join('');

  const ventasHtml = `
    <tr><td style="padding:8px 32px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5E5EA;">
        <tr><td style="padding:18px 0 6px;">
          <p style="margin:0;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8E8E93;font-weight:700;" class="bn-m">Ventas del ${turnoLabel}</p>
        </td></tr>
        ${itemsHtml || '<tr><td style="padding:8px 0;font-size:13px;color:#8E8E93;" class="bn-m">Sin ventas registradas</td></tr>'}
        ${restantes > 0 ? `<tr><td style="padding:8px 0 2px;font-size:12px;color:#8E8E93;font-style:italic;" class="bn-m">+${restantes} ventas m&aacute;s...</td></tr>` : ''}
      </table>
    </td></tr>`;

  const totalDiaHtml = totalDia
    ? `
    <tr><td style="padding:4px 32px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bn-day" style="background:#F2F2F7;border:1px solid #E5E5EA;border-left:4px solid #000000;border-radius:14px;">
        <tr><td style="padding:14px 18px;" class="bn-day">
          <p style="margin:0 0 8px;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8E8E93;font-weight:700;" class="bn-m">Total del d&iacute;a</p>
          <p style="margin:0 0 6px;font-size:13px;color:#1C1C1E;" class="bn-t1">
            <span style="color:#8E8E93;" class="bn-m">Total:</span>
            <b style="color:#000000;" class="bn-olive">${formatoPesos(totalDia.total)}</b>
          </p>
          <p style="margin:0;font-size:12px;color:#1C1C1E;line-height:1.7;" class="bn-t1">
            <span style="color:#8E8E93;" class="bn-m">Efectivo</span> <b style="color:#000000;" class="bn-ol">${formatoPesos(totalDia.efectivo.total)}</b>
            <span style="color:#8E8E93;margin-left:12px;" class="bn-m">Transf.</span> <b style="color:#000000;" class="bn-ol">${formatoPesos(totalDia.transferencia.total)}</b>
            <span style="color:#8E8E93;margin-left:12px;" class="bn-m">Tarjeta</span> <b style="color:#000000;" class="bn-ol">${formatoPesos(totalDia.tarjeta.total)}</b>
          </p>
        </td></tr>
      </table>
    </td></tr>`
    : '';

  const footerHtml = `
    <tr><td class="bn-footer" style="background:#F2F2F7;border-top:1px solid #E5E5EA;padding:18px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#8E8E93;" class="bn-m">Cerrado por <b style="color:#1C1C1E;" class="bn-t1">${escapeHtml(cerradoPor)}</b></td>
          <td align="right" style="font-size:11px;color:#9E9EA4;letter-spacing:0.5px;" class="bn-m">Desarrollo By NexusCode &middot;</td>
        </tr>
      </table>
    </td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bn-body { background-color: #000000 !important; }
    .bn-card { background-color: #1C1C1E !important; border-color: #3A3A3C !important; }
    .bn-header { background-color: #0A0A0A !important; }
    .bn-stat, .bn-day { background-color: #2C2C2E !important; border-color: #3A3A3C !important; }
    .bn-footer { background-color: #17171A !important; border-top-color: #3A3A3C !important; }
    .bn-t1 { color: #FFFFFF !important; }
    .bn-t2 { color: #C7C7CC !important; }
    .bn-m { color: #98989D !important; }
    .bn-olive, .bn-ol { color: #FFFFFF !important; }
  }
</style>
</head>
<body class="bn-body" style="margin:0;padding:24px 12px;background-color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" class="bn-card" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E5E5EA;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        ${headerHtml}
        ${totalHtml}
        ${statsHtml}
        ${metaHtml}
        ${ventasHtml}
        ${totalDiaHtml}
        ${footerHtml}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    fecha,
    hora,
    subject,
    text:
      `Cierre ${turnoLabel} del ${fecha} a las ${hora}\n` +
      `${textoFilas}\n\n` +
      `Ventas del ${turnoLabel}:\n${detalle}`,
    html,
  };
};

const parseDireccion = (raw) => {
  const m = String(raw || '').match(/^(?:([^<]*?)\s*)?<([^>]+)>\s*$/);
  if (m) return { name: m[1] || m[2], email: m[2] };
  const email = String(raw || '').trim();
  return { name: email, email };
};

const toDirecciones = (raw) =>
  String(raw || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseDireccion);

const enviarViaApi = async ({ subject, text, html }) => {
  const from = parseDireccion(process.env.MAIL_FROM || `"NexusCode" <${process.env.MAIL_USER}>`);
  const destinos = toDirecciones(process.env.MAIL_TO);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: from,
      to: destinos,
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const cuerpo = await response.text().catch(() => '');
    throw new Error(`Brevo API HTTP ${response.status}${cuerpo ? `: ${cuerpo.slice(0, 200)}` : ''}`);
  }
};

const enviarCorreo = async ({ subject, text, html }) => {
  if (MODO_API) {
    await enviarViaApi({ subject, text, html });
    return;
  }
  const transporter = crearTransporter();
  await transporter.sendMail({
    from: mailFrom(),
    to: process.env.MAIL_TO,
    subject,
    text,
    html,
  });
};

export const enviarCierreDeCaja = async ({ ventas, close, offset, turno, totalDia }) => {
  if (!estaConfigurado()) {
    console.warn('[Mail] No configurado, se omite el envío del cierre.');
    return { enviado: false };
  }

  const datos = buildDatosCierre({ ventas, close, offset, turno, totalDia });
  await enviarCorreo(datos);
  return { enviado: true };
};

export const enviarMailTest = async ({ offset = 0 } = {}) => {
  if (!estaConfigurado()) {
    throw new Error('Mail no configurado: faltan MAIL_USER / MAIL_PASS / MAIL_TO o BREVO_API_KEY en el .env');
  }

  const ventas = [{
    items: [{ producto: { nombre: 'Zapatillas Nike' }, cantidad: 2, talle: '38', subtotal: 110000 }],
    empleado: 'Admin',
  }];
  const close = {
    fecha: new Date(),
    cerradoAt: new Date(),
    cerradoPor: 'Admin',
    total: 110000,
    cantidad: 2,
    efectivo: { total: 0, cantidad: 0 },
    transferencia: { total: 0, cantidad: 0 },
    tarjeta: { total: 110000, cantidad: 2 },
  };

  const datos = buildDatosCierre({ ventas, close, offset, turno: 'mañana' });
  await enviarCorreo({ ...datos, subject: `[Prueba] ${datos.subject}` });
  return datos;
};
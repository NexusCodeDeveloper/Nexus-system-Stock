import { printHtml } from './printHtml';
import { formatMoney } from './format';

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const MAX_ETIQUETAS = 100;
const A4_ANCHO = 210;
const A4_ALTO = 297;
const MEDIDA_DEFAULT = { ancho: 60, alto: 40 };

const clamp = (valor, min, max) => Math.min(Math.max(Number(valor) || min, min), max);

export const printLabel = async (producto, opciones = {}) => {
  const codigo = String(producto?.codigo || '').trim();
  if (!codigo) return false;

  const total = clamp(opciones.cantidad || 1, 1, MAX_ETIQUETAS);
  const modo = opciones.modo === 'hoja' ? 'hoja' : 'etiqueta';
  const guias = opciones.guias !== false;
  const mostrarQr = opciones.mostrarQr !== false;
  const mostrarPrecio = opciones.mostrarPrecio !== false;
  const ancho = clamp(opciones.medida?.ancho || MEDIDA_DEFAULT.ancho, 20, A4_ANCHO);
  const alto = clamp(opciones.medida?.alto || MEDIDA_DEFAULT.alto, 10, A4_ALTO);

  const qrMm = clamp(alto * 0.42, 10, 18);
  const barrasMm = clamp(alto * 0.28, 6, 12);
  const paddingMm = clamp(Math.min(ancho, alto) * 0.075, 2, 3);
  const gapMm = clamp(alto * 0.03, 0.5, 1.5);

  let qrDataUrl = '';
  let barcodeDataUrl = '';

  try {
    if (mostrarQr) {
      const QRCode = (await import('qrcode')).default;
      qrDataUrl = await QRCode.toDataURL(codigo, { margin: 1, width: 200 });
    }
  } catch {
    qrDataUrl = '';
  }

  try {
    const JsBarcode = (await import('jsbarcode')).default;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, codigo, {
      format: 'CODE128',
      displayValue: false,
      width: 2,
      height: 55,
      margin: 4,
    });
    barcodeDataUrl = canvas.toDataURL('image/png');
  } catch {
    barcodeDataUrl = '';
  }

  if (!qrDataUrl && !barcodeDataUrl) return false;

  const etiquetaHtml = `<div class="etiqueta${modo === 'hoja' && guias ? ' guia' : ''}">
    <p class="nombre">${escapeHtml(producto.nombre || '')}</p>
    ${mostrarPrecio && producto.precio ? `<p class="precio">${formatMoney(producto.precio)}</p>` : ''}
    ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR" />` : ''}
    ${barcodeDataUrl ? `<img class="barras" src="${barcodeDataUrl}" alt="Código de barras" />` : ''}
    <p class="codigo">${escapeHtml(codigo)}</p>
  </div>`;

  let cuerpo = '';
  let paginasCss = '';

  if (modo === 'hoja') {
    const columnas = Math.max(1, Math.floor(A4_ANCHO / ancho));
    const filas = Math.max(1, Math.floor(A4_ALTO / alto));
    const porHoja = columnas * filas;
    const hojas = [];
    for (let i = 0; i < total; i += porHoja) {
      const enHoja = Math.min(porHoja, total - i);
      hojas.push(`<div class="hoja">${etiquetaHtml.repeat(enHoja)}</div>`);
    }
    cuerpo = hojas.join('\n');
    paginasCss = `
  @page { size: A4; margin: 0; }
  .hoja {
    width: 210mm;
    height: 297mm;
    display: grid;
    grid-template-columns: repeat(${columnas}, ${ancho}mm);
    grid-auto-rows: ${alto}mm;
    align-content: center;
    justify-content: center;
    page-break-after: always;
    break-after: page;
  }
  .hoja:last-child { page-break-after: auto; break-after: auto; }
  .etiqueta.guia { outline: 1px dashed #c7c7c7; outline-offset: -1px; }`;
  } else {
    cuerpo = etiquetaHtml.repeat(total);
    paginasCss = `
  @page { size: ${ancho}mm ${alto}mm; margin: 0; }
  .etiqueta { page-break-after: always; break-after: page; }
  .etiqueta:last-child { page-break-after: auto; break-after: auto; }`;
  }

  const ok = await printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Etiquetas ${escapeHtml(codigo)}</title>
<style>
${paginasCss}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .etiqueta {
    width: ${ancho}mm;
    height: ${alto}mm;
    padding: ${paddingMm}mm;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${gapMm}mm;
    overflow: hidden;
  }
  .nombre { font-size: 10px; font-weight: bold; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; flex: 0 0 auto; }
  .precio { font-size: 11px; font-weight: bold; margin: 0; flex: 0 0 auto; }
  .qr { width: ${qrMm}mm; height: ${qrMm}mm; min-height: 6mm; flex: 0 1 auto; object-fit: contain; }
  .barras { max-width: 100%; height: ${barrasMm}mm; min-height: 5mm; flex: 0 1 auto; object-fit: contain; }
  .codigo { font-size: 9px; letter-spacing: 1px; margin: 0; flex: 0 0 auto; }
</style>
</head>
<body>
${cuerpo}
</body>
</html>`);
  return ok;
};

import mongoose from 'mongoose';
import '../config/env.js';

const OFFSET = (() => {
  const arg = process.argv.find((a) => a.startsWith('--offset='));
  const val = arg ? Number(arg.split('=')[1]) : Number(process.env.AUDIT_OFFSET);
  return Number.isFinite(val) ? val : 0;
})();

const seccion = (titulo) => console.log(`\n=== ${titulo} ===`);

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const ventas = db.collection('ventas');
  const productos = db.collection('productos');
  const devoluciones = db.collection('devoluciones');
  const retiros = db.collection('retirosCaja');
  const dias = db.collection('retirosCajaDias');
  const cierres = db.collection('cierresCaja');
  const movimientos = db.collection('movimientosStock');

  console.log('Auditoría de datos — Nexus System Stock');
  console.log('Solo lectura: no modifica nada.');

  seccion('Ventas legacy (sin articulos[])');
  const legacy = await ventas
    .find({ $or: [{ articulos: { $exists: false } }, { articulos: { $size: 0 } }] })
    .project({ ticketNumero: 1, total: 1, producto: 1, fechaCreacion: 1 })
    .toArray();
  console.log(`Total: ${legacy.length}`);
  if (legacy.length > 0) console.log(JSON.stringify(legacy.slice(0, 10), null, 2));

  seccion('Ventas devueltas inconsistentes (total > 0 o articulos vacío)');
  const devueltas = await ventas
    .find({
      $or: [
        { estado: 'devuelta', total: { $gt: 0 } },
        { estado: 'devuelta', $or: [{ articulos: { $exists: false } }, { articulos: { $size: 0 } }] },
      ],
    })
    .project({ ticketNumero: 1, total: 1, estado: 1, montoDevuelto: 1, cantidadDevuelta: 1 })
    .toArray();
  console.log(`Total: ${devueltas.length}`);
  if (devueltas.length > 0) console.log(JSON.stringify(devueltas.slice(0, 10), null, 2));

  seccion('Ventas activas sin pagos (pagos vacío)');
  const sinPagos = await ventas.countDocuments({ estado: { $ne: 'devuelta' }, $or: [{ pagos: { $size: 0 } }, { pagos: { $exists: false } }] });
  console.log(`Total: ${sinPagos}`);

  seccion('Devoluciones huérfanas o sin snapshot');
  const idsVentas = new Set((await ventas.find({}).project({ _id: 1 }).toArray()).map((s) => String(s._id)));
  const idsProductos = new Set((await productos.find({}).project({ _id: 1 }).toArray()).map((p) => String(p._id)));
  const todasDevoluciones = await devoluciones.find({}).toArray();
  const huerfanas = todasDevoluciones.filter(
    (r) =>
      (r.venta && !idsVentas.has(String(r.venta))) ||
      !idsProductos.has(String(r.producto)) ||
      (r.productoCargar && !idsProductos.has(String(r.productoCargar))) ||
      (r.ventaDiferenciaId && !idsVentas.has(String(r.ventaDiferenciaId)))
  );
  console.log(`Total: ${huerfanas.length}`);
  if (huerfanas.length > 0) console.log(JSON.stringify(huerfanas.slice(0, 10).map((r) => ({ _id: r._id, venta: r.venta, producto: r.producto, productoCargar: r.productoCargar, ventaDiferenciaId: r.ventaDiferenciaId })), null, 2));
  const sinSnapshot = todasDevoluciones.filter((r) => !r.precioUnitario || Number(r.precioUnitario) === 0).length;
  console.log(`Devoluciones sin snapshot de precio (previas al fix): ${sinSnapshot}`);

  seccion('Productos con stock varado (variantes + deposito raíz > 0)');
  const varados = await productos
    .find({ 'variantes.0': { $exists: true }, deposito: { $gt: 0 } })
    .project({ nombre: 1, deposito: 1, variantes: 1 })
    .toArray();
  console.log(`Total: ${varados.length}`);
  if (varados.length > 0) console.log(JSON.stringify(varados.slice(0, 10).map((p) => ({ nombre: p.nombre, deposito: p.deposito })), null, 2));

  seccion('Productos con cantidad inconsistente (≠ suma de variantes)');
  const conVariantes = await productos.find({ 'variantes.0': { $exists: true } }).toArray();
  const inconsistentes = conVariantes.filter((p) => {
    const suma = (p.variantes || []).reduce((s, v) => s + (v.cantidad || 0), 0);
    return (p.cantidad || 0) !== suma;
  });
  console.log(`Total: ${inconsistentes.length}`);
  if (inconsistentes.length > 0) console.log(JSON.stringify(inconsistentes.slice(0, 10).map((p) => ({ nombre: p.nombre, cantidad: p.cantidad, sumaVariantes: (p.variantes || []).reduce((s, v) => s + (v.cantidad || 0), 0) })), null, 2));

  seccion('Stock negativo');
  const stockNegativo = await productos.countDocuments({ $or: [{ cantidad: { $lt: 0 } }, { deposito: { $lt: 0 } }, { 'variantes.cantidad': { $lt: 0 } }, { 'variantes.deposito': { $lt: 0 } }] });
  console.log(`Total: ${stockNegativo}`);

  seccion('Nombres de producto duplicados (case-insensitive)');
  const todosProductos = await productos.find({}).project({ nombre: 1 }).toArray();
  const porNombre = new Map();
  for (const p of todosProductos) {
    const key = String(p.nombre || '').trim().toLowerCase();
    porNombre.set(key, (porNombre.get(key) || 0) + 1);
  }
  const duplicados = [...porNombre.entries()].filter(([, n]) => n > 1);
  console.log(`Total: ${duplicados.length}`);
  if (duplicados.length > 0) console.log(JSON.stringify(duplicados.slice(0, 10), null, 2));

  seccion('Tickets nulos o duplicados');
  const sinTicket = await ventas.countDocuments({ $or: [{ ticketNumero: { $exists: false } }, { ticketNumero: null }, { ticketNumero: '' }] });
  console.log(`Ventas sin ticket: ${sinTicket}`);
  const tickets = await ventas.aggregate([
    { $match: { ticketNumero: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$ticketNumero', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  console.log(`Tickets duplicados: ${tickets.length}`);
  if (tickets.length > 0) console.log(JSON.stringify(tickets.slice(0, 10), null, 2));

  seccion('Documentos sin marcar por la migración de centavos');
  for (const name of ['productos', 'ventas', 'devoluciones', 'retirosCaja', 'cierresCaja']) {
    const total = await db.collection(name).countDocuments();
    const sinMarca = await db.collection(name).countDocuments({ _moneyCentsV1: { $ne: true } });
    console.log(`${name}: ${sinMarca} sin marca de ${total}`);
  }
  console.log('Los documentos creados después de la migración no llevan marca por diseño (ya están en centavos).');

  seccion('Contadores de retiros vs retiros reales');
  console.log(`Zona horaria usada (offset): ${OFFSET} minutos. Usá --offset=180 para Argentina si ves falsos descuadres.`);
  const todosDias = await dias.find({}).toArray();
  let descuadres = 0;
  const detalleDescuadres = [];
  for (const day of todosDias) {
    const [y, m, d] = String(day.fecha).split('-').map(Number);
    if (!y || !m || !d) continue;
    const desde = new Date(Date.UTC(y, m - 1, d) + OFFSET * 60000);
    const hasta = new Date(desde.getTime() + 86400000);
    const reales = await retiros
      .find({ fechaCreacion: { $gte: desde, $lt: hasta } })
      .toArray();
    const suma = Math.round(reales.reduce((s, w) => s + (w.monto || 0), 0) / 100 * 100) / 100;
    const contador = Math.round((day.retirado || 0) * 100) / 100;
    if (Math.abs(suma - contador) > 0.01) {
      descuadres++;
      detalleDescuadres.push({ fecha: day.fecha, contador, sumaReal: suma, diferencia: Math.round((contador - suma) * 100) / 100 });
    }
  }
  console.log(`Días descuadrados: ${descuadres}`);
  if (detalleDescuadres.length > 0) console.log(JSON.stringify(detalleDescuadres.slice(0, 10), null, 2));

  seccion('Cierres con ventanas inválidas o duplicadas');
  const todosCierres = await cierres.find({}).toArray();
  const sinTurno = todosCierres.filter((c) => !c.turno).length;
  const ventanasInvalidas = todosCierres.filter((c) => c.desde && c.hasta && new Date(c.desde) >= new Date(c.hasta));
  const claves = new Map();
  for (const c of todosCierres) {
    const key = `${new Date(c.fecha).toISOString()}|${c.turno || 'legacy'}`;
    claves.set(key, (claves.get(key) || 0) + 1);
  }
  const duplicadosCierre = [...claves.entries()].filter(([, n]) => n > 1);
  console.log(`Cierres legacy sin turno: ${sinTurno}`);
  console.log(`Cierres con ventana inválida: ${ventanasInvalidas.length}`);
  console.log(`Claves fecha+turno duplicadas: ${duplicadosCierre.length}`);
  if (duplicadosCierre.length > 0) console.log(JSON.stringify(duplicadosCierre.slice(0, 10), null, 2));

  seccion('Cajas abiertas sin cerrar');
  const cajasAbiertas = await cierres.find({ estado: 'abierto' }).toArray();
  console.log(`Total: ${cajasAbiertas.length}`);
  if (cajasAbiertas.length > 0) {
    console.log(JSON.stringify(cajasAbiertas.slice(0, 5).map((c) => ({
      fecha: c.fecha,
      abiertoPor: c.abiertoPor,
      abiertaEn: c.abiertaEn,
    })), null, 2));
  }

  seccion('Movimientos de stock huérfanos');
  const todosMovimientos = await movimientos.find({}).project({ producto: 1 }).toArray();
  const movimientosHuerfanos = todosMovimientos.filter((m) => !idsProductos.has(String(m.producto))).length;
  console.log(`Total: ${movimientosHuerfanos}`);

  console.log('\nAuditoría finalizada.');
};

run()
  .catch((error) => {
    console.error('Error en la auditoría:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());

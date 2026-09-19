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

  const sales = db.collection('sales');
  const products = db.collection('products');
  const returns = db.collection('returns');
  const withdrawals = db.collection('cashwithdrawals');
  const days = db.collection('cashwithdrawaldays');
  const closes = db.collection('dailycloses');
  const movements = db.collection('stockmovements');

  console.log('Auditoría de datos — Nexus System Stock');
  console.log('Solo lectura: no modifica nada.');

  seccion('Ventas legacy (sin items[])');
  const legacy = await sales
    .find({ $or: [{ items: { $exists: false } }, { items: { $size: 0 } }] })
    .project({ ticketNumero: 1, total: 1, producto: 1, createdAt: 1 })
    .toArray();
  console.log(`Total: ${legacy.length}`);
  if (legacy.length > 0) console.log(JSON.stringify(legacy.slice(0, 10), null, 2));

  seccion('Ventas devueltas inconsistentes (total > 0 o items vacío)');
  const devueltas = await sales
    .find({
      $or: [
        { estado: 'devuelta', total: { $gt: 0 } },
        { estado: 'devuelta', $or: [{ items: { $exists: false } }, { items: { $size: 0 } }] },
      ],
    })
    .project({ ticketNumero: 1, total: 1, estado: 1, montoDevuelto: 1, cantidadDevuelta: 1 })
    .toArray();
  console.log(`Total: ${devueltas.length}`);
  if (devueltas.length > 0) console.log(JSON.stringify(devueltas.slice(0, 10), null, 2));

  seccion('Ventas activas sin pagos (pagos vacío)');
  const sinPagos = await sales.countDocuments({ estado: { $ne: 'devuelta' }, $or: [{ pagos: { $size: 0 } }, { pagos: { $exists: false } }] });
  console.log(`Total: ${sinPagos}`);

  seccion('Devoluciones huérfanas o sin snapshot');
  const saleIds = new Set((await sales.find({}).project({ _id: 1 }).toArray()).map((s) => String(s._id)));
  const productIds = new Set((await products.find({}).project({ _id: 1 }).toArray()).map((p) => String(p._id)));
  const todosReturns = await returns.find({}).toArray();
  const huerfanas = todosReturns.filter(
    (r) =>
      (r.sale && !saleIds.has(String(r.sale))) ||
      !productIds.has(String(r.producto)) ||
      (r.productoCargar && !productIds.has(String(r.productoCargar))) ||
      (r.ventaDiferenciaId && !saleIds.has(String(r.ventaDiferenciaId)))
  );
  console.log(`Total: ${huerfanas.length}`);
  if (huerfanas.length > 0) console.log(JSON.stringify(huerfanas.slice(0, 10).map((r) => ({ _id: r._id, sale: r.sale, producto: r.producto, productoCargar: r.productoCargar, ventaDiferenciaId: r.ventaDiferenciaId })), null, 2));
  const sinSnapshot = todosReturns.filter((r) => !r.precioUnitario || Number(r.precioUnitario) === 0).length;
  console.log(`Devoluciones sin snapshot de precio (previas al fix): ${sinSnapshot}`);

  seccion('Productos con stock varado (variants + deposito raíz > 0)');
  const varados = await products
    .find({ 'variants.0': { $exists: true }, deposito: { $gt: 0 } })
    .project({ nombre: 1, deposito: 1, variants: 1 })
    .toArray();
  console.log(`Total: ${varados.length}`);
  if (varados.length > 0) console.log(JSON.stringify(varados.slice(0, 10).map((p) => ({ nombre: p.nombre, deposito: p.deposito })), null, 2));

  seccion('Productos con cantidad inconsistente (≠ suma de variantes)');
  const conVariantes = await products.find({ 'variants.0': { $exists: true } }).toArray();
  const inconsistentes = conVariantes.filter((p) => {
    const suma = (p.variants || []).reduce((s, v) => s + (v.cantidad || 0), 0);
    return (p.cantidad || 0) !== suma;
  });
  console.log(`Total: ${inconsistentes.length}`);
  if (inconsistentes.length > 0) console.log(JSON.stringify(inconsistentes.slice(0, 10).map((p) => ({ nombre: p.nombre, cantidad: p.cantidad, sumaVariantes: (p.variants || []).reduce((s, v) => s + (v.cantidad || 0), 0) })), null, 2));

  seccion('Stock negativo');
  const stockNegativo = await products.countDocuments({ $or: [{ cantidad: { $lt: 0 } }, { deposito: { $lt: 0 } }, { 'variants.cantidad': { $lt: 0 } }, { 'variants.deposito': { $lt: 0 } }] });
  console.log(`Total: ${stockNegativo}`);

  seccion('Nombres de producto duplicados (case-insensitive)');
  const todosProductos = await products.find({}).project({ nombre: 1 }).toArray();
  const porNombre = new Map();
  for (const p of todosProductos) {
    const key = String(p.nombre || '').trim().toLowerCase();
    porNombre.set(key, (porNombre.get(key) || 0) + 1);
  }
  const duplicados = [...porNombre.entries()].filter(([, n]) => n > 1);
  console.log(`Total: ${duplicados.length}`);
  if (duplicados.length > 0) console.log(JSON.stringify(duplicados.slice(0, 10), null, 2));

  seccion('Tickets nulos o duplicados');
  const sinTicket = await sales.countDocuments({ $or: [{ ticketNumero: { $exists: false } }, { ticketNumero: null }, { ticketNumero: '' }] });
  console.log(`Ventas sin ticket: ${sinTicket}`);
  const tickets = await sales.aggregate([
    { $match: { ticketNumero: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$ticketNumero', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  console.log(`Tickets duplicados: ${tickets.length}`);
  if (tickets.length > 0) console.log(JSON.stringify(tickets.slice(0, 10), null, 2));

  seccion('Documentos sin marcar por la migración de centavos');
  for (const name of ['products', 'sales', 'returns', 'cashwithdrawals', 'dailycloses']) {
    const total = await db.collection(name).countDocuments();
    const sinMarca = await db.collection(name).countDocuments({ _moneyCentsV1: { $ne: true } });
    console.log(`${name}: ${sinMarca} sin marca de ${total}`);
  }
  console.log('Los documentos creados después de la migración no llevan marca por diseño (ya están en centavos).');

  seccion('Contadores de retiros vs retiros reales');
  console.log(`Zona horaria usada (offset): ${OFFSET} minutos. Usá --offset=180 para Argentina si ves falsos descuadres.`);
  const todosDays = await days.find({}).toArray();
  let descuadres = 0;
  const detalleDescuadres = [];
  for (const day of todosDays) {
    const [y, m, d] = String(day.fecha).split('-').map(Number);
    if (!y || !m || !d) continue;
    const desde = new Date(Date.UTC(y, m - 1, d) + OFFSET * 60000);
    const hasta = new Date(desde.getTime() + 86400000);
    const reales = await withdrawals
      .find({ createdAt: { $gte: desde, $lt: hasta } })
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
  const todosCloses = await closes.find({}).toArray();
  const sinTurno = todosCloses.filter((c) => !c.turno).length;
  const ventanasInvalidas = todosCloses.filter((c) => c.desdeAt && c.hastaAt && new Date(c.desdeAt) >= new Date(c.hastaAt));
  const claves = new Map();
  for (const c of todosCloses) {
    const key = `${new Date(c.fecha).toISOString()}|${c.turno || 'legacy'}`;
    claves.set(key, (claves.get(key) || 0) + 1);
  }
  const duplicadosCierre = [...claves.entries()].filter(([, n]) => n > 1);
  console.log(`Cierres legacy sin turno: ${sinTurno}`);
  console.log(`Cierres con ventana inválida: ${ventanasInvalidas.length}`);
  console.log(`Claves fecha+turno duplicadas: ${duplicadosCierre.length}`);
  if (duplicadosCierre.length > 0) console.log(JSON.stringify(duplicadosCierre.slice(0, 10), null, 2));

  seccion('Cajas abiertas sin cerrar');
  const cajasAbiertas = await closes.find({ estado: 'abierto' }).toArray();
  console.log(`Total: ${cajasAbiertas.length}`);
  if (cajasAbiertas.length > 0) {
    console.log(JSON.stringify(cajasAbiertas.slice(0, 5).map((c) => ({
      fecha: c.fecha,
      abiertoPor: c.abiertoPor,
      abiertoAt: c.abiertoAt,
    })), null, 2));
  }

  seccion('Movimientos de stock huérfanos');
  const movs = await movements.find({}).project({ producto: 1 }).toArray();
  const movHuerfanos = movs.filter((m) => !productIds.has(String(m.producto))).length;
  console.log(`Total: ${movHuerfanos}`);

  console.log('\nAuditoría finalizada.');
};

run()
  .catch((error) => {
    console.error('Error en la auditoría:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());

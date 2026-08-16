import { randomInt } from 'node:crypto';

export const generarTicketNumero = () => String(randomInt(100000000, 1000000000));

export const guardarConTicketUnico = async (sale, session) => {
  const MAX_INTENTOS = 10;
  for (let i = 0; i < MAX_INTENTOS; i++) {
    sale.ticketNumero = generarTicketNumero();
    try {
      return await sale.save({ session });
    } catch (error) {
      if (error.code !== 11000 || i === MAX_INTENTOS - 1) throw error;
    }
  }
};

export const registrarDevolucionEnVenta = (sale, { motivo, cantidad, monto }) => {
  const montoRound = Math.round(monto * 100) / 100;
  sale.cantidadDevuelta = Math.round(((sale.cantidadDevuelta || 0) + cantidad) * 100) / 100;
  sale.montoDevuelto = Math.round(((sale.montoDevuelto || 0) + montoRound) * 100) / 100;
  sale.devoluciones = sale.devoluciones || [];
  sale.devoluciones.push({ motivo, cantidad, monto: montoRound, fecha: new Date() });
  if (sale.pagos && sale.pagos.length > 0) {
    sale.pagos[0].monto = Math.max(0, Math.round((sale.pagos[0].monto - montoRound) * 100) / 100);
  }
};

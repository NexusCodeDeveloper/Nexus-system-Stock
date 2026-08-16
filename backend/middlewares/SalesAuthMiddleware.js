import jwt from 'jsonwebtoken';

export const protectSales = (req, res, next) => {
  const token = req.headers['x-sales-token'];
  if (!token) {
    return res.status(401).json({ message: 'No autorizado, se requiere token de ventas' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'sales') {
      return res.status(403).json({ message: 'Token no válido para ventas' });
    }
    req.salesUser = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'No autorizado, token de ventas inválido' });
  }
};

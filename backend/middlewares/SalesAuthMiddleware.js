export const protectSales = (req, res, next) => {
  req.salesUser = {
    email: 'admin@nexus.com',
    nombre: 'Admin Demo',
    type: 'sales',
  };
  next();
};

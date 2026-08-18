export const protect = (req, res, next) => {
  req.user = {
    id: '000000000000000000000001',
    nombre: 'Admin Demo',
    email: 'admin@nexus.com',
    rol: 'admin',
  };
  next();
};

export const admin = (req, res, next) => {
  next();
};
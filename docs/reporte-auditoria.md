# Reporte de auditoría — Nexus System Stock

**Fecha:** 2026-09-10
**Alcance:** backend (`backend/`), frontend (`frontend/`), infraestructura (`render.yaml`, scripts, dependencias).
**Estado:** correcciones críticas aplicadas y verificadas. Quedan pendientes menores documentados al final.

---

## 1. Por qué crasheaba la app

### Causa reproducida
Al correr `npm run dev`, el backend moría y nodemon mostraba `app crashed - waiting for file changes before starting...`.

Reproducción en vivo:

```
$ node index.js
FATAL: Missing required environment variable MONGO_URI
EXIT_CODE=1
```

**No existía `backend/.env`** (solo `.env.example`). `backend/index.js` exige 7 variables y
hacía `process.exit(1)` sin mensaje accionable. Después se creó el `.env`, pero apareció un
segundo problema: `EADDRINUSE: address already in use :::5000` (proceso node viejo en el puerto),
y el error **no se manejaba bien**: `app.on('error')` estaba registrado en `app` en vez del
`http.Server`, por lo que nunca se disparaba; el error caía en `uncaughtException`, que solo
logueaba y **no terminaba el proceso**, dejando un backend zombi (conectado a Mongo, sin HTTP).

### Correcciones aplicadas
| Archivo | Cambio |
|---|---|
| `backend/index.js` | `server = app.listen()` + `server.on('error')` real; `uncaughtException`/`unhandledRejection` → `process.exit(1)`; mensaje claro si faltan variables; `trust proxy`; CORS con `trim()`; rate limit global y de escrituras; `JWT_SECRET` mínimo 32; fallback de `sendFile` con 404 claro |
| `backend/config/db.js` | Se quitó el `process.exit(1)` duplicado; `serverSelectionTimeoutMS: 15000` |
| `backend/services/pushService.js` | `setVapidDetails` dentro de `try/catch`: claves VAPID inválidas ya no tumban el proceso, solo desactivan el push |
| `backend/.env.example` | Instrucciones de JWT (32+) y VAPID (vacío = push desactivado) |

---

## 2. Correcciones de seguridad e integridad (backend)

| # | Problema original | Corrección |
|---|---|---|
| 1 | `empleado`/`realizadoPor`/`cerradoPor`/`realizadoNombre` se tomaban del body (falsificables) | Se derivan de `req.user` (token): `SaleController.js`, `CashWithdrawalController.js`, `NotificationController.js`, `ProductController.js` |
| 2 | JWT de 30 días sin revocación; rol viejo congelado | JWT de 8 h + `tokenVersion` en `AuthModel`; `protect` valida usuario existente y versión en cada request |
| 3 | bcrypt 10 rounds; secreto mínimo 16 | bcrypt 12 rounds; `JWT_SECRET` mínimo 32 |
| 4 | Tickets con reintento dentro de transacción (E11000 abortaba la sesión) | Contador atómico `Counter` (`findByIdAndUpdate $inc`); `guardarConTicketUnico` asigna y guarda una sola vez |
| 5 | Caja no atómica y con montos divergentes | `createCashWithdrawal` y `deleteCashWithdrawal` en transacción; se persiste el monto redondeado y el contador del día se actualiza en la misma transacción |
| 6 | `netProbe` permitía escaneo de puertos; `mailStatus` filtraba config; `resendCloseMail` devolvía error crudo | `netProbe` eliminado; errores de mail pasan por `next(error)` y se loguean solo en el servidor |
| 7 | Rate limit solo en login | Limiter global (1500/15 min) + limiter de escrituras (300/15 min) + login (30/15 min), con `trust proxy` |
| 8 | Zod aceptaba `Infinity`; endpoints sin schema | `.finite()` en precios/montos; `realizadoPor`/`empleado`/`cerradoPor` opcionales (los pone el servidor) |
| 9 | Notificaciones push por nombre (homónimos cruzados) | `PushSubscription.userId` + filtro por `userId` con fallback legacy por nombre |
| 10 | `abortTransaction()` sin catch en algunos catch | `.catch(() => {})` en Sale/Product/Return/CashWithdrawal |

**Pendiente deliberado (por precaución):** soft-delete con auditoría. Es un cambio transversal
que altera el comportamiento de borrado; se documenta abajo para una próxima iteración.

---

## 3. Correcciones de robustez (frontend)

| # | Problema | Corrección |
|---|---|---|
| 1 | `ProtectedRoute` renderizaba las páginas sin sesión | Devuelve `null` sin usuario (el login ya se muestra desde `App`) |
| 2 | `ErrorBoundary` no cubría `ThemeProvider`/`AlertProvider` (pantalla blanca) | `main.jsx` ahora envuelve todo el árbol con el boundary |
| 3 | `localStorage` sin try/catch en arranque y en cada request | Nuevo `src/utils/storage.js`; usado en `AuthContext`, `api/axios.js`, `ThemeContext`, `RoleGuideOverlay`, `PushPermissionBanner` |
| 4 | Fallback de API a `http://localhost:5000/api` también en producción | Fallback condicional: `DEV` → localhost; producción → `/api` |
| 5 | `manifest.webmanifest` existía pero no se enlazaba (push/PWA roto) | `<link rel="manifest">` + metas PWA + íconos en `index.html`; se quitaron las Google Fonts sin uso |
| 6 | `Notification.requestPermission()` sin feature detection; `serviceWorker.ready` podía colgarse | Detección de `Notification`; `esperarServiceWorker()` con timeout de 5 s; catches en el banner |
| 7 | Doble fetch en Products y `allProducts` nunca se refrescaba | Un solo fetch de montaje; `refreshProducts()` en mutaciones; `allProducts` se deriva cuando no hay búsqueda |
| 8 | `fetchCloses` corría aunque la pestaña activa fuera Ventas | Solo se carga con `activeTab === 'cierres'` |
| 9 | Accesos sin guard a `p.variants`, `p.nombre`, `quickAdd`, `addStockModal`, `returnModal` | Guards `?.` y `|| []` |
| 10 | `data.sales`/`notifications` asumidos array | Normalización con `Array.isArray` antes de guardar en estado |
| 11 | Venta pedía el nombre del empleado a mano | Se precarga `user.nombre` (el backend igual lo deriva del token) |

**Pendiente deliberado:** unificar el modal de devolución de `Products.jsx` con `ReturnForm`
y dividir los componentes gigantes (`Sales.jsx` 1368 líneas, `Products.jsx` 1198). Se corrigieron
los bugs de esos flujos, pero el refactor estructural se deja para una iteración con pruebas manuales.

---

## 4. Migración de dinero a centavos

Los montos ahora se guardan como **enteros en centavos** en MongoDB y la API sigue devolviendo
decimales (getters de Mongoose), por lo que **el frontend no requirió cambios**.

- Helper: `backend/utils/money.js` (`aCentavos`, `deCentavos`, `campoCentavos`)
- Modelos convertidos: `Product.precio`; `Sale.total`, `items[].precio/subtotal`, `pagos[].monto`,
  `montoDevuelto`, `devoluciones[].monto`; `Return.diferencia/montoDevuelto`; `CashWithdrawal.monto`;
  `DailyClose.total/*.total/retiros[].monto/totalRetiros`
- **Hallazgo clave:** los setters de Mongoose **no se aplican en `findOneAndUpdate`**, así que el
  cierre de caja (`buildClose`) convierte explícitamente con `aCentavos()`
- `CashWithdrawalDay.retirado` se mantiene decimal (se actualiza con `$inc` atómico)

**Migración ejecutada** (`backend/scripts/migrar-dinero.js --apply`):
```
products: 2/2 · sales: 5/5 · returns: 0/0 · cashwithdrawals: 1/1 · dailycloses: 0/0
Marcador: migrations._id = "money-cents-v1"
Backup: backend/backups/money-<timestamp>/  (gitignored)
```
Idempotente: si el marcador existe, no hace nada. Dry-run: `npm run migrar:dinero --prefix backend`.

---

## 5. Infraestructura, dependencias y tooling

| Problema | Corrección |
|---|---|
| Node sin pinear (Vite 8 exige ≥20.19) | `engines` en los 3 `package.json` + `NODE_VERSION: 22.12.0` en `render.yaml` |
| `PORT: 10000` hardcodeado en Render | Eliminado (Render inyecta `PORT`) |
| `postinstall` con 3 `npm install` anidados | Eliminado; `render.yaml` usa `npm ci` por proyecto; script `npm run setup` para local |
| `start:prod` dependía de `cross-env` en devDependencies | Eliminado |
| 11 vulnerabilidades (nodemailer, ip-address, qs, react-router, postcss, nanoid…) | `npm audit fix` + override `qs ^6.16.0`: **0 vulnerabilidades** en backend y frontend |
| Sin lint en raíz ni CI | `npm run lint` en raíz + `.github/workflows/ci.yml` (lint + build) |
| `docs/desarrollo.md` era un dump falso (1203 líneas, fechas inventadas) | Reemplazado por este reporte + `README.md` real |
| Código muerto | Eliminados: `netProbe`, `AuthController.seed` y su ruta, `migrateVariants` (roto: usaba `talles` inexistente en el schema) |

---

## 6. Verificación realizada

- `npm run lint --prefix frontend`: 0 errores (quedan warnings preexistentes de `exhaustive-deps` y fast-refresh)
- `npm run build --prefix frontend`: OK
- Backend: arranque + `/api/health` OK; login, `/auth/me`, token inválido → 401, `/products`, `/sales` OK
- Post-migración: producto `150000` (decimal correcto), venta `total 135800`, `item.precio 140000`,
  `pago.monto 14800`; creación de producto con `precio: 123.45` devuelve `123.45` y se borró el de prueba
- `npm audit`: 0 vulnerabilidades en ambos proyectos

---

## 7. Pendientes recomendados (no aplicados por precaución)

1. **Soft-delete + auditoría** en Sale/Return/DailyClose (quién y cuándo eliminó).
2. **Unificar devolución/cambio** en `ReturnForm` y eliminar el modal duplicado de `Products`.
3. **Dividir componentes gigantes** (`Sales.jsx`, `Products.jsx`) en hooks/tablas por dominio.
4. **Paginación** en listados y agregaciones Mongo para stats (hoy cargan todo en memoria).
5. **Deduplicar helpers** backend (fechas, `findVariantIdx`, `getItems`, `porMetodo`) y frontend
   (13 copias de `formatMoney`, 5 de `formatDate`) en `utils/`.
6. **Accesibilidad**: `IosModal` con `role="dialog"` + focus trap; labels con `htmlFor`; `aria-label` en botones icon-only.
7. **Tests**: no hay ninguno; se sugiere smoke tests de API y tests de los cálculos de devolución/cierre.
8. **Idempotencia de `seedUsers`** y validación de contraseñas de ejemplo en producción.

---

## 8. Checklist para Render (importante)

1. Cargar **todas** las variables: `MONGO_URI`, `JWT_SECRET` (32+), `ALLOWED_ORIGINS`,
   `ADMIN_EMAIL/PASSWORD`, `EMPLEADO_EMAIL/PASSWORD`.
2. `MONGO_URI` de Atlas (replica set) con la IP de Render permitida.
3. VAPID: dejar vacío (push off) o cargar claves reales; **no** los placeholders del `.env.example`.
4. `ALLOWED_ORIGINS` con el dominio real de Render (ej. `https://stock-tienda.onrender.com`).
5. El build ahora es `npm ci --prefix backend --omit=dev && npm ci --prefix frontend --include=dev && npm run build`.
6. Ejecutar la migración de dinero una sola vez contra la base de producción:
   `npm run migrar:dinero --prefix backend` (dry-run) y luego `--apply` (hace backup).

# Reporte de auditoría 2 — Nexus System Stock

**Fecha:** 2026-09-15
**Alcance:** backend completo, frontend completo, scripts, infraestructura y dependencias.
**Estado:** fases 1–4 aplicadas y verificadas (lint, build, tests y smoke test de arranque).

---

## Resumen ejecutivo

Se auditó todo el sistema en busca de errores, inconsistencias, código muerto, malas prácticas,
APIs deprecadas y riesgos de upgrade. Se detectaron **5 problemas críticos de integridad de datos**,
**14 altos**, decenas de medios/bajos y varios riesgos de upgrade (Express 5, Zod 4, Tailwind 4,
`document.write`). Todos los críticos y altos quedaron corregidos, junto con la mayor parte de los
medios/bajos y la preparación para los upgrades.

Verificación final: lint del frontend sin errores (solo warnings de fast-refresh/exhaustive-deps),
build de producción OK, 21 tests unitarios del backend OK y arranque del servidor + `/api/health` OK.

---

## Críticos

| # | Ubicación | Problema | Estado |
|---|---|---|---|
| 1 | `ProductController.js` (exchange) | Cambio del mismo producto (talle/color) cargaba 2 instancias y el segundo `save()` pisaba el stock devuelto. | Corregido |
| 2 | `CashWithdrawalController.js` | Guard del día con doble descuento: `monto <= efectivoVendido - 2*retirado`; rechazaba retiros válidos. | Corregido |
| 3 | `SaleController.js` (deleteSale) | No chequeaba `Return.ventaDiferenciaId`: borrar la venta de diferencia duplicaba stock. | Corregido |
| 4 | `Products.jsx` (devolución inline) | El backend elegía la venta más reciente y mutaba un ticket no elegido. | Corregido |
| 5 | `migrar-dinero.js` / `migrar-tickets.js` | Migraciones no idempotentes ante crash: re-ejecutar volvía a multiplicar ×100. | Corregido |

**Detalle de las correcciones:**

1. `exchangeProduct` detecta `mismoProducto`, reutiliza la misma instancia, valida stock considerando
   la devolución cuando es la misma variante, guarda una sola vez y calcula `precioDevuelto` filtrando
   por talle/color.
2. `createCashWithdrawal` separa `efectivoVendido` de `retiradoReal`; el tope del contador diario es
   `efectivoVendido - monto` (sin doble descuento). `getAvailableCash` sigue mostrando el disponible real.
3. `deleteSale` bloquea si existe un `Return` con `sale` **o** `ventaDiferenciaId` apuntando a la venta.
4. Se eliminó el fallback que buscaba ventas automáticamente: sin `sale` explícito solo se mueve stock
   y se registra la devolución/cambio sin tocar ningún ticket. En Products, la acción ahora abre un
   selector de ticket y reutiliza `ReturnForm` (validación de stock, diferencia y método de pago incluidos).
5. Ambas migraciones marcan cada documento (`_moneyCentsV1`, `_ticketAleatorioV1`) en el mismo update
   atómico y saltan los ya migrados; un crash a mitad ya no corrompe datos al reintentar.

## Altos

| # | Ubicación | Problema | Estado |
|---|---|---|---|
| 6 | `ReturnController.js`, `ProductController.js` | Filtraban `items` solo por producto, sin talle/color. | Corregido |
| 7 | `ReturnController.js` (deleteReturn) | Reponía en la línea equivocada y omitía en silencio si faltaba la variante. | Corregido |
| 8 | `CashWithdrawalController.js` | `offset` de `req.query` en delete vs `req.body` en create. | Corregido |
| 9 | `SaleController.js` | Bucles con `await` por ítem/venta (N+1). | Corregido |
| 10 | `SaleController.js` (getMostSold) | Podía generar la clave `"undefined"` y lanzar CastError 500. | Corregido |
| 11 | `ProductRoutes.js` | `reponer` sin `admin` (el README indica solo admin). | Corregido |
| 12 | `ProductForm.jsx` | Filas de variantes con talle vacío descartadas en silencio. | Corregido |
| 13 | `ProductController.js` vs `ProductForm.jsx` | `updateProduct` ignoraba `variants[].cantidad`. | Corregido |
| 14 | `Products.jsx` (confirmRetirar) | Sin guard de doble submit. | Corregido |
| 15 | `Products.jsx` (devolución inline) | Sin validar stock/tope ni mostrar `diferencia`. | Corregido (unificado con ReturnForm) |
| 16 | `Products.jsx` | `fetchData` sin secuencia/abort; errores tragados. | Corregido |
| 17 | `ErrorReport` | Endpoint público sin sanitizar logs controlados por el cliente. | Corregido (saneado de control chars y topes) |
| 18 | `pushService.js` | Rechazos de push descartados sin log. | Corregido |
| 19 | `AuthMiddleware.js` | Catch global respondía 401 ante caída de MongoDB. | Corregido (503) |

**Otras correcciones altas:**

- Filtros por variante en devoluciones/cambios y en `deleteReturn`; si la variante no existe al
  eliminar una devolución, responde 409 con mensaje claro en vez de corromper stock.
- `getMostSold` ignora ítems sin producto válido.
- `createSale` y `deleteSale` cargan productos en una sola consulta (`$in`) y guardan una vez por producto.
- `ensureTicketNumbers` hace un `countDocuments` previo y no recorre nada si no hay pendientes.
- `ErrorMiddleware`: `body/query` solo se loguean en desarrollo; CastError con mensaje genérico en
  producción; errores de conexión Mongo responden 503.
- `AuthMiddleware`: `jwt.verify` con `algorithms: ['HS256']`; los fallos de base van a `next(error)`.

## Medios (selección) — corregidos

- UI ya no pide `empleado`, `cerradoPor`, `realizadoPor` ni `realizadoNombre`: se muestran en solo
  lectura desde la sesión (el backend siempre los derivó del token).
- Guard de doble submit en Notifications, Login, retirar stock y cierres.
- Race conditions: `seqRef` en Products, Sales (retiros/efectivo), Depósito (productos/movimientos),
  Notifications (polling) y Tickets ya lo tenía.
- Contextos memoizados (`AlertProvider`, `CartContext`, `NotificationContext`) y callbacks estables.
- `LectorContext`: solo dispara el escáner con ráfaga "de máquina" (≤35 ms) y códigos de 6+ caracteres.
- Redondeo a 2 decimales en totales del carrito; `formatMoney` con `maximumFractionDigits: 2`.
- `formatDateShort` ya no corre la fecha por zona horaria (strings `YYYY-MM-DD`).
- `ErrorReport` público saneado; `stack` limitado a 4000; sin caracteres de control.
- `IosModal` con `role="dialog"`, `aria-modal`, foco inicial, focus trap, Escape solo para el modal
  superior y manejo correcto del `overflow` con modales apilados.
- `document.write` reemplazado por impresión vía iframe (`utils/printHtml.js`) para tickets y etiquetas.
- `vite.config.js`: sin sourcemaps en producción (ya no se publica el código fuente).
- `AuthContext`: sin mutación de refs durante el render.
- `PushPermissionBanner`: permite re-suscribirse si el permiso está concedido pero la suscripción se perdió.
- `Suppliers`, `Returns` y `Deposito`: manejo de errores consistente y estados de carga/error excluyentes.
- `StockMovement`: valida ObjectId, enum de tipo y fechas; índice compuesto `{ tipo, createdAt }`.
- Paginación opt-in con límites por defecto en productos (1000), devoluciones (500) y movimientos (100).

## Bajos / código muerto — corregido

- Eliminados: 9 iconos sin uso, `IosLabel/IosCardGroup/IosRow`, `money.redondear`, `ProductModel.talles`,
  default export de `PushController`, guard inalcanzable de `axios`, `data.total` muerto de Tickets.
- `errorReporter`: decodifica base64url correctamente y el `Map` de dedupe tiene tope.
- `objectId` de Zod ahora exige 24 hex (antes aceptaba strings de 12).
- Contraseñas de ejemplo bloqueadas en producción (arranque abortado con mensaje claro).
- Helpers deduplicados: backend `utils/fechas.js` y `utils/variantes.js`; frontend `utils/format.js`,
  `utils/printHtml.js` y `utils/apiBase.js`.
- `express-rate-limit`: `max` → `limit`.
- Código preparado para Express 5 (`app.use('/api', ...)` y fallback sin `app.get('*')`).
- `cerrarConError` ya no registra listeners duplicados de `logger`.

## Deprecaciones / riesgos de upgrade

| Ubicación | Riesgo | Estado |
|---|---|---|
| `index.js` | `max` deprecado en express-rate-limit 8. | Corregido |
| `AuthSchema.js`, `SupplierSchema.js` | `z.string().email()` deprecado en Zod 4. | Pendiente (se documenta; requiere subir Zod) |
| `index.js` | Patrones incompatibles con Express 5. | Preparado |
| `printLabel.js`, `Ticket.jsx` | `document.write`. | Corregido |
| `index.html` | Meta `apple-mobile-web-app-capable` deprecado. | Corregido (se agregó `mobile-web-app-capable`) |
| Tailwind 3 / react-router-dom 7 | Migraciones mayores pendientes. | Documentado |
| `backend/.env` | Secretos reales en disco sincronizado por OneDrive. | Pendiente de decisión (rotar) |
| `tokenVersion` | No hay endpoint que lo incremente (no hay revocación manual). | Documentado |
| Índices de Product (`nombre` text, `categoria`) | No se usan por los `$regex i`; quitarlos del schema no los borra de la DB. | Documentado |
| `NotificationController.marcar-vistas-admin` | Limpia `nuevaParaAdmin` globalmente, no por admin. | Documentado |

## Tests y verificación

- `npm test` (backend): 21 tests con `node:test` para `money`, `fechas`, `variantes` y `ticketUtils`.
- `npm run lint` (frontend): 0 errores; warnings preexistentes de fast-refresh y `exhaustive-deps`.
- `npm run build` (frontend): OK.
- Smoke test: `node index.js` conecta a MongoDB y `/api/health` responde `{"status":"OK"}`.
- Se probó el manejo de `EADDRINUSE` (el puerto ya estaba en uso por el dev server) y respondió con el
  mensaje accionable esperado.

## Pendientes recomendados (no aplicados)

1. Rotar los secretos de `backend/.env` (Mongo, JWT, MAIL, VAPID) si la carpeta se compartió.
2. Migrar Zod 3 → 4 y Tailwind 3 → 4 en una iteración dedicada.
3. Soft-delete con auditoría en Sale/Return/DailyClose.
4. Refactor estructural de `Sales.jsx` (1375 líneas) y `Products.jsx` (1061 líneas) en hooks/tablas.
5. Tests de integración de API (hoy solo hay unitarios de helpers puros).
6. PWA: versión del payload del service worker y re-registro con reintento.

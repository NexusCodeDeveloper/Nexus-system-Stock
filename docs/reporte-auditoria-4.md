# Reporte de auditoría 4 — Nexus System Stock

**Fecha:** 2026-09-24
**Alcance:** backend completo, frontend completo, scripts, configuración y CI.
**Estado:** correcciones aplicadas por fases (0 a 5), verificadas con tests, lint y build.

---

## Por qué hubo una auditoría 4

La auditoría 3 (16-09) describía un código que dejó de existir: entre el 19-09 y el 20-09 se
hicieron **43 commits** (rename total a español sobre 136 archivos, módulo Empleados, roles,
avisos dirigidos a un empleado). Esa feature nueva nunca pasó por revisión, y la propia auditoría
3 había dejado 9 pendientes explícitos que no se hicieron. Esta auditoría encontró, además, bugs
de segunda capa (carreras, lógica duplicada, integridad de plata) que la anterior no cubría.

---

## Fase 0 — Red de seguridad

- `npm test` estaba roto en la máquina local: faltaba `mongodb-memory-server` (devDependency).
  Causa raíz: el script `setup` raíz instalaba el backend sin `--include=dev`. Corregido.
- En Windows, los tests de integración necesitan el Visual C++ Redistributable 2015-2022 x64
  (`vcruntime140_1.dll`). Documentado en el README.
- Resultado: **75 tests de backend en verde** (antes el archivo de integración ni cargaba).

## Fase 1 — Integridad de plata

| Corrección | Archivo |
|---|---|
| Cierre de caja atómico y reanudable (`abierto → cerrando → cerrado`); ventas/retiros bloqueados durante el cierre | `VentaController.cerrarCaja` |
| Borrar ventas/retiros/devoluciones serializado con el cierre en curso (`verificarOperacionNoEnCierre`) | `CierresUtils`, `VentaController`, `RetiroCajaController`, `DevolucionController` |
| Tope de retiros **por caja** (no por día/zona horaria); contador con auto-reparación; eliminar el cierre lo limpia | `RetiroCajaController`, `RetiroCajaDiaModel` |
| `efectivoEsperado` persistido en el cierre (el frontend ya no lo recalcula mal) | `CierreCajaModel`, `VentaController`, `Ventas.jsx` |
| Reparto de centavos exacto: la última cuota absorbe el remanente | `TicketUtils` |
| Migración de ventas legacy netea `cantidadDevuelta` | `VentaController.migrarArticulosVenta` |
| Cierres legacy sin `turno` ya no permiten doble cierre del día | `filtroCierreDia` |
| `turno` obligatorio, `cajaEsDeHoy` normalizado y con offset guardado | `CierreCajaModel`, `CajaUtils` |
| `reenviarMailCierre` rechaza cajas abiertas; reabrir limpia `hasta` | `VentaController` |
| Script de auditoría de datos actualizado a los contadores por caja | `scripts/auditoria-datos.js` |

## Fase 2 — Devoluciones y cambios unificados

- **`DevolucionService.js` (nuevo)**: una sola lógica para devolver y cambiar. Los controllers
  quedaron finos (de ~360 a ~57 líneas el de devoluciones; `intercambiarProducto` dejó de duplicar
  ~300 líneas).
- Bugs corregidos: líneas duplicadas en el ticket (antes se borraban todas), eliminar una devolución
  revendida (antes recortaba el stock a 0 en silencio), cambio de otro día con diferencia ≤ 0 (antes
  no registraba la venta del producto entregado), snapshot de pagos en líneas completas/parciales,
  `metodo` leído antes de vaciar los pagos y `subtotal = precio × cantidad` coherente.

## Fase 3 — Seguridad y sesiones

- Push: endpoint validado (HTTPS + allowlist de servicios reales, `PUSH_ALLOWED_HOSTS`), timeout de
  10 s, suscripciones borradas al desactivar/eliminar usuario, limpieza de huérfanas al arrancar,
  avisos dirigidos solo al `usuarioId` (sin admins ni homónimos), desuscribir solo lo propio.
- `POST /api/auth/logout` revoca el token al instante (`versionToken`); `/auth/me` ya no lo expone.
- `.env` + `.env.production` con merge (antes el parcial tapaba al general) y `NODE_ENV` validado.
- Credenciales iniciales validadas; si el admin no se puede crear, el servidor no arranca.
- `TRUST_PROXY` configurable; `ALLOWED_ORIGINS` no acepta `*`.
- Logs: se redactan `auth`, `password`, `cookie`, `subscription`; el reporte de errores del navegador
  ya no puede falsificar "quién" y sanitiza el stack; `ErrorMiddleware` no filtra mensajes internos
  de parseo en producción.
- Frontend: la suscripción push se reasocia al usuario que inicia sesión y se da de baja al cerrar.

## Fase 4 — Frontend (bugs funcionales)

- Race del 401: un token viejo ya no borra el token recién emitido.
- `CajaContext`: un error de red ya no se interpreta como "sin caja"; "Ver en historial" navega a la
  pestaña Cierres; borrar el cierre refresca el estado de la caja.
- Ventas: sin datos viejos bajo filtros nuevos, "Retirar Efectivo" bloqueado con caja de día anterior,
  control del disponible verificado, período deseleccionado al editar fechas.
- Productos: alerta de stock **por variante**, stagger limitado, error sin duplicar, aviso del tope
  de 1000, key compuesta en el carrito, escáner cerrado antes del alta rápida.
- Depósito: export CSV completo (hasta 500) con fecha local, "Cargar más" sin loop, búsqueda que
  resetea el límite, toast cuando no hay cambios, refresco por push.
- Formularios: variantes sin color visibles y editables; búsqueda de producto de cambio server-side;
  inputs de montos sin aceptar `.`; banners que ya no tapan "Confirmar Venta"; avisos con
  destinatario inactivo/eliminado bloqueados; confirmación al promover a admin; historial de
  devoluciones muestra el producto entregado.

## Fase 5 — Estructura y prevención

- **`useApi`** (`frontend/src/hooks/useApi.js`): centraliza loading/error/cancelación/reintento.
  Se eliminaron los `SeqRef` manuales y los `catch` silenciosos en Productos, Depósito, Ventas,
  Tickets, Notificaciones, Devoluciones, Empleados y Proveedores.
- **`useDropdownAnclado`**: el posicionamiento del menú de acciones estaba duplicado en Productos y
  Depósito (7-8 refs por página).
- **`utils/productos.js`**: `depositoTotal`, `salonTotal`, `variantLabel`, `variantShortLabel`,
  `tieneStockBajo` y `LIMITE_PRODUCTOS` compartidos (antes duplicados).
- **`RetiroModal.jsx`**: el modal de retiros salió de `Ventas.jsx` con su propia lógica.
- **`marcar-vistas-admin` por admin**: `vistosPor[]` en el modelo; el "nuevo" ya no se borra para
  todos cuando el primer admin abre la pantalla.
- **Retry de errores transitorios** (`TransaccionesUtils.conReintentos`) aplicado a devoluciones,
  cambios y su reversión (los flujos con más conflictos tras la Fase 1).
- **Ticket legacy con descuento**: no se imprime SUBTOTAL/DESCUENTO cuando no hay `articulos[]`
  (antes `SUBTOTAL − DESCUENTO ≠ TOTAL`).
- **Tests de frontend (Vitest)**: 10 tests de helpers (`formatMoney`, `formatDateShort`, totales y
  stock por variante). El primer test encontró un bug real: `formatMoney('texto')` devolvía `$NaN`.
- CI ahora corre también los tests del frontend.

---

## Decisiones registradas

- **JWT en `localStorage`**: evaluado y descartado por ahora. No hay `dangerouslySetInnerHTML` ni
  `innerHTML` en el frontend, las plantillas de impresión escapan HTML, la CSP de `helmet` en
  producción es `script-src 'self'` y la Fase 3 agregó revocación en el servidor. Migrar a cookie
  `httpOnly` implica CSRF + CORS con credenciales + revisión de PWA/beacon: más riesgo que beneficio
  para este sistema. **Revisar si** se agregan scripts de terceros, HTML de usuarios, o el frontend
  pasa a otro dominio.
- **Colección legacy `retirosCajaDias`**: queda en la base pero ya no se usa; el script de auditoría
  la reporta como legacy. Los contadores nuevos viven en `retirosCajaContadores`.
- **Escrituras durante un cierre**: se bloquean con 409 y el frontend pide reintentar; con
  `conReintentos` los flujos de devolución/cambio se resuelven solos.

## Pendientes recomendados (no aplicados)

1. Dividir el JSX de las pestañas de `Ventas.jsx`, `Productos.jsx` y `Deposito.jsx` en componentes
   (los hooks ya se extrajeron; las páginas siguen en ~1.100 líneas cada una).
2. `actualizarNotificacion`: si cambia el destinatario no re-notifica ni resetea el estado.
3. Devoluciones: paginación y filtros en el historial (hoy tope 500).
4. Reponer el retry transitorio en los flujos de venta/cierre (hoy solo devoluciones/cambios).
5. Soft-delete con auditoría en Venta/Devolución/Cierre.
6. Migrar Zod 3 → 4 y Tailwind 3 → 4 en una iteración dedicada.
7. Rate limit con store compartido si se escala a varias instancias.
8. Snapshot "antes/después" de stock en `MovimientoStock`.

## Fix posterior — crash de HMR en desarrollo (2026-09-24)

Con la app abierta en el navegador mientras se editaban archivos, Vite recargaba módulos en
caliente y el contexto de autenticación quedaba duplicado: `useAutenticacion()` devolvía `undefined`
y `App` crasheaba con "Algo salió mal" (16 errores registrados desde el navegador). No era un bug
del backend ni de las credenciales: se verificó contra la base que la clave del `.env` coincide.

Corrección:

- Los contextos se separaron en módulos que solo exportan `createContext` + hook
  (`autenticacionContexto.js`, `themeContexto.js`, `lectorContexto.js`, `cajaContexto.js`,
  `carritoContexto.js`, `notificacionContexto.js`, `alerts/alertContexto.js`) y el stack de modales
  en `ui/iosModalStack.js`. Los providers quedaron en sus `.jsx` exportando solo componentes, así
  Fast Refresh ya no recrea los contextos.
- `App` muestra un aviso de "Recargá la página" si el contexto llegara `undefined`, en lugar de
  romper toda la app.
- Los warnings de Fast Refresh de oxlint bajaron de 13 a 2 (queda `Ticket.jsx`, que exporta
  `printTicket` junto al componente; la duplicación de esa función es inofensiva en HMR).
- Un residuo de ese split (`modalStack` referenciado en `IosModal.jsx` después de mover el stack a
  `iosModalStack.js`) crasheaba la app al cerrar cualquier modal. Se corrigió con el helper
  `modalStackVacio()` y un test de regresión del stack.
- Para detectar esta clase de bug (identificadores colgados tras un refactor) se activó
  `no-undef: error` con `env.browser` en `frontend/.oxlintrc.json`; la CI ahora falla si queda una
  referencia indefinida.
- `AutenticacionContext` reintenta una vez `/auth/me` ante errores de red/5xx y avisa al usuario en
  vez de dejar la pantalla de login sin explicación.

## Regla para que no vuelva a ocurrir

1. **Cada bug entra con un test** (backend o frontend) que falla antes y pasa después.
2. **Una sola fuente de verdad por número o regla**: totales de caja, efectivo esperado, devoluciones.
3. **Toda feature nueva pasa el checklist**: permisos por rol, push, tests, README/reportes.
4. **La CI corre lint, tests (backend + frontend), chequeo de sintaxis y build en cada push.**
5. Los cambios de contrato (endpoints, campos, estados) se documentan en el README en el mismo PR.

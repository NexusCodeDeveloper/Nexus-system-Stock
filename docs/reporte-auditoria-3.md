# Reporte de auditoría 3 — Nexus System Stock

**Fecha:** 2026-09-16
**Alcance:** backend completo, frontend completo, scripts de migración, CI/Render y módulo Depósito.
**Estado:** correcciones aplicadas (fases 1–4) y verificadas con lint, build y tests.

---

## Resumen ejecutivo

Tercera auditoría completa del sistema. Se detectaron **5 problemas críticos**, varios altos de
integridad de stock/reportes y decenas de mejoras posibles. Se corrigieron todos los críticos, los
altos de integridad y las mejoras priorizadas del módulo Depósito, además de carreras y ajustes de
accesibilidad.

Verificación: `npm test` (backend) 28 tests OK, `npm run lint` (frontend) 0 errores,
`npm run build` (frontend) OK y `node --check` de todos los archivos del backend OK.

---

## Críticos corregidos

| # | Ubicación | Problema | Corrección |
|---|---|---|---|
| 1 | `Notifications.jsx` | `setCompleteName('')` inexistente rompía "Marcar como realizado" con ReferenceError. | Se eliminó la llamada. |
| 2 | `CartContext.jsx` | Al fusionar ítems, una cantidad editada (string) se concatenaba: `"2" + 1 = "21"`. | Conversión numérica antes de sumar + chequeos de stock en Products. |
| 3 | `ProductRoutes.js` | "Pasar al salón" visible a empleados pero el endpoint exigía admin (403), contra el README. | Se quitó el middleware `admin` de `POST /:id/reponer`. |
| 4 | `ReturnForm.jsx` | La diferencia del cambio ignoraba el descuento del ticket (el backend sí lo aplica). | Se aplica `1 - descuento/100` en el cálculo de la UI. |
| 5 | `migrar-tickets.js` | Podía regenerar tickets `T-XXXXXXXX` ya válidos e impresos. | Solo regenera los que no cumplen el formato y marca los válidos. |

## Altos corregidos

| # | Ubicación | Problema | Corrección |
|---|---|---|---|
| 6 | `emailService.js` | El mail de cierre listaba mercadería de ventas totalmente devueltas. | `buildItemsVenta` excluye ventas con `estado = 'devuelta'`. |
| 7 | `ErrorMiddleware.js` | `WriteConflict` de Mongo (código 112) devolvía 500 genérico. | Se mapea a 409 con mensaje accionable y log descriptivo. |
| 8 | `ProductController.js` / `ProductSchema.js` | Editar/renombrar/quitar variantes con stock perdía unidades en silencio y se permitían duplicados. | Se rechazan duplicados (talle+color) y el borrado/renombrado con stock (409). |
| 9 | `ProductController.js` | Las ediciones de depósito desde Editar no registraban movimientos. | `updateProduct` usa transacción y registra `ajuste_deposito`/`ingreso_deposito` por delta. |
| 10 | `ReturnForm.jsx` | No se podía cambiar por el mismo producto (otro talle/color). | Se permite y se valida stock considerando la devolución. |
| 11 | `NotificationController.js` | Completar un aviso era check-then-save: pisaba datos y duplicaba push. | `findOneAndUpdate` atómico con filtro `estado != realizado`. |
| 12 | `CashWithdrawalController.js` | Al borrar un retiro no se verificaba el decremento del contador diario. | Si el contador no coincide responde 409; si no existe, registra un warning. |
| 13 | `SaleController.js` | Doble cierre de caja concurrente reenviaba el mail. | Se crea el cierre con `create()` y el índice único corta la carrera (400). |
| 14 | `PushController.js` / `pushService.js` | `unsubscribe` borraba por endpoint sin verificar dueño. | Se filtra por `userId` (con tolerancia a suscripciones viejas). |
| 15 | `apiError.js` | Los detalles de validación de Zod nunca se mostraban. | Se prioriza `errors[0].mensaje`. |
| 16 | `LectorContext.jsx` | El lector hacía `preventDefault` en campos editables y no limpiaba el buffer. | No previene el default en inputs y limpia con Backspace/Tab/Escape. |

## Módulo Depósito — mejoras aplicadas

- **Reponer stock** permite crear una **variante nueva** (talle/color) sin salir del modal.
- **Fijar cantidad (inventario)** en Reponer stock (API `modo: 'fijar'`), con vista previa del delta.
- **Pasar todo al salón** por producto (todas las variantes) con confirmación.
- **Movimientos**: filtros por tipo, fechas y producto, paginación ("cargar más") y **export CSV**.
- Tabla de Depósito con **valorizado del depósito**, badges de **stock bajo/agotado** y aviso cuando
  el listado se corta en 1000 productos.
- **Etiquetas**: se recuerdan formato, medida, cantidad y opciones de QR/precio.
- **Backend de movimientos**: nuevos parámetros `buscar` (producto) y `offset`.

## Otros arreglos

- Carrito: no se permiten montos divididos en $0.
- `IosModal`: el efecto de la pila ya no depende de `onClose` inline (Escape cierra el modal correcto).
- Toasts apilables (antes se superponían) y con `role="status"`.
- `PushPermissionBanner`: el permiso `default` ya no se muestra como "bloqueado".
- `Returns`: diferencia `undefined` y productos eliminados se muestran correctamente.
- `Products`: se informa si falla la alerta de stock bajo y se refresca stock/alertas con push de
  ventas y devoluciones.
- `Sales`: se informa si falla la consulta de efectivo disponible.
- `printHtml`: resuelve `false` si la impresión falla o el iframe no carga (con timeout).
- `ScannerModal`: se resetea el último código al abrir (antes ignoraba el primero).
- `NotificationContext`: el contador de tareas realizadas ya no se corta en 3.
- `WelcomeOverlay`: se muestra una vez por sesión del navegador (antes una vez por dispositivo).
- `IosForm`: campos asociados con `aria-labelledby`; botón de acciones de Products con `aria-label`.
- Ticket impreso: encabezado "NEXUSCODE" consistente con la vista en pantalla.
- `updateProduct` ahora es transaccional (rollback ante error).

## Pendientes recomendados (no aplicados)

1. Rotar secretos de `backend/.env` si la carpeta se compartió.
2. Retry automático ante `WriteConflict` (hoy solo se informa 409).
3. Migrar Zod 3 → 4 y Tailwind 3 → 4 en una iteración dedicada.
4. Soft-delete con auditoría en Sale/Return/DailyClose.
5. Refactor estructural de `Sales.jsx` y `Products.jsx` en hooks/tablas.
6. Tests de integración de API (hoy unitarios de helpers y schemas).
7. Snapshot "antes/después" de stock en `StockMovement` para historial más rico.
8. `tokenVersion` sin endpoint de revocación manual.
9. `marcar-vistas-admin` limpia `nuevaParaAdmin` globalmente, no por admin.

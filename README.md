# NexusCode Stock

Sistema de gestión de stock, ventas, devoluciones, cierre de caja y notificaciones push.

- **Backend:** Node.js 20.19+ / Express 4 / MongoDB (Mongoose) / JWT
- **Frontend:** React 19 / Vite / Tailwind
- **Deploy:** Render (`render.yaml`)

## Requisitos

- Node.js >= 20.19.0 (probado con 22)
- Una base MongoDB (Atlas recomendado, requiere replica set para transacciones)

## Puesta en marcha (local)

```bash
npm run setup          # instala dependencias de backend y frontend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# completar backend/.env (MONGO_URI, JWT_SECRET de 32+ chars, etc.)
npm run dev            # backend (nodemon, puerto 5000) + frontend (Vite, puerto 5173)
```

- API: http://localhost:5000/api · Health: http://localhost:5000/api/health
- Frontend: http://localhost:5173

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Levanta backend y frontend juntos |
| `npm run build` | Compila el frontend en `frontend/dist` |
| `npm start` | Arranca el backend (sirve `frontend/dist` si `NODE_ENV=production`) |
| `npm run lint` | Lint del frontend (oxlint) |
| `npm test` | Tests del backend (node:test) |
| `npm run migrate:money` | Dry-run de la migración de montos a centavos |
| `npm run migrate:money:apply --prefix backend` | Aplica la migración (hace backup antes) |

## Migración de montos a centavos

Los montos se guardan en la base como **enteros en centavos** y la API los expone como
decimales (getters de Mongoose). La migración ya fue aplicada a la base de desarrollo.

- Script: `backend/scripts/migrate-money.js`
- Dry-run: `npm run migrate:money --prefix backend`
- Aplicar: `npm run migrate:money:apply --prefix backend` (requiere confirmación implícita del flag)
- Antes de aplicar, el script guarda un backup JSON en `backend/backups/`
- Es idempotente: usa el marcador `migrations._id = "money-cents-v1"`

## Deploy en Render

- Build: `npm ci --prefix backend --omit=dev && npm ci --prefix frontend --include=dev && npm run build`
- Start: `npm start`
- Variables obligatorias: `MONGO_URI`, `JWT_SECRET` (32+), `ALLOWED_ORIGINS`,
  `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `EMPLEADO_EMAIL`, `EMPLEADO_PASSWORD`
- VAPID: si se dejan `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` vacías, el push se desactiva
  sin errores. Si se cargan, deben ser claves válidas (`npx web-push generate-vapid-keys`).

## Logging y captura de errores

El backend usa **Winston**. En desarrollo escribe en la consola (legible, con colores) y en
`backend/logs/error.log` (rotación 5 MB × 5). En producción escribe JSON a stdout, visible en
el dashboard de Render (Logs).

- `LOG_LEVEL`: `debug` (default en dev) | `info` | `warn` | `error`.
- Cada request lleva `X-Request-Id` (visible en DevTools → Network) y aparece en los logs como
  `requestId=...`, para reconstruir todo lo que pasó con una sola búsqueda.
- Los errores del navegador se envían a `POST /api/errors` y se ven en la misma consola del
  backend con `origen=frontend`. Se pueden desactivar con `VITE_ERROR_REPORTING=false`.

Cómo ver los logs en desarrollo:

- En la terminal donde corrés `npm run dev`: cada línea viene etiquetada `[backend]` o `[frontend]`.
- Archivo en vivo (Git Bash): `tail -f backend/logs/error.log`
- Archivo en vivo (PowerShell): `Get-Content backend\logs\error.log -Wait -Tail 50`
- Buscar un request puntual: `grep "requestId-a-buscar" backend/logs/error.log`

En producción (Render): Dashboard → servicio → **Logs**; buscar por `ERROR`, por ruta o por `requestId`.

Ejemplo de error en desarrollo:

```
[ERROR] 21:45:12
   La base de datos no soporta transacciones
   Motivo       La operación requiere un replica set de MongoDB.
   Detalle      Transaction numbers are only allowed on a replica set member or mongos
   Petición     POST /api/sales
   Código       500
   Dónde        SaleController.js:77:5 → createSale
   Seguimiento  petición 3f2b9c1a
   Quién        admin@nexus.com (admin)
   Qué revisar  Usá un clúster de MongoDB Atlas (replica set) o revisá MONGO_URI.
```

Peticiones normales (en una línea): `[OK] 21:39:01 · GET /api/sales → 200 · 45 ms · quién=admin@nexus.com · petición 3f2b9c1a`

En producción los logs salen como JSON con claves en español (`fecha`, `nivel`, `mensaje`, `motivo`,
`peticion`, `codigo`, `donde`, `queRevisar`…) para poder filtrarlos en Render.

## Depósito y salón

Todo el stock entra al depósito y desde ahí se carga el salón:

- **Nuevo Producto** (en `/deposito`, solo admin): crea el producto con su stock inicial en el
  **depósito** (por talle/color si tiene variantes).
- **Editar** (menú de acciones en Depósito, solo admin): edita los datos del producto y su stock del
  **depósito**. El salón no se toca desde acá. Los ajustes de depósito quedan registrados en
  **Movimientos** y no se pueden quitar ni renombrar variantes con stock (se rechaza con un aviso).
- **Reponer stock** (menú de acciones del producto en Depósito, solo admin): suma mercadería nueva al
  depósito. Permite **crear una variante nueva** (talle/color) y usar **Fijar cantidad** para dejar el
  depósito en un valor exacto (inventario físico).
- **Pasar al salón** (menú de acciones en Depósito, admin y empleado): pasa stock del depósito al
  salón, que es de donde descuentan las ventas. **Pasar todo al salón** pasa todas las variantes de una
  sola vez.
- **Eliminar** (menú de acciones en Depósito, solo admin).
- Desde Productos, el admin puede **Retirar a depósito** (pasar stock del salón al depósito).
- Si el salón se queda sin stock, la venta se bloquea y el aviso indica cuántas unidades hay en
  depósito. La alerta de stock bajo de Productos muestra el disponible en depósito ("Dep: N").
- La tabla de Depósito muestra el **valorizado del depósito**, avisos de **stock bajo/agotado** en
  salón y, si el catálogo supera los 1000 productos, un aviso para usar la búsqueda.
- Cada movimiento queda registrado en la pestaña **Movimientos** del depósito (producto, variante,
  cantidad, tipo, quién y cuándo), con filtros por tipo, fecha y producto, paginación y **export CSV**.
- Endpoints: `PUT /api/products/:id/deposito` (admin), `POST /api/products/:id/reponer` (admin y
  empleado), `POST /api/products/:id/retirar` (admin) y `GET /api/stock-movements` (admin).

## Códigos de barras y QR

Cada producto tiene un **código interno** único (`NC-000001`) que se genera automáticamente al crearlo y no se puede editar.

- **Código automático:** al abrir "Nuevo Producto" el código ya aparece generado y en solo lectura; no se puede
  escribir, escanear ni cambiar después. El servidor garantiza que no existan dos códigos iguales.
- **Pistola lectora:** funciona en toda la app (Productos, Tickets, Devoluciones y formularios); detecta la
  ráfaga de tecleo + Enter. Si tu pistola no envía Enter, configurá el sufijo en el lector.
- **Cámara del celular:** botón de cámara junto al buscador de Productos y en el carrito.
  Requiere HTTPS (Render ya lo cumple); por IP local `http://192.168.x.x` el navegador bloquea la cámara.
- **Escanear para vender:** con productos en el carrito, escanear agrega directo (si el producto
  tiene variantes, se abre el selector). En mobile, abrí el carrito con el botón "Carrito" y usá
  "Escanear" para agregar en serie.
- **Tickets:** el ticket impreso incluye un QR con el número y el código de barras Code-128 de cada
  producto. En Tickets podés buscar por número de ticket o escanear el código de un producto para ver
  las ventas que lo contienen y hacer la devolución o el cambio.
- **Devolución/cambio desde Productos:** la acción "Devolver" o "Cambiar" del menú del producto pide
  elegir el ticket de la venta y abre el formulario de devolución completo (valida stock, muestra la
  diferencia y el método de pago). Las devoluciones sin ticket ya no modifican ventas existentes.
- **Número de ticket:** se genera solo, como código aleatorio único `T-XXXXXXXX` (letras y números, sin
  caracteres ambiguos). Antes de asignarlo el servidor verifica que no exista y el índice único de la
  base impide cualquier repetición. Para regenerar los tickets viejos: `npm run migrate:tickets`
  (dry-run) y `npm run migrate:tickets:apply` (aplica, con backup).
- **Etiquetas:** desde el menú de acciones del producto en Depósito elegís el formato, la medida y la
  cantidad (1–100):
  - **Etiqueta:** una por página con la medida elegida (60×40 por defecto; ideal para rollo troquelado
    de tiquetera). Medidas: 60×40, 58×40, 50×30, 40×30 o personalizada.
  - **Hoja A4 (grilla):** acomoda las etiquetas por hoja según la medida (60×40 → 21 por hoja; 50×30 →
    36) y salta de página automáticamente; con guías de corte opcionales.
  Las etiquetas llevan siempre el Code-128 y el nombre; el QR y el precio se pueden activar o
  desactivar con los interruptores "Mostrar QR" y "Mostrar precio". En el diálogo de impresión
  conviene usar márgenes en 0, escala 100% y sin encabezados.

Endpoints: `GET /api/products/codigo/:codigo` (buscar por código) y `GET /api/products/siguiente-codigo`
(admin; lo usa el formulario para mostrar el código al crear).

## Carrito y sidebar

- **Sidebar colapsado:** en desktop el menú queda como barra de íconos (72 px) y se expande al pasar
  el mouse (260 px), superponiéndose al contenido.
- **Carrito a la derecha:** mientras hay productos en el carrito, aparece un panel de venta a la
  derecha con el checkout completo (items, empleado, descuento, pago, total y Confirmar Venta). Se
  ve en todas las páginas y desaparece al vaciar el carrito.
- **Mobile:** el carrito se sigue abriendo como modal desde el botón "Carrito" de Salón.
- El estado del carrito es global (`CartContext`), así que la venta no se pierde al cambiar de página.

## Documentación

- `docs/reporte-auditoria.md`: auditoría completa, crash original, correcciones y pendientes.
- `docs/reporte-auditoria-2.md`: segunda auditoría (críticos de integridad, correcciones fases 1–4,
  tests y pendientes de upgrade).

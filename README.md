# API_HINDRAX

Backend REST para sincronizar Hindrax SS por internet. La app movil puede enviar cambios de tareas, inventario y dispositivos a este servicio, y otros dispositivos pueden descargar solamente lo actualizado usando `updatedAfter`.

## Ejecutar local

```bash
cd API_HINDRAX
npm install
cp .env.example .env
API_TOKEN=dev-token npm run dev
```

El servicio queda en `http://localhost:8787`.

## Seguridad

Todos los endpoints `/api/v1/*` requieren:

```http
Authorization: Bearer <API_TOKEN>
```

Para publicar este backend en internet cambia `API_TOKEN` por un valor largo y privado. No uses el token de ejemplo.

## Endpoints

- `GET /` y `GET /health`: estado publico del servidor.
- `GET /api/v1/status`: estado protegido de la API. Responde `status: "online"` aunque la persistencia remota este pendiente.
- `GET /api/v1/tasks?updatedAfter=0`: lista tareas modificadas despues del cursor.
- `PUT /api/v1/tasks/:id`: crea o reemplaza una tarea por id.
- `POST /api/v1/tasks/sync`: sincroniza varias tareas.
- `GET /api/v1/inventory?updatedAfter=0`: lista inventario modificado despues del cursor.
- `PUT /api/v1/inventory/:id`: crea o reemplaza un item de inventario por id.
- `POST /api/v1/inventory/sync`: sincroniza varios items.
- `POST /api/v1/bootstrap`: sube toda la data local de un dispositivo en una sola llamada.
- `GET /api/v1/devices`: lista dispositivos registrados.
- `POST /api/v1/devices/heartbeat`: registra presencia, nickname y version de app.

## Ejemplo de sincronizacion de tareas

```bash
curl -X POST http://localhost:8787/api/v1/tasks/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "task-001",
        "deviceId": "tablet-bodega",
        "title": "Comprar tomate",
        "status": "open",
        "quantity": 4,
        "unit": "kg",
        "updatedAt": 1000
      }
    ]
  }'
```

Luego otro dispositivo puede pedir:

```bash
curl "http://localhost:8787/api/v1/tasks?updatedAfter=999" \
  -H "Authorization: Bearer dev-token"
```

## Modelo de conflicto

La API usa `updatedAt` como cursor y aplica estrategia `last-write-wins`: si dos dispositivos actualizan el mismo `id`, gana el registro con `updatedAt` mas reciente. Esto mantiene simple la sincronizacion inicial y permite integrar la app movil rapido.

## Colecciones Firestore

Firestore usa estas colecciones principales:

```text
tasks
inventory
devices
```

No necesitas crearlas manualmente. Firestore las crea cuando la API escribe el primer documento, siempre que la cuenta de servicio tenga permisos.

### `tasks`

Documento por tarea. ID recomendado:

```text
<deviceId>-task-<localTaskId>
```

Campos principales:

```json
{
  "id": "HNDX-xxxx-task-1",
  "deviceId": "HNDX-xxxx",
  "title": "Comprar tomate",
  "description": "",
  "status": "PENDIENTE",
  "type": "GENERAL",
  "scheduledTime": 1779550000000,
  "locationName": "Bodega",
  "latitude": -33.44,
  "longitude": -70.66,
  "quantity": 4,
  "unit": "kg",
  "inventoryItemId": 1,
  "assignedPeerId": "HNDX-yyyy",
  "checklist": [],
  "deleted": false,
  "updatedAt": 1779550000000
}
```

### `inventory`

Documento por item de inventario. ID recomendado:

```text
<deviceId>-inventory-<localInventoryId>
```

Campos principales:

```json
{
  "id": "HNDX-xxxx-inventory-1",
  "deviceId": "HNDX-xxxx",
  "name": "Tomate",
  "category": "Verduras",
  "quantity": 18,
  "minQuantity": 2,
  "unit": "kg",
  "updatedAt": 1779550000000
}
```

### `devices`

Documento por dispositivo. ID recomendado:

```text
<deviceId>
```

Campos principales:

```json
{
  "id": "HNDX-xxxx",
  "deviceId": "HNDX-xxxx",
  "nickname": "Tablet bodega",
  "appVersion": "1.30",
  "updatedAt": 1779550000000
}
```

## Subida inicial de datos locales

En el release de migracion, cada dispositivo que ya tenga datos locales debe ejecutar una subida inicial completa contra `POST /api/v1/bootstrap`. Despues de eso puede seguir usando los endpoints `/tasks/sync`, `/inventory/sync` y `/devices/heartbeat` para subir cambios nuevos constantemente.

```bash
curl -X POST http://localhost:8787/api/v1/bootstrap \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "device": {
      "deviceId": "tablet-bodega",
      "nickname": "Tablet bodega",
      "appVersion": "2.0.0",
      "updatedAt": 4000
    },
    "tasks": [
      {
        "id": "task-001",
        "deviceId": "tablet-bodega",
        "title": "Tarea local existente",
        "status": "open",
        "updatedAt": 4100
      }
    ],
    "inventory": [
      {
        "id": "inv-tomate",
        "deviceId": "tablet-bodega",
        "name": "Tomate",
        "quantity": 18,
        "unit": "kg",
        "updatedAt": 4200
      }
    ]
  }'
```

La respuesta incluye `summary.received` y `summary.stored` por coleccion. Si un registro ya existe con un `updatedAt` mas nuevo, no se sobrescribe y aparece como recibido pero no guardado.

## Persistencia

Por defecto en desarrollo guarda datos en `./data/hindrax.json`. Puedes cambiarlo con:

```bash
DATA_FILE=/var/lib/api-hindrax/hindrax.json npm run dev
```

En produccion usa una persistencia remota: Firestore con `FIREBASE_SERVICE_ACCOUNT_JSON` o Postgres con `DATABASE_URL`. En Vercel esto es obligatorio porque las funciones serverless no conservan archivos locales entre ejecuciones.

## Despliegue

Variables minimas:

```bash
PORT=8787
API_TOKEN=<token-largo-y-privado>
DATA_FILE=/var/lib/api-hindrax/hindrax.json
JSON_BODY_LIMIT=10mb
CORS_ORIGIN=*
DATABASE_URL=<postgres-url>
PGSSLMODE=require
FIREBASE_PROJECT_ID=hindrax
FIREBASE_SERVICE_ACCOUNT_JSON=<service-account-json>
```

Si defines `DATABASE_URL`, el backend usa Postgres. Si no hay `DATABASE_URL` y existen credenciales de Firebase, usa Firestore.

Para produccion usa HTTPS detras de Nginx, Caddy, Cloudflare Tunnel o el proxy del proveedor donde lo despliegues.

## Despliegue en Vercel

Este directorio esta preparado para desplegarse como proyecto aparte:

```bash
cd API_HINDRAX
vercel
```

En Vercel configura estas variables de entorno:

- `API_TOKEN`: token privado para la app movil.
- `FIREBASE_PROJECT_ID`: id del proyecto Firebase, por ejemplo `hindrax`.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON completo de la cuenta de servicio con acceso a Firestore.
- `DATABASE_URL`: opcional, URL de Postgres si decides usar Postgres en vez de Firestore.
- `PGSSLMODE=require`: usa SSL para el proveedor de base de datos si usas Postgres.
- `CORS_ORIGIN=*`: permite llamadas desde la app movil.

El archivo `vercel.json` enruta todo hacia `api/index.js`, que exporta la app Express como funcion serverless.

Despues del despliegue valida:

```bash
curl https://<tu-proyecto>.vercel.app/health
curl https://<tu-proyecto>.vercel.app/api/v1/tasks \
  -H "Authorization: Bearer <API_TOKEN>"
```

La URL base que debe usar Android sera:

```text
https://<tu-proyecto>.vercel.app
```

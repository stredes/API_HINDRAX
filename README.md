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

- `GET /health`: estado publico del servidor.
- `GET /api/v1/tasks?updatedAfter=0`: lista tareas modificadas despues del cursor.
- `PUT /api/v1/tasks/:id`: crea o reemplaza una tarea por id.
- `POST /api/v1/tasks/sync`: sincroniza varias tareas.
- `GET /api/v1/inventory?updatedAfter=0`: lista inventario modificado despues del cursor.
- `PUT /api/v1/inventory/:id`: crea o reemplaza un item de inventario por id.
- `POST /api/v1/inventory/sync`: sincroniza varios items.
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

## Persistencia

Por defecto en desarrollo guarda datos en `./data/hindrax.json`. Puedes cambiarlo con:

```bash
DATA_FILE=/var/lib/api-hindrax/hindrax.json npm run dev
```

En produccion usa Postgres con `DATABASE_URL`. En Vercel esto es obligatorio porque las funciones serverless no conservan archivos locales entre ejecuciones.

## Despliegue

Variables minimas:

```bash
PORT=8787
API_TOKEN=<token-largo-y-privado>
DATA_FILE=/var/lib/api-hindrax/hindrax.json
CORS_ORIGIN=*
DATABASE_URL=<postgres-url>
PGSSLMODE=require
```

Para produccion usa HTTPS detras de Nginx, Caddy, Cloudflare Tunnel o el proxy del proveedor donde lo despliegues.

## Despliegue en Vercel

Este directorio esta preparado para desplegarse como proyecto aparte:

```bash
cd API_HINDRAX
vercel
```

En Vercel configura estas variables de entorno:

- `API_TOKEN`: token privado para la app movil.
- `DATABASE_URL`: URL de Postgres.
- `PGSSLMODE=require`: usa SSL para el proveedor de base de datos.
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

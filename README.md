# Telemetry Web Frontend

Frontend del panel de monitoreo de flotas desarrollado con Angular 21, Standalone Components, PrimeNG, Leaflet y SignalR.

La aplicación consume telemetría desde un backend y muestra la ubicación de los vehículos en un mapa interactivo, además de una tabla con estado, última posición y acciones de administración como eliminación.

## Respuesta a la pregunta

La solución consiste en un frontend Angular para monitorear flotas en tiempo real, visualizar la ubicación GPS de cada vehículo en un mapa, consultar su estado actual y recibir actualizaciones en vivo mediante SignalR. Además, incluye una experiencia de eliminación con confirmación para mantener el panel coherente y actualizado.

## Pregunta y respuesta de consistencia de caché y base de datos

### Pregunta

Si en un sistema real existiera tanto un caché (Redis) como una base de datos persistente, ¿qué deberías garantizar al eliminar un vehículo para evitar inconsistencias entre ambos?

### Respuesta

Deberías garantizar que la eliminación del vehículo sea coherente y consistente en ambas capas. Esto significa que, después de borrar el vehículo, ni Redis ni la base de datos persistente deben seguir mostrando el vehículo como si todavía existiera. En la práctica, eso implica eliminar o invalidar el registro en la base de datos y también borrar, invalidar o actualizar la entrada correspondiente en Redis, para evitar que una lectura posterior reutilice un dato desactualizado del caché.

La idea principal es asegurar que el estado final del sistema sea el mismo en ambas fuentes de datos y que ninguna de ellas quede con información contradictoria.

## ¿Qué hace esta app?

- Muestra un mapa geográfico con marcadores por vehículo.
- Consulta el estado actual de los vehículos mediante HTTP.
- Recibe actualizaciones en tiempo real desde un hub SignalR.
- Permite eliminar vehículos desde la tabla con confirmación inline.
- Presenta una interfaz moderna con Tailwind + PrimeNG.

## Stack principal

- Angular 21
- Standalone Components
- RxJS
- SignalR client (`@microsoft/signalr`)
- Leaflet para mapas
- PrimeNG para componentes de UI
- Tailwind CSS para estilos
- Angular SSR

## Requisitos previos

Antes de correr la app, asegúrate de tener instalado:

- Node.js
- npm
- Un backend corriendo en `http://localhost:5136`

Este frontend está configurado para usar un proxy de desarrollo en `proxy.conf.json`, por lo que en local las rutas `/api` y `/chathub` se reenvían al backend en puerto `5136`.

## Instalación

```bash
npm install
```

## Ejecutar en desarrollo

```bash
npm start
```

O directamente:

```bash
ng serve
```

La aplicación se sirve en:

- `http://localhost:4200`

El servidor de desarrollo usa el proxy configurado en `proxy.conf.json`, por lo que el frontend puede consumir el backend sin problemas de CORS.

## Scripts disponibles

```bash
npm start
```
Inicia el servidor de desarrollo.

```bash
npm run build
```
Genera la build para producción.

```bash
npm run watch
```
Compila en modo desarrollo y observa cambios.

```bash
npm run test
```
Ejecuta la suite de pruebas del proyecto.

```bash
npm run serve:ssr:telemetry-web
```
Sirve la versión SSR compilada.

## Arquitectura del frontend

### Ruta principal

La app tiene una sola ruta principal en:

- `src/app/app.routes.ts`

La pantalla principal se carga de forma lazy con el componente dashboard.

### Componente principal

El panel central está en:

- `src/app/features/dashboard/dashboard.component.ts`
- `src/app/features/dashboard/dashboard.component.html`

Responsabilidades:

- inicializar el mapa de Leaflet
- cargar y mantener la lista de vehículos
- escuchar actualizaciones en vivo desde SignalR
- mostrar la tabla con estado y acciones
- eliminar vehículos con confirmación 

### Servicios

#### TelemetryService
Archivo:

- `src/app/data/services/telemetry.service.ts`

Funciona como capa HTTP para:

- `GET /api/vehicles`
- `DELETE /api/vehicles/:vehicleId`

#### RealtimeTelemetryService
Archivo:

- `src/app/data/services/realtime-telemetry.service.ts`

Se conecta al hub SignalR en `/chathub` y reenvía eventos como:

- `GPS_INGESTED`
- `VEHICLE_DELETED`

## Flujo de datos

1. El dashboard se inicializa y arranca un polling cada 10 segundos.
2. El servicio HTTP obtiene la lista completa de vehículos.
3. El mapa se actualiza con las posiciones recibidas.
4. El servicio SignalR escucha eventos en tiempo real.
5. Cuando llega un cambio nuevo, el estado del frontend se actualiza y se repinta la UI.
6. Si un vehículo es eliminado, la lista y el mapa se actualizan inmediatamente.

## Mapa y visualización

La visualización geográfica se implementa con Leaflet:

- `src/styles.css` define el contenedor del mapa y el estilo del icono personalizado.
- Los marcadores usan `divIcon` para evitar dependencias de imágenes por defecto.
- Cada marcador muestra el identificador del vehículo.

## Proxy de desarrollo

El archivo de configuración:

- `proxy.conf.json`

redirige:

- `/api` → `http://localhost:5136`
- `/chathub` → `http://localhost:5136` con WebSocket habilitado

Esto evita errores de CORS y permite que el frontend consuma el websocket del backend en local.

## Modelo principal

El tipo del vehículo está definido en:

- `src/app/core/models/telemetry.model.ts`

Representa:

- `vehicleId`
- `lastLat`
- `lastLng`
- `lastSeen`
- `status`

## Estructura del proyecto

```text
src/
├── app/
│   ├── app.config.ts
│   ├── app.routes.ts
│   ├── core/
│   │   └── models/
│   ├── data/
│   │   └── services/
│   └── features/
│       └── dashboard/
├── styles.css
└── main.ts
```

## Notas de desarrollo

- El proyecto usa componentes standalone.
- El dashboard usa `OnPush` change detection, por lo que cualquier actualización observable debe reflejarse correctamente en la vista.
- La capa realtime y la `polling` trabajan en paralelo para ofrecer una experiencia híbrida de actualización.
- El mapa se inicializa una vez que el navegador ya está disponible.

## Buenas prácticas al trabajar en este frontend

- Mantén la lógica de estado en servicios y en el componente dashboard.
- Evita realizar llamadas HTTP directas desde el template.
- Usa logs en consola para diagnosticar integración con SignalR.
- Si modificas el flujo de actualización del mapa, verifica que el render se refresque correctamente después de las mutaciones de datos.

## Build y despliegue

Para generar una build de producción:

```bash
npm run build
```

La salida se generará en la carpeta `dist/`.

Si se desea servir la versión SSR compilada, usar:

```bash
npm run serve:ssr:telemetry-web
```

## Troubleshooting frecuente

### El backend no responde

Verifica que el servicio API del backend esté corriendo en `localhost:5136`.

### El mapa no carga

Confirma que Leaflet está instalado y que el contenedor del mapa exista en el template.

### El websocket no conecta

Revisa que:

- `proxy.conf.json` esté presente
- el backend exponga el hub en `/chathub`
- el frontend se esté sirviendo con `ng serve`

### La UI no se refresca después de eliminar

El dashboard usa `OnPush`; si haces cambios de estado, debes asegurar que el cambio se dispare con una actualización explícita del detector de cambios.

## Créditos

Proyecto frontend para monitoreo de flotas y telemetría GPS en tiempo real.


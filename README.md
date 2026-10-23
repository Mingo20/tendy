# Tendy — Tu agente personal de IA

Tendy es un agente de IA con identidad propia que vive en tu dispositivo como PWA
instalable. La interfaz es solo la cara visible: el motor de Tendy es un Superagent
de Base44 con acceso a navegador, búsquedas web, correo, calendario, GitHub, apps
y archivos del dueño, configurado con un workflow que responde cada mensaje.

## Uso

- **Aplicación:** https://mingo20.github.io/tendy/
- **PIN de acceso (por defecto):** `tendy2026` (configurable como secreto `TENDY_PIN`)
- Instálala desde el menú de tu navegador ("Añadir a pantalla de inicio").

## Cómo funciona

```
[ Interfaz PWA ]  →POST→  [ Función tendyApi ]  →registro→  [ Entidad TendyRecord ]
     GitHub Pages            Base44 Functions                (msg_user)
                                                                   │
                                                                   ▼ trigger
                                                    [ Workflow "Tendy — responder mensaje" ]
                                                                   │
                                                                   ▼
                                                          [ Agente (Superagent) ]
                                                    responde como Tendy, usa sus
                                                    herramientas y guarda msg_tendy
                                                                   │
     [ Interfaz hace polling del historial ] ←────────────────────┘
```

1. La app se autentica con PIN y guarda mensajes en `TendyRecord` (`kind: msg_user`).
2. El workflow se dispara con cada mensaje nuevo y despierta al agente.
3. El agente lee la configuración del usuario (nombre, tono, instrucciones),
   usa sus herramientas (búsqueda, navegador, correos, etc.) y guarda la
   respuesta (`kind: msg_tendy`).
4. La interfaz muestra la respuesta con el avatar de Tendy animado.

## Configuración de Tendy

Desde ⚙️ dentro de la app: cómo debe llamarte, su tono
(cercano / profesional / creativo / directo) e instrucciones personalizadas.

## Estructura

- `index.html`, `css/`, `js/` — la PWA (vanilla, sin dependencias).
- `tendyApi-reference.ts` — copia de referencia de la función desplegada en Base44.

## Limitaciones honestas

- Tendy puede hacer todo lo que el agente puede: buscar, navegar, leer/escribir
  correos, calendario, GitHub, generar imágenes, etc. Las compras con pago real y
  otras acciones delicadas requieren aprobación humana.
- El agente nunca pretende ser un abogado ni da asesoría legal.


## Tendy Studio

La interfaz ahora incluye un espacio de proyectos para crear aplicaciones mediante conversación. Cada solicitud suficientemente clara puede crear un `TendyProject`, generar `TendyTask` con skills y mantener estados persistentes.

- API de orquestación: `https://superagent-573efe2c.base44.app/functions/tendyStudioApi`
- Entidades: `TendyProject`, `TendyTask`, `TendySkill`, `TendyArtifact`
- Skills iniciales: requirements, architecture, uiux, frontend, backend, data, integrations, github, qa, debugging, deployment, maintenance, visuals, security y docs.
- El workflow `Tendy — responder mensaje` coordina el chat y crea planes de proyecto reales.
- La app publicada usa sesiones anónimas para esta primera versión. Para producción multiusuario hay que activar autenticación Base44 y reforzar RLS antes de manejar datos privados.

## Actualización v3

- Barra de progreso por fases observables y botón Cancelar para detener el seguimiento local del turno.
- Tarjeta de actividad dinámica.
- IndexedDB para caché de conversaciones y cola offline con sincronización al recuperar conexión.
- Adjuntos de imágenes y archivos compatibles de hasta 2 MB por archivo.
- Menú inferior con proyectos, historial, nueva conversación, configuración, archivos, actividad y ayuda.
- Skill obligatoria PWA + instalación + IndexedDB para los proyectos nuevos.

Limitación conocida: el workflow de Base44 despierta al agente mediante una actividad LLM y no expone WebSocket ni cancelación nativa. La interfaz muestra fases estimadas explícitas y el botón Cancelar detiene el polling y permite una nueva solicitud; no puede interrumpir una ejecución del servidor que ya comenzó.

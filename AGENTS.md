# AGENTS.md · Tendy

Guía para agentes de IA y para personas que necesiten modificar este proyecto. Léela completa antes de tocar el código.

## Contexto

- **Organización:** DGTech (República Dominicana). Fundador: Domingo Guerra.
- **Proyecto:** Tendy · versión actual **2.0.0** · estado **Producción**.
- **Repositorio:** `Mingo20/tendy`
- **Aplicación en vivo:** https://mingo20.github.io/tendy/
- **Hub del ecosistema:** https://mingo20.github.io/dtech/
- **Idioma de la interfaz y de las respuestas:** español dominicano.

## Qué resuelve

Un asistente útil debe poder actuar, no solo conversar, y debe estar siempre a mano.

## Resumen técnico

**Tipo:** PWA + Superagent Base44

La PWA envía el mensaje a tendyGlm, que lo guarda, consulta GLM y guarda la respuesta como msg_tendy. La app lee las respuestas de la misma entidad.

**Stack**

- HTML, CSS y JavaScript sin frameworks
- Service Worker (tendy-v6)
- Funciones Base44: tendyGlm y tendyStudioApi
- Modelo GLM de Z.ai (BigModel)

**Backend**

- tendyGlm
- tendyStudioApi
- tendyApi (referencia)

**Datos**

- TendyRecord (msg_user, msg_tendy)

## Reglas que no se pueden romper

- El PIN de acceso es un secreto (TENDY_PIN) y NO debe publicarse en el repositorio
- Si no hay clave GLM el mensaje se guarda y la app lo informa

## Datos sensibles

Conversaciones privadas del usuario.

## Cómo trabajar aquí

1. Lee el README y este archivo. Luego abre el código que vayas a cambiar.
2. Haz el cambio más pequeño que resuelva el problema. No reescribas lo que funciona.
3. Prueba en el navegador antes de dar algo por terminado: abre la aplicación, recorre el flujo afectado y revisa la consola.
4. Si la app tiene Service Worker, **sube el número de la caché** al cambiar archivos, o los usuarios seguirán viendo la versión vieja.
5. Registra cada cambio en `CHANGELOG.md` con la versión, la fecha y una línea clara.
6. Sube la versión según la regla: *mayor* si rompes algo, *menor* si añades una función, *parche* si corriges un error.

## Reglas de seguridad

- **Nunca** escribas contraseñas, tokens, claves de API ni PIN en el código, en los README ni en los mensajes de commit. Este repositorio es público.
- Las claves van como secretos del backend. En el navegador solo puede haber datos públicos.
- Si encuentras una credencial expuesta, avisa al dueño y recomienda rotarla antes de seguir.
- No borres datos de producción sin confirmación explícita del dueño.

## Pendientes conocidos

- Cambiar el PIN por defecto que estuvo publicado en el README
- Reemplazar el token fijo open-access por sesiones reales

## Estilo

- Textos para el usuario en español dominicano, claros y cordiales.
- Horas en formato de 12 horas (9:45 p. m.). Fechas con el mes en letras.
- Diseño limpio, rápido y pensado primero para el celular.

## Contacto

Domingo Guerra · DGTech · WhatsApp 829-646-9885

<div align="center">

<img src="https://raw.githubusercontent.com/Mingo20/dtech/main/assets/brand/dg-logo-512.png" width="84" alt="DGTech" />

# Tendy

**Agente personal de IA con identidad propia y avatar interactivo. Navega, busca, redacta y gestiona por ti desde el celular o la PC.**

![Versión](https://img.shields.io/badge/versión-2.0.0-FF6A13?style=flat-square) ![Estado](https://img.shields.io/badge/estado-Producción-2EA44F?style=flat-square) ![Tipo](https://img.shields.io/badge/tipo-PWA_%2B_Superagent_Base44-0B2545?style=flat-square) ![DGTech](https://img.shields.io/badge/by-DGTech-FF6A13?style=flat-square)

[**Abrir la aplicación**](https://mingo20.github.io/tendy/) · [Hub DGTech](https://mingo20.github.io/dtech/) · [Guía para agentes](AGENTS.md) · [Cambios](CHANGELOG.md)

<img src="https://raw.githubusercontent.com/Mingo20/dtech/main/assets/shots/tendy.jpg" alt="Tendy" width="720" />

</div>

## El problema

Un asistente útil debe poder actuar, no solo conversar, y debe estar siempre a mano.

## Qué hace

- Chat con avatar interactivo
- Respuestas con el modelo GLM (Z.ai) vía tendyGlm
- Acceso protegido por PIN
- Instalable como PWA
- El motor es un Superagent con navegador, búsqueda, correo, calendario y GitHub

## Cómo está construido

**Tipo:** PWA + Superagent Base44

La PWA envía el mensaje a tendyGlm, que lo guarda, consulta GLM y guarda la respuesta como msg_tendy. La app lee las respuestas de la misma entidad.

**Tecnologías**

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

## Datos sensibles

Conversaciones privadas del usuario.

## Reglas del proyecto

- El PIN de acceso es un secreto (TENDY_PIN) y NO debe publicarse en el repositorio
- Si no hay clave GLM el mensaje se guarda y la app lo informa

## Pendientes conocidos

- Cambiar el PIN por defecto que estuvo publicado en el README
- Reemplazar el token fijo open-access por sesiones reales

## Estructura del repositorio

Consulta [AGENTS.md](AGENTS.md) para el mapa de archivos y las instrucciones de trabajo.

## Parte de DGTech

Este proyecto forma parte del ecosistema **DGTech**, un estudio de software dominicano que construye aplicaciones instalables para resolver problemas reales. Todas las aplicaciones están en [https://mingo20.github.io/dtech/](https://mingo20.github.io/dtech/).

---

<sub>© 2026 DGTech · Domingo Guerra · Todos los derechos reservados. Consulta el archivo NOTICE.</sub>

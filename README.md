<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">
  <b>Classroom & Tasks Sync API</b><br>
  Un backend progresivo basado en <a href="http://nodejs.org" target="_blank">Node.js</a> y <a href="https://nestjs.com" target="_blank">NestJS</a> integrado con <a href="https://convex.dev" target="_blank">Convex Database</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
  <a href="https://swagger.io/" target="_blank"><img src="https://img.shields.io/badge/OpenAPI-Swagger-85EA2D.svg?logo=swagger&logoColor=black" alt="Swagger OpenAPI" /></a>
  <a href="https://convex.dev" target="_blank"><img src="https://img.shields.io/badge/Database-Convex-FF4F00.svg" alt="Convex DB" /></a>
</p>

---

## 📚 Descripción

API RESTful desarrollada en **NestJS** e integrada con **Convex Database** y la **Google Classroom API**. Permite la sincronización en tiempo real de tareas escolares, la priorización inteligente y automática mediante un algoritmo de puntaje de importancia (`importanceScore`) y la gestión del estado y la prioridad de las tareas por usuario.

---

## 🚀 Características Principales

* **Sincronización con Google Classroom:** Importación automática de asignaciones y entregas del alumno.
* **Multiusuario & Aislamiento:** Verificación de identidad mediante Google OAuth 2.0; cada usuario gestiona únicamente sus datos (`userId`).
* **Cálculo de Importancia en Tiempo Real:** Algoritmo dinámico en Convex que asigna un valor (0-100) según prioridad, fecha de vencimiento y antigüedad.
* **Actualizaciones Parciales (PATCH):** Modificación de estado o prioridad con recálculo automático del score.
* **Documentación Interactiva:** OpenAPI / Swagger integrado para pruebas rápidas.

---

## 🛠️ Requisitos Previos

Asegúrate de tener instalado en tu sistema:

* **Node.js** (v18.x o superior)
* **npm** (v9.x o superior)
* Una cuenta en **Google Cloud Console** con las API de Google Classroom activadas.
* Una cuenta en **Convex** (`npx convex dev` creará tu entorno de desarrollo automáticamente).

---

## 📦 Instalación y Configuración

### 1. Clonar el repositorio e instalar dependencias

```bash
$ git clone <https://github.com/t1b0ne/api-pleno.git>
$cd pleno$ npm install
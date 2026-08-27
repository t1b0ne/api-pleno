---
description: Analiza una tarea seleccionada, estima su complejidad y recomienda prioridad y estado usando el perfil del usuario.
---

# Análisis académico de tareas

Usa este procedimiento después de ejecutar `analyze_task`.

## 1. Complejidad

Clasifica la tarea como `easy`, `medium` o `hard` considerando:

- Cantidad de pasos.
- Conocimientos requeridos.
- Ambigüedad de las instrucciones.
- Tiempo estimado.
- Distancia entre la tarea y la experiencia del usuario.

No confundas una fecha cercana con complejidad. La fecha afecta la urgencia.

## 2. Urgencia

- Vencida: crítica.
- Vence en 24 horas: muy alta.
- Vence en 3 días: alta.
- Vence en 7 días: media.
- Más de 7 días: normal.
- Sin fecha: indeterminada; pregunta si es importante.

## 3. Prioridad recomendada

Combina complejidad, urgencia, prioridad actual y relación con los objetivos del usuario.

- `high`: urgente, bloqueante, compleja o muy relevante para un objetivo.
- `medium`: importante, pero puede planificarse.
- `low`: poco urgente, sencilla o de bajo impacto.

No sobrescribas automáticamente la prioridad actual. Indica si la recomendación
es distinta y por qué.

## 4. Estado recomendado

- `todo`: no hay evidencia de avance.
- `in_progress`: el usuario indicó que comenzó o la tarea requiere trabajo activo.
- `completed`: únicamente si el usuario confirma que terminó.

## 5. Respuesta

Devuelve siempre:

- `complexity`.
- `urgency`.
- `recommendedPriority`.
- `recommendedStatus`.
- `estimatedMinutes`.
- `confidence` entre 0 y 1.
- `reasoning` breve.
- `questions` si falta información.

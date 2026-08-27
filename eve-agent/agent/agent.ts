import { defineAgent } from "eve";
import { novaModel } from "./lib/models.js";

export default defineAgent({
  description: "Asistente académico que analiza una tarea seleccionada y recomienda su prioridad.",
  model: novaModel,
  reasoning: "medium",
});

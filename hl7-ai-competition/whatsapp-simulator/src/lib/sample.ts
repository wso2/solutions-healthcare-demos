import type { Questionnaire } from "@/lib/questionnaire";

export const sampleQuestionnaire: Questionnaire = {
  title: "Daily heart check-in",
  description: "A quick check-in from your care team. It takes about a minute.",
  questions: [
    {
      id: "chest_pain",
      text: "Have you had any chest pain today?",
      type: "boolean",
      required: true,
    },
    {
      id: "breathlessness",
      text: "How would you rate your breathlessness today?",
      type: "choice",
      options: ["None", "Mild", "Moderate", "Severe"],
      required: true,
    },
    {
      id: "weight_kg",
      text: "What is your weight this morning, in kilograms?",
      type: "number",
      required: true,
    },
    {
      id: "notes",
      text: "Anything else you would like your care team to know?",
      type: "text",
    },
  ],
};

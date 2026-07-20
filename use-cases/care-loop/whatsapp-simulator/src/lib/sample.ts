import type { Questionnaire } from "@/lib/questionnaire";

export const sampleQuestionnaire: Questionnaire = {
  title: "Daily heart check-in",
  description: "A quick check-in from your care team. It takes about a minute.",
  questions: [
    {
      id: "chest_pain",
      text: "Have you had any **chest pain** today? If so, what did it feel like?",
    },
    {
      id: "breathlessness",
      text: "How is your breathlessness today — _none_, _mild_, _moderate_, or _severe_?",
    },
    {
      id: "weight_kg",
      text: "What is your weight this morning, in **kg**?",
    },
    {
      id: "notes",
      text: "Anything else you would like your care team to know?",
    },
  ],
};

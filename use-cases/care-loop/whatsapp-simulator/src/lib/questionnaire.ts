import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

const questionSchema = z.object({
  id: nonEmpty,
  text: nonEmpty,
});

export const questionnaireSchema = z.object({
  title: nonEmpty,
  description: z.string().optional(),
  questions: z
    .array(questionSchema)
    .min(1)
    .refine(
      (questions) =>
        new Set(questions.map((q) => q.id)).size === questions.length,
      {
        message: "question ids must be unique",
      },
    ),
});

export type Questionnaire = z.infer<typeof questionnaireSchema>;

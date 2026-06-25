interface Question {
  id: string;
  text: string;
}

export interface Questionnaire {
  title: string;
  description?: string;
  questions: Question[];
}

export function parseQuestionnaire(input: unknown): Questionnaire {
  if (typeof input !== "object" || input === null) {
    throw new Error("questionnaire must be an object");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    throw new Error("questionnaire.title is required");
  }

  if (obj.description !== undefined && typeof obj.description !== "string") {
    throw new Error("questionnaire.description must be a string");
  }

  if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
    throw new Error("questionnaire.questions must be a non-empty array");
  }

  const seen = new Set<string>();
  const questions = obj.questions.map((raw, index) =>
    parseQuestion(raw, index, seen),
  );

  return {
    title: obj.title,
    description: obj.description as string | undefined,
    questions,
  };
}

function parseQuestion(
  raw: unknown,
  index: number,
  seen: Set<string>,
): Question {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`questions[${index}] must be an object`);
  }

  const q = raw as Record<string, unknown>;

  if (typeof q.id !== "string" || q.id.trim() === "") {
    throw new Error(`questions[${index}].id is required`);
  }
  if (seen.has(q.id)) {
    throw new Error(`duplicate question id: ${q.id}`);
  }
  seen.add(q.id);

  if (typeof q.text !== "string" || q.text.trim() === "") {
    throw new Error(`questions[${index}].text is required`);
  }

  return {
    id: q.id,
    text: q.text,
  };
}

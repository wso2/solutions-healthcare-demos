import type { Client } from "fhir-kit-client";
import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
} from "fhir/r4";

import { NextResponse } from "next/server";

import { degradedResponse } from "@/lib/api-degraded";
import { careLoopClient, searchResources } from "@/lib/fhir";

export const runtime = "nodejs";

export interface QuestionnaireResponseAnswer {
  question: string;
  answer: string;
}

export interface QuestionnaireResponseSummary {
  id: string;
  questionnaireRef: string | null;
  questionnaireTitle: string | null;
  questionnaireRaw: Questionnaire | null;
  authored: string | null;
  answers: QuestionnaireResponseAnswer[];
  raw: QuestionnaireResponse;
}

function findTitle(items: QuestionnaireResponseItem[]): string | null {
  const titleItem = items.find((item) => item.linkId === "title");
  return titleItem?.text ?? null;
}

// QuestionnaireResponse.questionnaire is a canonical like "Questionnaire/{id}".
function questionnaireIdFromCanonical(
  canonical: string | undefined,
): string | null {
  if (!canonical) return null;
  const match = /Questionnaire\/([^/|]+)/.exec(canonical);
  return match?.[1] ?? null;
}

function collectQuestionTexts(
  items: QuestionnaireItem[],
  texts: Map<string, string>,
): void {
  for (const item of items) {
    if (item.text) texts.set(item.linkId, item.text);
    if (item.item) collectQuestionTexts(item.item, texts);
  }
}

function stringifyAnswer(
  item: QuestionnaireResponseItem,
): string | undefined {
  const answer = item.answer?.[0];
  if (!answer) return undefined;
  if (answer.valueString !== undefined) return answer.valueString;
  if (answer.valueBoolean !== undefined) return String(answer.valueBoolean);
  if (answer.valueInteger !== undefined) return String(answer.valueInteger);
  return undefined;
}

// care-loop-collector-service populates item.text from the bot's question message; when it's missing, join on linkId against the referenced Questionnaire's item text, then fall back to a short slice of linkId (still a real FHIR field) for any legacy record saved before either was wired through.
function questionLabel(
  item: QuestionnaireResponseItem,
  questionTexts: Map<string, string>,
): string {
  return (
    item.text ??
    questionTexts.get(item.linkId) ??
    `Question ${item.linkId.slice(0, 8)}`
  );
}

function collectAnswers(
  items: QuestionnaireResponseItem[],
  questionTexts: Map<string, string>,
): QuestionnaireResponseAnswer[] {
  const answers: QuestionnaireResponseAnswer[] = [];

  for (const item of items) {
    const answer = stringifyAnswer(item);
    if (answer !== undefined) {
      answers.push({ question: questionLabel(item, questionTexts), answer });
    }
    if (item.item) {
      answers.push(...collectAnswers(item.item, questionTexts));
    }
  }

  return answers;
}

function toQuestionnaireResponseSummary(
  response: QuestionnaireResponse,
  questionnaire: Questionnaire | null,
): QuestionnaireResponseSummary {
  const items = response.item ?? [];
  const questionnaireId = questionnaireIdFromCanonical(response.questionnaire);
  const questionTexts = new Map<string, string>();
  if (questionnaire?.item) collectQuestionTexts(questionnaire.item, questionTexts);

  return {
    id: response.id ?? "",
    questionnaireRef: questionnaireId ? `Questionnaire/${questionnaireId}` : null,
    questionnaireTitle: questionnaire?.title ?? findTitle(items),
    questionnaireRaw: questionnaire,
    authored: response.authored ?? response.meta?.lastUpdated ?? null,
    answers: collectAnswers(items, questionTexts),
    raw: response,
  };
}

async function fetchQuestionnaires(
  client: Client,
  responses: QuestionnaireResponse[],
): Promise<Map<string, Questionnaire>> {
  const ids = [
    ...new Set(
      responses
        .map((response) => questionnaireIdFromCanonical(response.questionnaire))
        .filter((id): id is string => id !== null),
    ),
  ];

  const questionnaires = new Map<string, Questionnaire>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const resource = (await client.read({
          resourceType: "Questionnaire",
          id,
        })) as unknown as Questionnaire;
        questionnaires.set(id, resource);
      } catch (error) {
        console.error(
          `failed to fetch Questionnaire/${id} from care-loop-fhir-server`,
          error,
        );
      }
    }),
  );
  return questionnaires;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const client = careLoopClient();
    const resources = await searchResources<QuestionnaireResponse>(
      client,
      "QuestionnaireResponse",
      { subject: `Patient/${id}`, _sort: "-_lastUpdated", _count: 50 },
    );

    const questionnaires = await fetchQuestionnaires(client, resources);
    const responses = resources.map((resource) =>
      toQuestionnaireResponseSummary(
        resource,
        questionnaires.get(
          questionnaireIdFromCanonical(resource.questionnaire) ?? "",
        ) ?? null,
      ),
    );

    return NextResponse.json({ responses });
  } catch (error) {
    console.error(
      "failed to fetch questionnaire responses from care-loop-fhir-server",
      error,
    );
    return degradedResponse({ responses: [] });
  }
}

import { QuestionnaireChat } from "@/components/questionnaire-chat";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuestionnaireChat id={id} />;
}

import type { Outcome, Phase } from "@/lib/chat";

export function Status({
  phase,
  outcome,
}: {
  phase: Phase;
  outcome: Outcome | null;
}) {
  if (phase === "submitting") {
    return <p className="text-center text-sm text-[#8a8a8e]">Sending...</p>;
  }
  if (phase === "error") {
    return (
      <p className="text-center text-sm text-red-600">
        Something went wrong. Please try again later.
      </p>
    );
  }
  if (outcome && !outcome.delivered) {
    return (
      <p className="text-center text-sm text-amber-600">
        Conversation ended, but the callback could not be reached
        {outcome.deliveryError ? `: ${outcome.deliveryError}` : "."}
      </p>
    );
  }
  return (
    <p className="text-center text-sm text-[#8a8a8e]">
      Conversation ended. Your replies have been sent.
    </p>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-white p-6 text-center text-sm text-[#8a8a8e]">
      {text}
    </div>
  );
}

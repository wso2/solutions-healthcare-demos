import type { Message } from "@/lib/chat";
import { Reply } from "lucide-react";
import Markdown from "react-markdown";

import remarkGfm from "remark-gfm";

import { BOT_INITIALS, BOT_NAME, truncate } from "@/lib/chat";

const MARKDOWN_CLASSES =
  "break-words [&_a]:underline [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_p+p]:mt-2 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5";

export function MessageRow({
  message,
  previous,
  canReply,
  onReply,
  large = false,
}: {
  message: Message;
  previous?: Message;
  canReply: boolean;
  onReply: () => void;
  large?: boolean;
}) {
  const me = message.role === "user";
  const senderChanged = !previous || previous.role !== message.role;
  const showAvatar = !me && senderChanged;
  const textSize = large ? "text-base" : "text-sm";

  return (
    <div
      className="group flex items-start gap-[9px]"
      style={{
        marginTop: senderChanged ? 12 : 2,
        flexDirection: me ? "row-reverse" : "row",
      }}
    >
      <div className="w-7 shrink-0">
        {showAvatar && (
          <div className="flex size-7 items-center justify-center rounded-full bg-[#e4e4e7] text-[11px] font-semibold text-[#52525b]">
            {BOT_INITIALS}
          </div>
        )}
      </div>
      <div
        className="flex min-w-0 flex-col"
        style={{ alignItems: me ? "flex-end" : "flex-start" }}
      >
        {message.replyTo && (
          <div
            className="-mb-1 flex max-w-[min(78vw,440px)] gap-1 overflow-hidden whitespace-nowrap border-l-2 border-[#d4d4d8] px-2.5 pb-2 pt-1 text-xs"
            style={{ marginLeft: me ? 0 : 4, marginRight: me ? 4 : 0 }}
          >
            <span className="font-medium opacity-80">{BOT_NAME}</span>
            <span className="opacity-[0.55]">
              {truncate(message.replyTo.questionText, 52)}
            </span>
          </div>
        )}
        <div
          className="flex items-center gap-[7px]"
          style={{ flexDirection: me ? "row-reverse" : "row" }}
        >
          <div
            className={
              me
                ? `max-w-[min(78vw,440px)] rounded-[13px] rounded-br-[4px] bg-[#0a0a0a] px-3 py-2 ${textSize} leading-normal text-[#fafafa]`
                : `max-w-[min(78vw,440px)] rounded-[13px] rounded-bl-[4px] bg-[#f4f4f5] px-3 py-2 ${textSize} leading-normal text-[#18181b]`
            }
          >
            {me ? (
              <span className="whitespace-pre-wrap break-words">
                {message.text}
              </span>
            ) : (
              <div className={MARKDOWN_CLASSES}>
                <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
              </div>
            )}
          </div>
          {canReply && (
            <button
              type="button"
              onClick={onReply}
              aria-label="Reply"
              className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[#ececed] bg-white text-[#8a8a8e] opacity-0 transition hover:bg-[#f7f7f8] hover:text-[#0a0a0a] group-hover:opacity-100"
            >
              <Reply className="size-3" />
            </button>
          )}
        </div>
        <div className="mt-[3px] px-[3px] text-[11px] text-[#a1a1aa]">
          {message.time}
        </div>
      </div>
    </div>
  );
}

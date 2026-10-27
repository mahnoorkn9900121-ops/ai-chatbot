import { memo, useEffect, useState } from "react";
import type { ChatAttachment, ChatMessage } from "../types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  AlertCircle,
  Bookmark,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Pencil,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";

interface MessageItemProps {
  message: ChatMessage;
  streamingContent?: string;
  isStreamingThisMessage: boolean;
  isBusy: boolean;
  onEditMessage: (
    messageId: string,
    newContent: string,
    regenerate: boolean
  ) => void;
  onToggleBookmark: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onRegenerateFromMessage: (messageId: string) => void;
}

function stripMarkdownForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function AttachmentDisplay({ attachments }: { attachments: ChatAttachment[] }) {
  const [lightboxImage, setLightboxImage] = useState<ChatAttachment | null>(null);
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxImage]);

  return (
    <>
      <div className="mb-2.5 flex max-w-full flex-wrap justify-end gap-2">
        {attachments.map((att) => {
          if (att.kind === "image" && att.dataUrl) {
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => setLightboxImage(att)}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                title={`View ${att.name}`}
              >
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  referrerPolicy="no-referrer"
                  className="max-h-44 max-w-[210px] object-cover sm:max-h-52 sm:max-w-[260px]"
                />
              </button>
            );
          }

          const isExpanded = expandedTextId === att.id;
          return (
            <div
              key={att.id}
              className="w-full max-w-full overflow-hidden rounded-xl border border-zinc-200/90 bg-white text-left text-xs sm:max-w-md dark:border-zinc-700 dark:bg-zinc-900"
            >
              <button
                type="button"
                onClick={() => setExpandedTextId(isExpanded ? null : att.id)}
                className="flex min-h-[40px] w-full items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                    {att.name}
                  </span>
                  {att.sizeLabel && (
                    <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">
                      · {att.sizeLabel}
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                )}
              </button>
              {isExpanded && att.textContent && (
                <pre className="max-h-48 max-w-full overflow-auto border-t border-zinc-200/80 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  {att.textContent}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {lightboxImage && lightboxImage.dataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImage.dataUrl}
            alt={lightboxImage.name}
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[86dvh] max-w-[94vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  streamingContent,
  isStreamingThisMessage,
  isBusy,
  onEditMessage,
  onToggleBookmark,
  onDeleteMessage,
  onRegenerateFromMessage,
}: MessageItemProps) {
  const effectiveContent =
    isStreamingThisMessage && streamingContent !== undefined
      ? streamingContent
      : message.content;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isUser = message.role === "user";

  useEffect(() => {
    return () => {
      if (isSpeaking && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSpeaking]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleToggleSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = stripMarkdownForSpeech(message.content);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleStartEdit = () => {
    setConfirmDelete(false);
    setDraft(message.content);
    setIsEditing(true);
  };

  const handleSaveOnly = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onEditMessage(message.id, trimmed, false);
    setIsEditing(false);
  };

  const handleSaveAndRegenerate = () => {
    const trimmed = draft.trim();
    if (!trimmed || isBusy) return;
    onEditMessage(message.id, trimmed, true);
    setIsEditing(false);
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isEditing) {
    return (
      <div className="mx-auto w-full py-3">
        <div className="rounded-2xl border border-zinc-300 bg-white p-3.5 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {isUser ? "Edit your message" : "Edit assistant response"}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setIsEditing(false);
              } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (isUser) handleSaveAndRegenerate();
                else handleSaveOnly();
              }
            }}
            className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-base leading-relaxed text-zinc-900 focus:border-zinc-400 focus:outline-none sm:rounded-lg sm:text-[15px] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-600"
          />
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 sm:min-h-0 sm:rounded-lg dark:text-zinc-300 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOnly}
              disabled={!draft.trim()}
              className="min-h-[40px] rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-40 sm:min-h-0 sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 whitespace-nowrap shrink-0"
            >
              {isUser ? "Save Only" : "Save Changes"}
            </button>
            {isUser && (
              <button
                type="button"
                onClick={handleSaveAndRegenerate}
                disabled={!draft.trim() || isBusy}
                className="min-h-[40px] rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 sm:min-h-0 sm:rounded-lg dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
              >
                Save &amp; Regenerate
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="group mx-auto flex min-w-0 w-full flex-col items-end py-3">
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentDisplay attachments={message.attachments} />
        )}

        {message.content && (
          <div className="min-w-0 max-w-[90%] rounded-2xl border border-zinc-200/80 bg-zinc-100 px-3.5 py-2.5 text-[15px] leading-relaxed text-zinc-900 sm:max-w-[78%] sm:px-4 sm:py-3 dark:border-zinc-800 dark:bg-zinc-800/90 dark:text-zinc-100">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {message.content}
            </p>
          </div>
        )}

        {/* Metadata & CRUD Actions */}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 px-0.5 sm:mt-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
            <span>{formattedTime}</span>
            {message.updatedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>Edited</span>
              </>
            )}
          </div>

          <div
            className={`flex items-center gap-0.5 transition-opacity ${
              message.bookmarked
                ? "opacity-100"
                : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Copy message"
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onToggleBookmark(message.id)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-zinc-200/70 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 ${
                message.bookmarked
                  ? "text-teal-700 dark:text-teal-400"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
              title={message.bookmarked ? "Remove bookmark" : "Save message"}
              aria-label={message.bookmarked ? "Remove bookmark" : "Save message"}
            >
              <Bookmark
                className={`h-3.5 w-3.5 ${message.bookmarked ? "fill-current" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={handleStartEdit}
              disabled={isBusy}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 disabled:opacity-40 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Edit message"
              aria-label="Edit message"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1 pl-1">
                <button
                  type="button"
                  onClick={() => onDeleteMessage(message.id)}
                  className="min-h-[32px] rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 sm:min-h-0 sm:py-0.5 dark:text-red-400 dark:hover:bg-red-950/40 whitespace-nowrap shrink-0"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[32px] rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-200/60 sm:min-h-0 sm:py-0.5 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isBusy}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-red-950/40 dark:hover:text-red-400"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Model / Assistant Message
  return (
    <div className="group mx-auto flex min-w-0 w-full gap-2.5 py-3.5 sm:gap-3.5 sm:py-4">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 sm:h-7 sm:w-7 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        {message.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-800 sm:p-3.5 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Unable to complete response</p>
                <p className="mt-1 text-xs leading-relaxed text-red-700 [overflow-wrap:anywhere] dark:text-red-300">
                  {message.content}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRegenerateFromMessage(message.id)}
                    disabled={isBusy}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:min-h-0 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retry response</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteMessage(message.id)}
                    disabled={isBusy}
                    className="min-h-[36px] rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 sm:min-h-0 dark:text-red-300 dark:hover:bg-red-900/40 whitespace-nowrap shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : isStreamingThisMessage && effectiveContent.length === 0 ? (
          <div
            className="space-y-2.5 py-1.5"
            aria-live="polite"
            aria-label="Generating response"
          >
            <div className="h-3.5 w-40 max-w-full rounded bg-zinc-200/80 sm:w-48 dark:bg-zinc-800" />
            <div className="h-3.5 w-60 max-w-full rounded bg-zinc-200/60 sm:w-72 dark:bg-zinc-800/70" />
          </div>
        ) : (
          <MarkdownRenderer content={effectiveContent} />
        )}

        {/* Assistant Action Footer */}
        {!isStreamingThisMessage && !message.isError && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
              <span>{formattedTime}</span>
              {message.updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Edited</span>
                </>
              )}
            </div>

            <div
              className={`flex items-center gap-0.5 transition-opacity ${
                message.bookmarked || isSpeaking
                  ? "opacity-100"
                  : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
              }`}
            >
              <button
                type="button"
                onClick={handleCopy}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="Copy response"
                aria-label="Copy response"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggleSpeech}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-zinc-200/70 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 ${
                  isSpeaking
                    ? "text-teal-700 dark:text-teal-400"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
                title={isSpeaking ? "Stop reading aloud" : "Read response aloud"}
                aria-label={
                  isSpeaking ? "Stop reading aloud" : "Read response aloud"
                }
              >
                {isSpeaking ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onToggleBookmark(message.id)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-zinc-200/70 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 ${
                  message.bookmarked
                    ? "text-teal-700 dark:text-teal-400"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
                title={message.bookmarked ? "Remove bookmark" : "Save response"}
                aria-label={
                  message.bookmarked ? "Remove bookmark" : "Save response"
                }
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${message.bookmarked ? "fill-current" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => onRegenerateFromMessage(message.id)}
                disabled={isBusy}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 disabled:opacity-40 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleStartEdit}
                disabled={isBusy}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 disabled:opacity-40 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="Edit response"
                aria-label="Edit response"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={() => onDeleteMessage(message.id)}
                    className="min-h-[32px] rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 sm:min-h-0 sm:py-0.5 dark:text-red-400 dark:hover:bg-red-950/40 whitespace-nowrap shrink-0"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[32px] rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-200/60 sm:min-h-0 sm:py-0.5 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isBusy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  title="Delete response"
                  aria-label="Delete response"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

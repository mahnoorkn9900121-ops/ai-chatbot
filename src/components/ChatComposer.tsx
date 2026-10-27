import { memo, useEffect, useRef, useState } from "react";
import {
  MODEL_OPTIONS,
  type ChatAttachment,
  type ModelId,
  type Persona,
} from "../types/chat";
import { processUploadedFile } from "../lib/storage";
import {
  ArrowUp,
  FileText,
  Mic,
  MicOff,
  Paperclip,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";

interface ChatComposerProps {
  selectedModel: ModelId;
  activePersona: Persona;
  pendingAttachments: ChatAttachment[];
  focusTriggerKey?: string | null;
  onAddAttachments: (items: ChatAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
  onChangeModel: (model: ModelId) => void;
  onOpenPersonaModal: () => void;
  onComposerFocus?: () => void;
  isStreaming: boolean;
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void;
  onStopStreaming: () => void;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const MAX_MESSAGE_LENGTH = 30000;
const MAX_ATTACHMENTS = 4;

export const ChatComposer = memo(function ChatComposer({
  selectedModel,
  activePersona,
  pendingAttachments,
  focusTriggerKey,
  onAddAttachments,
  onRemoveAttachment,
  onClearAttachments,
  onChangeModel,
  onOpenPersonaModal,
  onComposerFocus,
  isStreaming,
  onSendMessage,
  onStopStreaming,
}: ChatComposerProps) {
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches && window.innerWidth >= 1024) {
      textareaRef.current?.focus();
    }
  }, [focusTriggerKey]);

  useEffect(() => {
    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    setSpeechSupported(Boolean(win.SpeechRecognition || win.webkitSpeechRecognition));

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = window.innerWidth < 640 ? 140 : 200;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  const handleFilesSelected = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS - pendingAttachments.length;
    if (remainingSlots <= 0) {
      setValidationError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    setValidationError(null);
    const toProcess = list.slice(0, remainingSlots);
    const processed: ChatAttachment[] = [];

    for (const file of toProcess) {
      try {
        const item = await processUploadedFile(file);
        processed.push(item);
      } catch (err) {
        setValidationError(
          err instanceof Error ? err.message : "Could not attach file."
        );
      }
    }

    if (processed.length > 0) {
      onAddAttachments(processed);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    try {
      const recognition = new RecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || "en-US";

      recognition.onresult = (event) => {
        const lastIdx = event.results.length - 1;
        const transcript = event.results[lastIdx]?.[0]?.transcript?.trim();
        if (transcript) {
          setInput((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
          setValidationError(null);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = () => {
    if (isStreaming) return;

    const trimmed = input.trim();
    if (!trimmed && pendingAttachments.length === 0) {
      setValidationError("Please type a message or attach a file before sending.");
      textareaRef.current?.focus();
      return;
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setValidationError(
        `Message exceeds the ${MAX_MESSAGE_LENGTH.toLocaleString()} character limit.`
      );
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const attachmentsToSend =
      pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;

    setValidationError(null);
    setInput("");
    onClearAttachments();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    onSendMessage(trimmed, attachmentsToSend);
  };

  const canSend = input.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <div className="pb-safe shrink-0 bg-gradient-to-t from-zinc-50 via-zinc-50/95 to-transparent px-3 pt-1.5 sm:px-6 sm:pt-2 sm:pb-4 dark:from-zinc-950 dark:via-zinc-950/95">
      <div className="mx-auto w-full max-w-3xl 2xl:max-w-4xl">
        {validationError && (
          <p
            role="alert"
            className="mb-1.5 px-1 text-xs font-medium text-amber-700 dark:text-amber-400"
          >
            {validationError}
          </p>
        )}

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-xs transition-colors focus-within:border-zinc-400 sm:p-2.5 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-600">
          {/* Attachment Preview Strip */}
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex max-w-full gap-2 overflow-x-auto px-1 pt-0.5 pb-1 sm:flex-wrap sm:overflow-visible">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative flex shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-7 pl-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/80"
                >
                  {att.kind === "image" && att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200/70 object-cover dark:border-zinc-800"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      <FileText className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 max-w-[130px] sm:max-w-[150px]">
                    <div className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                      {att.name}
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                      {att.sizeLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.id)}
                    className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    aria-label={`Remove ${att.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 16px (text-base) on mobile prevents iOS Safari forced viewport zoom on focus */}
          <textarea
            ref={textareaRef}
            value={input}
            onFocus={onComposerFocus}
            onChange={(e) => {
              setInput(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              const pastedImages: File[] = [];
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === "file" && item.type.startsWith("image/")) {
                  const file = item.getAsFile();
                  if (file) pastedImages.push(file);
                }
              }
              if (pastedImages.length > 0) {
                e.preventDefault();
                void handleFilesSelected(pastedImages);
              }
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                // On desktop/hardware keyboards, Enter sends; on mobile virtual keyboards allow Enter to send cleanly as well
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={1}
            enterKeyHint="send"
            placeholder={
              isListening
                ? "Listening... speak now"
                : "Message Lumina Chat..."
            }
            aria-label="Message input"
            className="max-h-[140px] min-h-[40px] w-full resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none sm:max-h-[200px] sm:text-[15px] dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.json,.csv,.tsv,.js,.jsx,.ts,.tsx,.py,.html,.css,.sql,.yaml,.yml,.xml,.sh,.go,.rs,.java,.c,.cpp"
            onChange={(e) => {
              if (e.target.files) {
                void handleFilesSelected(e.target.files);
              }
              e.target.value = "";
            }}
            className="hidden"
          />

          <div className="mt-1 flex items-center justify-between gap-1.5 px-0.5 sm:mt-1.5 sm:gap-2 sm:px-1">
            {/* Left Controls: Attach + Persona + Model Switcher (single-line responsive fit even at 320px) */}
            <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:opacity-40 sm:h-8 sm:w-8 sm:rounded-lg dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 shrink-0"
                title="Attach image or code/text file"
                aria-label="Attach image or text file"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onOpenPersonaModal}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:h-8 sm:rounded-lg dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 whitespace-nowrap shrink-0"
                title={`Active persona: ${activePersona.name}`}
                aria-label={`Change persona (current: ${activePersona.name})`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                <span className="hidden max-w-[96px] truncate min-[400px]:inline sm:max-w-[140px]">
                  {activePersona.name}
                </span>
              </button>

              <div
                role="group"
                aria-label="Select Gemini model"
                className="inline-flex items-center rounded-xl bg-zinc-100 p-0.5 sm:rounded-lg dark:bg-zinc-800/90 shrink-0"
              >
                {MODEL_OPTIONS.map((opt) => {
                  const active = opt.id === selectedModel;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeModel(opt.id)}
                      title={opt.description}
                      className={`min-h-[32px] rounded-lg px-2 py-1 text-[11px] font-medium transition-colors sm:min-h-0 sm:rounded-md sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0 ${
                        active
                          ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-50"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                    >
                      {opt.id === "gemini-3.1-flash-lite" ? "3.1 Lite" : "3.8 Flash"}
                    </button>
                  );
                })}
              </div>

              {input.length > 400 && (
                <span className="hidden text-[11px] text-zinc-400 lg:inline dark:text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
                  {input.length.toLocaleString()} chars
                </span>
              )}
            </div>

            {/* Right Controls: Voice Dictation + Send / Stop */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {speechSupported && !isStreaming && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:h-9 sm:w-9 shrink-0 ${
                    isListening
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  }`}
                  title={isListening ? "Stop voice dictation" : "Dictate message"}
                  aria-label={
                    isListening ? "Stop voice dictation" : "Dictate message"
                  }
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopStreaming}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:h-9 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
                  aria-label="Stop generating response"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 sm:h-9 sm:w-9 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 shrink-0"
                  aria-label="Send message"
                  title="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[11px] text-zinc-400 sm:mt-2 dark:text-zinc-500">
          Saved locally in browser
          <span className="hidden sm:inline">
            {" "}
            · Drop images or code files anywhere · Ctrl+K to search
          </span>
        </p>
      </div>
    </div>
  );
});

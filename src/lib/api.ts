import type { ChatMessage, ModelId } from "../types/chat";

export class ChatApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500) {
    super(message);
    this.name = "ChatApiError";
    this.code = code;
    this.status = status;
  }
}

interface StreamChatOptions {
  messages: Pick<ChatMessage, "role" | "content" | "attachments">[];
  model: ModelId;
  systemInstruction?: string;
  temperature?: number;
  signal?: AbortSignal;
  onChunk: (chunkText: string) => void;
}

function processSseEventBlock(
  rawEvent: string,
  onChunk: (chunkText: string) => void
): boolean {
  const lines = rawEvent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const jsonPart = trimmed.slice(5).trim();
    if (!jsonPart) continue;

    let parsed: {
      type?: string;
      text?: string;
      code?: string;
      message?: string;
    };
    try {
      parsed = JSON.parse(jsonPart);
    } catch {
      continue;
    }

    if (parsed.type === "chunk" && typeof parsed.text === "string") {
      onChunk(parsed.text);
    } else if (parsed.type === "error") {
      throw new ChatApiError(
        parsed.message || "An error occurred while generating the response.",
        parsed.code || "STREAM_ERROR",
        500
      );
    } else if (parsed.type === "done") {
      return true;
    }
  }
  return false;
}

export async function streamChatCompletion({
  messages,
  model,
  systemInstruction,
  temperature,
  signal,
  onChunk,
}: StreamChatOptions): Promise<void> {
  let response: Response;

  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        })),
        model,
        systemInstruction,
        temperature,
      }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ChatApiError(
      "Network connection failed. Please check your internet connection and try again.",
      "NETWORK_ERROR",
      0
    );
  }

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    let errorCode = "API_ERROR";

    try {
      const errJson = (await response.json()) as {
        code?: string;
        message?: string;
      };
      if (errJson.message) errorMessage = errJson.message;
      if (errJson.code) errorCode = errJson.code;
    } catch {
      // Keep default status error message
    }

    throw new ChatApiError(errorMessage, errorCode, response.status);
  }

  if (!response.body) {
    throw new ChatApiError(
      "Streaming is not supported in this browser environment.",
      "NO_STREAM_BODY",
      500
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          processSseEventBlock(buffer, onChunk);
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const finished = processSseEventBlock(rawEvent, onChunk);
        if (finished) return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function requestSmartTitle(
  firstUserMessage: string
): Promise<string | null> {
  try {
    const response = await fetch("/api/chat/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: firstUserMessage }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: string | null };
    return typeof data.title === "string" && data.title.trim().length > 0
      ? data.title.trim()
      : null;
  } catch {
    return null;
  }
}

export async function requestFollowUpSuggestions(
  userPrompt: string,
  assistantReply: string
): Promise<string[]> {
  try {
    const response = await fetch("/api/chat/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt, assistantReply }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { suggestions?: unknown };
    if (!Array.isArray(data.suggestions)) return [];
    return data.suggestions
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

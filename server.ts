import dotenv from "dotenv";
import express from "express";
import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { Content, GenerateContentResponse, Part } from "@google/genai";

// Load .env.local first (if present locally), then .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const ALLOWED_MODELS = new Set([
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
]);

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const MAX_CONTEXT_MESSAGES = 24;
const MAX_RECENT_IMAGE_TURNS = 4;

const DEFAULT_SYSTEM_INSTRUCTION =
  "You are a clear, thoughtful, accurate AI assistant. Provide well-structured answers using concise Markdown formatting (headings, bullet lists, tables, and fenced code blocks with language identifiers when sharing code). Avoid filler.";

interface IncomingAttachment {
  kind: "image" | "text";
  name: string;
  mimeType: string;
  dataUrl?: string;
  textContent?: string;
}

interface IncomingMessage {
  role: "user" | "model";
  content: string;
  attachments?: IncomingAttachment[];
}

interface ChatRequestBody {
  messages?: IncomingMessage[];
  model?: string;
  systemInstruction?: string;
  temperature?: number;
}

interface TitleRequestBody {
  message?: string;
}

interface SuggestionsRequestBody {
  userPrompt?: string;
  assistantReply?: string;
}

// Reuse a singleton client instance for persistent keep-alive TLS connections
let cachedClient: { key: string; instance: GoogleGenAI } | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (
    !apiKey ||
    apiKey === "MY_GEMINI_API_KEY" ||
    apiKey === "YOUR_GEMINI_API_KEY_HERE"
  ) {
    const err = new Error("Gemini API key is not configured on the server.");
    (err as Error & { statusCode?: number; code?: string }).statusCode = 500;
    (err as Error & { statusCode?: number; code?: string }).code =
      "MISSING_API_KEY";
    throw err;
  }

  if (cachedClient && cachedClient.key === apiKey) {
    return cachedClient.instance;
  }

  const instance = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
      // Fail fast (no 5x exponential backoff) so model fallback happens in <300ms
      // and background title/suggestion calls never amplify free-tier quota usage.
      retryOptions: {
        attempts: 1,
      },
    },
  });
  cachedClient = { key: apiKey, instance };
  return instance;
}

function buildMessageParts(
  msg: IncomingMessage,
  includeBinaryImages: boolean
): Part[] {
  const parts: Part[] = [];
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];

  for (const att of attachments) {
    if (!att || typeof att !== "object") continue;

    if (att.kind === "image" && typeof att.dataUrl === "string") {
      if (includeBinaryImages) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(att.dataUrl);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1] || att.mimeType || "image/jpeg",
              data: match[2],
            },
          });
        }
      } else {
        parts.push({ text: `[Previously attached image: ${att.name}]` });
      }
    } else if (att.kind === "text" && typeof att.textContent === "string") {
      const fileHeader = `Attached file (${att.name || "document.txt"}):\n\`\`\`\n${att.textContent.slice(0, 60000)}\n\`\`\``;
      parts.push({ text: fileHeader });
    }
  }

  const trimmedText = typeof msg.content === "string" ? msg.content.trim() : "";
  if (trimmedText) {
    parts.push({ text: trimmedText });
  } else if (parts.length > 0 && msg.role === "user") {
    parts.push({ text: "Please analyze the attached content." });
  }

  return parts;
}

/**
 * Normalizes conversation history into multimodal Gemini Content turns,
 * trimming excess historical turns and older binary image payloads for fast TTFT.
 */
function buildNormalizedContents(messages: IncomingMessage[]): Content[] {
  const recentSlice =
    messages.length > MAX_CONTEXT_MESSAGES
      ? messages.slice(-MAX_CONTEXT_MESSAGES)
      : messages;

  const imageCutoffIndex = Math.max(
    0,
    recentSlice.length - MAX_RECENT_IMAGE_TURNS * 2
  );

  const turns: { role: "user" | "model"; parts: Part[] }[] = [];

  for (let i = 0; i < recentSlice.length; i++) {
    const m = recentSlice[i];
    if (!m || (m.role !== "user" && m.role !== "model")) continue;
    const includeImages = i >= imageCutoffIndex;
    const parts = buildMessageParts(m, includeImages);
    if (parts.length === 0) continue;

    const prev = turns[turns.length - 1];
    if (prev && prev.role === m.role) {
      prev.parts.push(...parts);
    } else {
      turns.push({ role: m.role, parts });
    }
  }

  while (turns.length > 0 && turns[0].role !== "user") {
    turns.shift();
  }

  return turns;
}

function classifyGeminiError(error: unknown): {
  status: number;
  code: string;
  message: string;
  shouldFallbackModel: boolean;
} {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const customCode = (error as { code?: string })?.code;

  if (customCode === "MISSING_API_KEY") {
    return {
      status: 500,
      code: "MISSING_API_KEY",
      message:
        "Server API key is not configured. Please check GEMINI_API_KEY in your environment or Settings > Secrets.",
      shouldFallbackModel: false,
    };
  }

  const upper = rawMessage.toUpperCase();

  if (
    upper.includes("API_KEY_INVALID") ||
    upper.includes("PERMISSION_DENIED") ||
    upper.includes("403") ||
    upper.includes("INVALID API KEY")
  ) {
    return {
      status: 403,
      code: "INVALID_API_KEY",
      message:
        "Unable to authenticate with Gemini API. Please verify your API key in Settings > Secrets or your server environment.",
      shouldFallbackModel: false,
    };
  }

  if (
    upper.includes("RESOURCE_EXHAUSTED") ||
    upper.includes("429") ||
    upper.includes("QUOTA") ||
    upper.includes("RATE LIMIT")
  ) {
    return {
      status: 429,
      code: "RATE_LIMITED",
      message:
        "Free-tier rate limit reached. Please wait a few seconds before sending your next message.",
      shouldFallbackModel: true,
    };
  }

  if (upper.includes("NOT_FOUND") || upper.includes("404")) {
    return {
      status: 404,
      code: "MODEL_NOT_FOUND",
      message:
        "The selected Gemini model is currently unavailable. Try switching models and retrying.",
      shouldFallbackModel: true,
    };
  }

  if (
    upper.includes("HIGH DEMAND") ||
    upper.includes("OVERLOADED") ||
    upper.includes("FETCH FAILED") ||
    upper.includes("NETWORK") ||
    upper.includes("UNAVAILABLE") ||
    upper.includes("503") ||
    upper.includes("DEADLINE_EXCEEDED")
  ) {
    return {
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message:
        "Gemini is experiencing temporary high demand. Please retry in a moment.",
      shouldFallbackModel: true,
    };
  }

  return {
    status: 500,
    code: "GENERATION_FAILED",
    message: "Failed to generate a response from Gemini. Please try again.",
    shouldFallbackModel: false,
  };
}

async function openStreamWithFallback(
  ai: GoogleGenAI,
  contents: Content[],
  preferredModel: string,
  systemInstruction: string,
  temperature: number
): Promise<{
  firstResult: IteratorResult<GenerateContentResponse>;
  iterator: AsyncIterator<GenerateContentResponse>;
  usedModel: string;
}> {
  const candidates = [
    preferredModel,
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: unknown = null;

  for (const modelName of candidates) {
    const isFlashLite = modelName === "gemini-3.1-flash-lite";
    const isGemini3Series = modelName.startsWith("gemini-3");

    try {
      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature,
          ...(isGemini3Series
            ? {
                thinkingConfig: {
                  thinkingLevel: isFlashLite
                    ? ThinkingLevel.MINIMAL
                    : ThinkingLevel.LOW,
                },
              }
            : {}),
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
            retryOptions: isFlashLite
              ? { attempts: 2, initialDelay: 0.4, maxDelay: 1.0 }
              : { attempts: 1 },
          },
        },
      });

      const iterator = stream[Symbol.asyncIterator]();
      const firstResult = await iterator.next();

      return {
        firstResult,
        iterator,
        usedModel: modelName,
      };
    } catch (err) {
      lastError = err;
      const classified = classifyGeminiError(err);
      if (!classified.shouldFallbackModel) {
        throw err;
      }
      console.warn(
        `[/api/chat] Model ${modelName} unavailable (${classified.code}), trying fallback...`
      );
    }
  }

  throw lastError ?? new Error("All candidate models failed.");
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "8mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Low-latency streaming chat completion route (SSE)
  app.post("/api/chat", async (req: Request, res: Response) => {
    // Disable TCP Nagle buffering so SSE chunks flush over the socket immediately
    req.socket?.setNoDelay(true);
    res.socket?.setNoDelay(true);

    const body = (req.body ?? {}) as ChatRequestBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];

    if (rawMessages.length === 0) {
      res.status(400).json({
        code: "EMPTY_MESSAGES",
        message: "Please enter a message before sending.",
      });
      return;
    }

    const lastMessage = rawMessages[rawMessages.length - 1];
    const hasLastText =
      typeof lastMessage?.content === "string" &&
      lastMessage.content.trim().length > 0;
    const hasLastAttachments =
      Array.isArray(lastMessage?.attachments) &&
      lastMessage.attachments.length > 0;

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      (!hasLastText && !hasLastAttachments)
    ) {
      res.status(400).json({
        code: "EMPTY_PROMPT",
        message: "Please type a message or attach a file before sending.",
      });
      return;
    }

    const contents = buildNormalizedContents(rawMessages);
    if (contents.length === 0) {
      res.status(400).json({
        code: "INVALID_HISTORY",
        message: "No valid user message was found in the conversation.",
      });
      return;
    }

    const selectedModel =
      body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

    const customInstruction =
      typeof body.systemInstruction === "string" &&
      body.systemInstruction.trim().length > 0
        ? body.systemInstruction.trim().slice(0, 4000)
        : DEFAULT_SYSTEM_INSTRUCTION;

    const temperature =
      typeof body.temperature === "number" &&
      Number.isFinite(body.temperature) &&
      body.temperature >= 0 &&
      body.temperature <= 1.5
        ? body.temperature
        : 0.7;

    let clientDisconnected = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    try {
      const ai = getGeminiClient();

      // Flush SSE headers immediately (<5ms TTFB) so client reader attaches right away
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(": connected\n\n");

      const { firstResult, iterator } = await openStreamWithFallback(
        ai,
        contents,
        selectedModel,
        customInstruction,
        temperature
      );

      if (clientDisconnected) {
        return;
      }

      let emittedAnyText = false;

      if (!firstResult.done && firstResult.value) {
        const initialText = firstResult.value.text;
        if (initialText) {
          emittedAnyText = true;
          res.write(
            `data: ${JSON.stringify({ type: "chunk", text: initialText })}\n\n`
          );
        }

        while (!clientDisconnected) {
          const step = await iterator.next();
          if (step.done) break;
          const chunkText = step.value?.text;
          if (chunkText) {
            emittedAnyText = true;
            res.write(
              `data: ${JSON.stringify({ type: "chunk", text: chunkText })}\n\n`
            );
          }
        }
      }

      if (!clientDisconnected) {
        if (!emittedAnyText) {
          res.write(
            `data: ${JSON.stringify({
              type: "chunk",
              text: "I couldn't generate a text response for that prompt. Could you try rephrasing it?",
            })}\n\n`
          );
        }
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      }
    } catch (error) {
      const classified = classifyGeminiError(error);
      console.error("[/api/chat] Gemini error:", classified.code, error);

      if (!res.headersSent) {
        res.status(classified.status).json({
          code: classified.code,
          message: classified.message,
        });
      } else if (!clientDisconnected && !res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            code: classified.code,
            message: classified.message,
          })}\n\n`
        );
        res.end();
      }
    }
  });

  // Lightweight conversation title generator
  app.post("/api/chat/title", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as TitleRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      res.status(400).json({ message: "Message is required." });
      return;
    }

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `Generate a concise, natural 3 to 5 word title for a chat conversation that begins with this message. Return ONLY the plain title text without quotes or trailing punctuation:\n\n${message.slice(0, 500)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      const rawTitle = (response.text ?? "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();

      res.json({
        title: rawTitle ? rawTitle.slice(0, 60) : null,
      });
    } catch {
      res.json({ title: null });
    }
  });

  // Contextual follow-up question generator
  app.post("/api/chat/suggestions", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as SuggestionsRequestBody;
    const userPrompt =
      typeof body.userPrompt === "string" ? body.userPrompt.trim() : "";
    const assistantReply =
      typeof body.assistantReply === "string" ? body.assistantReply.trim() : "";

    if (!userPrompt || !assistantReply) {
      res.json({ suggestions: [] });
      return;
    }

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `Based on this exchange, suggest 3 brief, insightful follow-up questions the user might want to ask next (each under 65 characters).\n\nUser: ${userPrompt.slice(0, 400)}\nAssistant: ${assistantReply.slice(0, 900)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        },
      });

      const parsed = JSON.parse(response.text ?? "[]");
      if (Array.isArray(parsed)) {
        const clean = parsed
          .filter((item): item is string => typeof item === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 90)
          .slice(0, 3);
        res.json({ suggestions: clean });
        return;
      }
      res.json({ suggestions: [] });
    } catch {
      res.json({ suggestions: [] });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

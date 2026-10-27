import {
  BUILT_IN_PERSONAS,
  type ChatAttachment,
  type ChatMessage,
  type Conversation,
  type ModelId,
  type Persona,
  type ThemeMode,
} from "../types/chat";

const CONVERSATIONS_KEY = "lumina_chat_conversations_v1";
const ACTIVE_ID_KEY = "lumina_chat_active_id_v1";
const THEME_KEY = "lumina_chat_theme_v1";
const CUSTOM_PERSONAS_KEY = "lumina_chat_custom_personas_v1";

function isValidModel(model: unknown): model is ModelId {
  return model === "gemini-3.8-flash" || model === "gemini-3.1-flash-lite";
}

function sanitizeAttachment(raw: unknown): ChatAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id) return null;
  if (obj.kind !== "image" && obj.kind !== "text") return null;
  if (typeof obj.name !== "string") return null;

  return {
    id: obj.id,
    kind: obj.kind,
    name: obj.name,
    mimeType: typeof obj.mimeType === "string" ? obj.mimeType : "text/plain",
    sizeLabel: typeof obj.sizeLabel === "string" ? obj.sizeLabel : "",
    dataUrl: typeof obj.dataUrl === "string" ? obj.dataUrl : undefined,
    textContent: typeof obj.textContent === "string" ? obj.textContent : undefined,
  };
}

function sanitizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id) return null;
  if (obj.role !== "user" && obj.role !== "model") return null;
  if (typeof obj.content !== "string") return null;

  const attachments = Array.isArray(obj.attachments)
    ? obj.attachments
        .map(sanitizeAttachment)
        .filter((a): a is ChatAttachment => a !== null)
    : undefined;

  return {
    id: obj.id,
    role: obj.role,
    content: obj.content,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    bookmarked: Boolean(obj.bookmarked),
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : undefined,
    isError: Boolean(obj.isError),
  };
}

function sanitizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id) return null;

  const rawMessages = Array.isArray(obj.messages) ? obj.messages : [];
  const messages = rawMessages
    .map(sanitizeMessage)
    .filter((m): m is ChatMessage => m !== null);

  const now = Date.now();
  const title =
    typeof obj.title === "string" && obj.title.trim().length > 0
      ? obj.title.trim()
      : "New conversation";

  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3)
    : undefined;

  return {
    id: obj.id,
    title,
    messages,
    model: isValidModel(obj.model) ? obj.model : "gemini-3.1-flash-lite",
    personaId: typeof obj.personaId === "string" ? obj.personaId : "default",
    suggestions,
    pinned: Boolean(obj.pinned),
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : now,
  };
}

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeConversation)
      .filter((c): c is Conversation => c !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.warn("Failed to read conversations from localStorage:", err);
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    return true;
  } catch (err) {
    console.error("Failed to save conversations to localStorage:", err);
    return false;
  }
}

export function loadCustomPersonas(): Persona[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PERSONAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object"))
      .filter(
        (p) =>
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.systemInstruction === "string"
      )
      .map((p) => ({
        id: String(p.id),
        name: String(p.name).trim(),
        tagline:
          typeof p.tagline === "string" && p.tagline.trim()
            ? p.tagline.trim()
            : "Custom assistant persona",
        systemInstruction: String(p.systemInstruction).trim(),
        temperature:
          typeof p.temperature === "number" &&
          p.temperature >= 0 &&
          p.temperature <= 1.5
            ? p.temperature
            : 0.7,
        isBuiltIn: false,
      }));
  } catch {
    return [];
  }
}

export function saveCustomPersonas(personas: Persona[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    const customOnly = personas.filter((p) => !p.isBuiltIn);
    window.localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(customOnly));
    return true;
  } catch {
    return false;
  }
}

export function resolvePersona(
  personaId: string | undefined,
  customPersonas: Persona[]
): Persona {
  const all = [...BUILT_IN_PERSONAS, ...customPersonas];
  return all.find((p) => p.id === personaId) ?? BUILT_IN_PERSONAS[0];
}

export function loadActiveConversationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function saveActiveConversationId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_ID_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_ID_KEY);
    }
  } catch {
    // Ignore storage write failures
  }
}

export function loadTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // Fallback to light
  }
  return "light";
}

export function saveTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore
  }
}

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function deriveFallbackTitle(text: string, fallbackName?: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return fallbackName ? `Attachment: ${fallbackName.slice(0, 32)}` : "New conversation";
  }
  if (cleaned.length <= 44) return cleaned;
  return `${cleaned.slice(0, 44).trim()}…`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compresses an uploaded/pasted image onto a canvas (max 1024px) so it stays
 * compact for Browser Local Storage and fast multimodal Gemini uploads.
 */
async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image format."));
      img.onload = () => {
        const MAX_DIM = 1024;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(outMime, 0.82);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "html",
  "css",
  "sql",
  "yaml",
  "yml",
  "xml",
  "sh",
  "env",
  "log",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
]);

export async function processUploadedFile(file: File): Promise<ChatAttachment> {
  if (file.type.startsWith("image/")) {
    if (file.size > 12 * 1024 * 1024) {
      throw new Error(`"${file.name}" exceeds the 12 MB image limit.`);
    }
    const dataUrl = await compressImageFile(file);
    const outMime = dataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    return {
      id: createId(),
      kind: "image",
      name: file.name || "pasted-image.jpg",
      mimeType: outMime,
      sizeLabel: formatBytes(file.size),
      dataUrl,
    };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isTextLike =
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/javascript" ||
    file.type === "application/xml" ||
    TEXT_EXTENSIONS.has(ext);

  if (!isTextLike) {
    throw new Error(
      `Unsupported file "${file.name}". Attach images (PNG, JPG, WEBP) or text/code files (.txt, .md, .json, .csv, .ts, .py).`
    );
  }

  if (file.size > 250 * 1024) {
    throw new Error(`"${file.name}" exceeds the 250 KB text attachment limit.`);
  }

  const rawText = await file.text();
  return {
    id: createId(),
    kind: "text",
    name: file.name,
    mimeType: file.type || "text/plain",
    sizeLabel: formatBytes(file.size),
    textContent: rawText.slice(0, 60000),
  };
}

export function exportConversationsJson(conversations: Conversation[]): void {
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: conversations.length,
      conversations,
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lumina-chats-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportConversationMarkdown(
  conversation: Conversation,
  personaName: string
): void {
  const header = [
    `# ${conversation.title}`,
    "",
    `Exported: ${new Date().toLocaleString()} · Model: ${conversation.model} · Persona: ${personaName}`,
    "",
    "---",
    "",
  ].join("\n");

  const body = conversation.messages
    .map((m) => {
      const speaker = m.role === "user" ? "### You" : "### Assistant";
      const time = new Date(m.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const attachmentNote =
        m.attachments && m.attachments.length > 0
          ? `\n*Attachments: ${m.attachments.map((a) => a.name).join(", ")}*\n`
          : "";
      return `${speaker} (${time})${attachmentNote}\n\n${m.content}\n`;
    })
    .join("\n---\n\n");

  const blob = new Blob([header + body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = conversation.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  anchor.href = url;
  anchor.download = `${slug || "conversation"}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseImportedConversationsJson(rawText: string): Conversation[] {
  const parsed = JSON.parse(rawText) as unknown;
  const rawList = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { conversations?: unknown }).conversations)
      ? (parsed as { conversations: unknown[] }).conversations
      : null;

  if (!rawList) {
    throw new Error("Invalid backup file format.");
  }

  const sanitized = rawList
    .map(sanitizeConversation)
    .filter((c): c is Conversation => c !== null);

  if (sanitized.length === 0) {
    throw new Error("No valid conversations found in backup file.");
  }

  return sanitized;
}

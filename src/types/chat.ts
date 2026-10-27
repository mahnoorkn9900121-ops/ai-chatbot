export type ModelId = "gemini-3.1-flash-lite" | "gemini-3.8-flash";

export interface ModelOption {
  id: ModelId;
  label: string;
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    description: "Fastest free-tier responses for everyday tasks",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    description: "Deeper reasoning and structured synthesis",
  },
];

export interface ChatAttachment {
  id: string;
  kind: "image" | "text";
  name: string;
  mimeType: string;
  sizeLabel: string;
  dataUrl?: string;
  textContent?: string;
}

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  systemInstruction: string;
  temperature: number;
  isBuiltIn?: boolean;
}

export const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: "default",
    name: "General Assistant",
    tagline: "Clear, structured answers across everyday topics",
    systemInstruction:
      "You are a clear, thoughtful, accurate AI assistant. Provide well-structured answers using concise Markdown formatting (headings, bullet lists, tables, and fenced code blocks with language identifiers when sharing code). Avoid filler.",
    temperature: 0.7,
    isBuiltIn: true,
  },
  {
    id: "architect",
    name: "Code Architect",
    tagline: "Production-grade TypeScript, architecture, and debugging",
    systemInstruction:
      "You are a principal software engineer. Prioritize clean, idiomatic, production-ready code, explicit edge-case handling, and clear architectural trade-offs. Always include language identifiers on fenced code blocks and keep prose concise.",
    temperature: 0.3,
    isBuiltIn: true,
  },
  {
    id: "editor",
    name: "Writing Editor",
    tagline: "Sharp, natural prose editing and tone refinement",
    systemInstruction:
      "You are an experienced editorial writer and communications strategist. Help refine clarity, rhythm, and tone without clichés or corporate jargon. Offer concrete before-and-after improvements when editing drafts.",
    temperature: 0.8,
    isBuiltIn: true,
  },
  {
    id: "tutor",
    name: "Study Tutor",
    tagline: "Step-by-step explanations with intuitive examples",
    systemInstruction:
      "You are a patient, insightful tutor. Break complex concepts down from first principles using concrete examples, clear analogies, and short comprehension checks at the end of explanations.",
    temperature: 0.6,
    isBuiltIn: true,
  },
];

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  attachments?: ChatAttachment[];
  bookmarked?: boolean;
  createdAt: number;
  updatedAt?: number;
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: ModelId;
  personaId?: string;
  suggestions?: string[];
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ThemeMode = "light" | "dark";

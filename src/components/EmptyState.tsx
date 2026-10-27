import { memo } from "react";
import { BUILT_IN_PERSONAS, type Persona } from "../types/chat";
import { ArrowUpRight, Plus } from "lucide-react";

interface EmptyStateProps {
  selectedPersonaId: string;
  customPersonas: Persona[];
  onSelectPersona: (personaId: string) => void;
  onOpenPersonaModal: () => void;
  onSelectPrompt: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  {
    category: "Architecture",
    title: "Design a REST API rate limiter",
    prompt:
      "Explain how to design a token-bucket rate limiter for a Node.js API, including TypeScript code and trade-offs between in-memory and distributed state.",
  },
  {
    category: "Productivity",
    title: "Turn rough notes into an action plan",
    prompt:
      "Help me structure messy meeting notes into a concise project brief with owners, milestones, and key risks. Ask me to paste my notes first or show a template.",
  },
  {
    category: "Debugging",
    title: "Optimize slow React renders",
    prompt:
      "Walk through a practical checklist for diagnosing unnecessary re-renders in React 19 and show before-and-after code examples.",
  },
  {
    category: "Learning",
    title: "Compare SQL indexing strategies",
    prompt:
      "Compare B-Tree, Hash, and GIN indexes in PostgreSQL with concrete query examples showing when each index performs best.",
  },
];

export const EmptyState = memo(function EmptyState({
  selectedPersonaId,
  customPersonas,
  onSelectPersona,
  onOpenPersonaModal,
  onSelectPrompt,
}: EmptyStateProps) {
  const personas = [...BUILT_IN_PERSONAS, ...customPersonas];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-6 sm:px-6 sm:py-10 2xl:max-w-4xl">
      <div className="max-w-xl">
        <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
          Multimodal Vision · Custom Personas · Local Browser Storage
        </p>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50 [text-wrap:balance]">
          What would you like to work through today?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 sm:mt-2.5 sm:text-[15px] dark:text-zinc-400">
          Ask questions, attach screenshots or code files, switch assistant personas, or dictate by voice. Everything stays saved locally in your browser.
        </p>
      </div>

      {/* Interactive Persona Selector */}
      <div className="mt-5 sm:mt-6">
        <div className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Active Persona
        </div>
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {personas.map((persona) => {
            const isSelected = persona.id === selectedPersonaId;
            return (
              <button
                key={persona.id}
                type="button"
                onClick={() => onSelectPersona(persona.id)}
                className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-700 sm:min-h-0 sm:rounded-lg whitespace-nowrap shrink-0 ${
                  isSelected
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-200/90 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                {persona.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenPersonaModal}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-700 sm:min-h-0 sm:rounded-lg dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Custom Persona</span>
          </button>
        </div>
      </div>

      {/* Starter Prompt Grid */}
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:mt-7 sm:grid-cols-2 sm:gap-3">
        {STARTER_PROMPTS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onSelectPrompt(item.prompt)}
            className="group flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-3.5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-700 sm:rounded-xl sm:p-4 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.category}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
              </div>
              <h2 className="mt-1 text-sm font-semibold text-zinc-900 sm:mt-1.5 dark:text-zinc-100">
                {item.title}
              </h2>
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500 sm:mt-2 dark:text-zinc-400">
              {item.prompt}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
});

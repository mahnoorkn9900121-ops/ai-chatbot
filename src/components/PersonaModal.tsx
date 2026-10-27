import { useEffect, useState } from "react";
import { BUILT_IN_PERSONAS, type Persona } from "../types/chat";
import { createId } from "../lib/storage";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

interface PersonaModalProps {
  isOpen: boolean;
  selectedPersonaId: string;
  customPersonas: Persona[];
  onClose: () => void;
  onSelectPersona: (personaId: string) => void;
  onSaveCustomPersona: (persona: Persona) => void;
  onDeleteCustomPersona: (personaId: string) => void;
}

const TEMPERATURE_PRESETS = [
  { value: 0.2, label: "Precise (0.2)" },
  { value: 0.7, label: "Balanced (0.7)" },
  { value: 1.1, label: "Creative (1.1)" },
];

export function PersonaModal({
  isOpen,
  selectedPersonaId,
  customPersonas,
  onClose,
  onSelectPersona,
  onSaveCustomPersona,
  onDeleteCustomPersona,
}: PersonaModalProps) {
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [systemInstruction, setSystemInstruction] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const allPersonas = [...BUILT_IN_PERSONAS, ...customPersonas];

  const openCreateForm = () => {
    setEditingPersona(null);
    setName("");
    setTagline("");
    setSystemInstruction("");
    setTemperature(0.7);
    setIsCreating(true);
  };

  const openEditForm = (persona: Persona) => {
    setEditingPersona(persona);
    setName(persona.name);
    setTagline(persona.tagline);
    setSystemInstruction(persona.systemInstruction);
    setTemperature(persona.temperature);
    setIsCreating(true);
  };

  const handleSaveForm = () => {
    const trimmedName = name.trim();
    const trimmedInstruction = systemInstruction.trim();
    if (!trimmedName || !trimmedInstruction) return;

    const saved: Persona = {
      id: editingPersona?.id ?? createId(),
      name: trimmedName,
      tagline: tagline.trim() || "Custom assistant persona",
      systemInstruction: trimmedInstruction,
      temperature,
      isBuiltIn: false,
    };

    onSaveCustomPersona(saved);
    onSelectPersona(saved.id);
    setIsCreating(false);
    setEditingPersona(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-xl sm:max-h-[86dvh] sm:rounded-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Mobile Bottom-Sheet Handle */}
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />

        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 px-4 py-3.5 sm:px-5 sm:py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2
              id="persona-modal-title"
              className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {isCreating
                ? editingPersona
                  ? "Edit Custom Persona"
                  : "New Custom Persona"
                : "Assistant Personas"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {isCreating
                ? "Define custom instructions and response temperature saved in your browser."
                : "Choose how the assistant responds or create your own."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:h-8 sm:w-8 sm:rounded-lg dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 shrink-0"
            aria-label="Close persona settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {isCreating ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Persona Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. SQL Performance Reviewer"
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-base text-zinc-900 focus:border-zinc-400 focus:outline-none sm:rounded-lg sm:py-2 sm:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Short Description
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Analyzes query plans and suggests indexing improvements"
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-base text-zinc-900 focus:border-zinc-400 focus:outline-none sm:rounded-lg sm:py-2 sm:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  System Instructions
                </label>
                <textarea
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                  rows={4}
                  maxLength={3500}
                  placeholder="Describe the assistant's expertise, tone, formatting rules, and constraints..."
                  className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-base leading-relaxed text-zinc-900 focus:border-zinc-400 focus:outline-none sm:rounded-lg sm:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Response Style
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-zinc-100 p-1 sm:gap-2 sm:rounded-lg dark:bg-zinc-800/80">
                  {TEMPERATURE_PRESETS.map((preset) => {
                    const active = Math.abs(temperature - preset.value) < 0.1;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setTemperature(preset.value)}
                        className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:rounded-md sm:px-3 whitespace-nowrap shrink-0 tabular-nums ${
                          active
                            ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-50"
                            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {allPersonas.map((persona) => {
                const isSelected = persona.id === selectedPersonaId;
                const isConfirming = confirmDeleteId === persona.id;

                return (
                  <div
                    key={persona.id}
                    className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-50 dark:border-zinc-300 dark:bg-zinc-800/70"
                        : "border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPersona(persona.id);
                        onClose();
                      }}
                      className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {persona.name}
                        </span>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                          · temp {persona.temperature.toFixed(1)}
                          {!persona.isBuiltIn ? " · Custom" : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {persona.tagline}
                      </p>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSelected && !isConfirming && (
                        <span
                          className="flex h-8 w-8 items-center justify-center text-teal-700 sm:h-7 sm:w-7 dark:text-teal-400"
                          aria-label="Selected persona"
                        >
                          <Check className="h-4 w-4" />
                        </span>
                      )}

                      {!persona.isBuiltIn &&
                        (isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteCustomPersona(persona.id);
                                setConfirmDeleteId(null);
                              }}
                              className="min-h-[36px] rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 sm:min-h-0 whitespace-nowrap shrink-0"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[36px] rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 sm:min-h-0 dark:text-zinc-300 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(persona)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                              title="Edit custom persona"
                              aria-label="Edit custom persona"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(persona.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              title="Delete custom persona"
                              aria-label="Delete custom persona"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pb-safe flex items-center justify-between gap-2 border-t border-zinc-200/80 px-4 pt-3.5 sm:px-5 sm:py-3.5 dark:border-zinc-800">
          {isCreating ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingPersona(null);
                }}
                className="min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 sm:min-h-0 sm:rounded-lg dark:text-zinc-300 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
              >
                Back to list
              </button>
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={!name.trim() || !systemInstruction.trim()}
                className="min-h-[42px] rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40 sm:min-h-0 sm:rounded-lg dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
              >
                {editingPersona ? "Save Persona" : "Create Persona"}
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {customPersonas.length} custom{" "}
                {customPersonas.length === 1 ? "persona" : "personas"}
              </span>
              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 sm:min-h-0 sm:rounded-lg dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Custom Persona</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

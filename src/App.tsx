import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  ModelId,
  Persona,
  ThemeMode,
} from "./types/chat";
import {
  createId,
  deriveFallbackTitle,
  exportConversationMarkdown,
  exportConversationsJson,
  loadActiveConversationId,
  loadConversations,
  loadCustomPersonas,
  loadTheme,
  parseImportedConversationsJson,
  processUploadedFile,
  resolvePersona,
  saveActiveConversationId,
  saveConversations,
  saveCustomPersonas,
  saveTheme,
} from "./lib/storage";
import {
  ChatApiError,
  requestFollowUpSuggestions,
  requestSmartTitle,
  streamChatCompletion,
} from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { MessageItem } from "./components/MessageItem";
import { ChatComposer } from "./components/ChatComposer";
import { EmptyState } from "./components/EmptyState";
import { PersonaModal } from "./components/PersonaModal";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  Check,
  FileDown,
  Menu,
  Moon,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Plus,
  Sun,
  X,
} from "lucide-react";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  );
  const [activeId, setActiveId] = useState<string | null>(() => {
    const savedActive = loadActiveConversationId();
    const initialList = loadConversations();
    if (savedActive && initialList.some((c) => c.id === savedActive)) {
      return savedActive;
    }
    return initialList[0]?.id ?? null;
  });

  const [customPersonas, setCustomPersonas] = useState<Persona[]>(() =>
    loadCustomPersonas()
  );
  const [defaultModel, setDefaultModel] = useState<ModelId>(
    "gemini-3.1-flash-lite"
  );
  const [defaultPersonaId, setDefaultPersonaId] = useState<string>("default");
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());

  const [isSidebarOpenDesktop, setIsSidebarOpenDesktop] = useState(true);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);

  const [pendingAttachments, setPendingAttachments] = useState<
    ChatAttachment[]
  >([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);

  // Isolated 60fps streaming state so conversations & localStorage don't thrash per token
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");

  const [statusBanner, setStatusBanner] = useState<{
    tone: "warning" | "info";
    text: string;
  } | null>(null);

  // Header inline rename state
  const [isRenamingHeader, setIsRenamingHeader] = useState(false);
  const [headerTitleDraft, setHeaderTitleDraft] = useState("");

  // Refs for scroll & mid-stream unload safety
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef<Conversation[]>(conversations);
  const activeStreamRef = useRef<{
    convId: string;
    msgId: string;
    text: string;
  } | null>(null);

  conversationsRef.current = conversations;

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const currentModel: ModelId = activeConversation?.model ?? defaultModel;
  const currentPersonaId = activeConversation?.personaId ?? defaultPersonaId;
  const activePersona = useMemo(
    () => resolvePersona(currentPersonaId, customPersonas),
    [currentPersonaId, customPersonas]
  );
  const isStreaming = streamingMsgId !== null;

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    saveTheme(theme);
  }, [theme]);

  // Persist conversations to Local Storage on discrete CRUD & stream completion
  useEffect(() => {
    const ok = saveConversations(conversations);
    if (!ok && conversations.length > 0) {
      setStatusBanner({
        tone: "warning",
        text: "Browser Local Storage is full. Export or delete older conversations to free up space.",
      });
    }
  }, [conversations]);

  // Flush any in-flight partial stream to Local Storage if user refreshes/closes mid-stream
  useEffect(() => {
    const flushMidStream = () => {
      const active = activeStreamRef.current;
      if (!active || !active.text) return;
      const snapshot = conversationsRef.current.map((c) => {
        if (c.id !== active.convId) return c;
        return {
          ...c,
          updatedAt: Date.now(),
          messages: c.messages.map((m) =>
            m.id === active.msgId ? { ...m, content: active.text } : m
          ),
        };
      });
      saveConversations(snapshot);
    };
    window.addEventListener("beforeunload", flushMidStream);
    return () => window.removeEventListener("beforeunload", flushMidStream);
  }, []);

  // Persist custom personas
  useEffect(() => {
    saveCustomPersonas(customPersonas);
  }, [customPersonas]);

  // Persist active conversation selection
  useEffect(() => {
    saveActiveConversationId(activeId);
    setIsRenamingHeader(false);
  }, [activeId]);

  const scrollToBottomInstant = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const scrollToBottomSmooth = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    requestAnimationFrame(() => {
      scrollToBottomInstant();
    });
  }, [activeId, scrollToBottomInstant]);

  // Zero-jitter instant scroll tracking while tokens stream or messages change
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottomInstant();
    }
  }, [
    streamingText,
    activeConversation?.messages,
    activeConversation?.suggestions,
    scrollToBottomInstant,
  ]);

  // Keep latest message visible when mobile virtual keyboard resizes visualViewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleViewportResize = () => {
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => {
          scrollToBottomInstant();
        });
      }
    };
    vv.addEventListener("resize", handleViewportResize);
    return () => vv.removeEventListener("resize", handleViewportResize);
  }, [scrollToBottomInstant]);

  const handleComposerFocus = useCallback(() => {
    if (window.innerWidth < 768 && isNearBottomRef.current) {
      setTimeout(() => {
        scrollToBottomInstant();
      }, 150);
    }
  }, [scrollToBottomInstant]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);
  };

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Core 60fps rAF-batched streaming runner
  const runAssistantStream = useCallback(
    async (
      convId: string,
      historyMessages: ChatMessage[],
      assistantPlaceholderId: string,
      modelToUse: ModelId,
      personaToUse: Persona,
      shouldAutoTitle: boolean,
      firstPromptForTitle?: string
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStreamingConvId(convId);
      setStreamingMsgId(assistantPlaceholderId);
      setStreamingText("");
      activeStreamRef.current = {
        convId,
        msgId: assistantPlaceholderId,
        text: "",
      };
      isNearBottomRef.current = true;

      let accumulated = "";
      let rafId: number | null = null;

      const scheduleFrameFlush = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setStreamingText(accumulated);
        });
      };

      try {
        await streamChatCompletion({
          messages: historyMessages,
          model: modelToUse,
          systemInstruction: personaToUse.systemInstruction,
          temperature: personaToUse.temperature,
          signal: controller.signal,
          onChunk: (chunkText) => {
            accumulated += chunkText;
            if (activeStreamRef.current) {
              activeStreamRef.current.text = accumulated;
            }
            scheduleFrameFlush();
          },
        });

        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        const finalContent = accumulated;

        // Commit final response once to conversations & Local Storage
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              updatedAt: Date.now(),
              messages: c.messages.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, content: finalContent, isError: false }
                  : m
              ),
            };
          })
        );

        const lastUserTurn = [...historyMessages]
          .reverse()
          .find((m) => m.role === "user");

        if (shouldAutoTitle && firstPromptForTitle) {
          requestSmartTitle(firstPromptForTitle).then((smartTitle) => {
            if (!smartTitle) return;
            setConversations((prev) =>
              prev.map((c) => {
                if (
                  c.id === convId &&
                  c.title === deriveFallbackTitle(firstPromptForTitle)
                ) {
                  return { ...c, title: smartTitle };
                }
                return c;
              })
            );
          });
        }

        if (lastUserTurn && finalContent.trim().length > 20) {
          const promptText =
            lastUserTurn.content ||
            lastUserTurn.attachments?.map((a) => a.name).join(", ") ||
            "";
          if (promptText) {
            requestFollowUpSuggestions(promptText, finalContent).then(
              (suggs) => {
                if (suggs.length === 0) return;
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === convId ? { ...c, suggestions: suggs } : c
                  )
                );
              }
            );
          }
        }
      } catch (err) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        if (err instanceof DOMException && err.name === "AbortError") {
          const stoppedContent =
            accumulated.trim().length > 0
              ? accumulated
              : "*Generation stopped.*";
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantPlaceholderId
                    ? { ...m, content: stoppedContent, isError: false }
                    : m
                ),
              };
            })
          );
        } else {
          const friendlyError =
            err instanceof ChatApiError
              ? err.message
              : "Something went wrong while contacting Gemini. Please try again.";

          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantPlaceholderId
                    ? {
                        ...m,
                        content: friendlyError,
                        isError: true,
                      }
                    : m
                ),
              };
            })
          );
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          activeStreamRef.current = null;
          setStreamingConvId(null);
          setStreamingMsgId(null);
          setStreamingText("");
        }
      }
    },
    []
  );

  // CREATE: Start a new conversation
  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    }
    if (activeConversation && activeConversation.messages.length === 0) {
      return;
    }

    const now = Date.now();
    const newConv: Conversation = {
      id: createId(),
      title: "New conversation",
      messages: [],
      model: currentModel,
      personaId: currentPersonaId,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
  }, [
    activeConversation,
    currentModel,
    currentPersonaId,
    isStreaming,
    stopStreaming,
  ]);

  // Global keyboard shortcuts: Ctrl/Cmd+K (Search), Ctrl/Cmd+Shift+O (New Chat)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.innerWidth >= 1024) {
          setIsSidebarOpenDesktop(true);
        } else {
          setIsSidebarOpenMobile(true);
        }
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 40);
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "o"
      ) {
        e.preventDefault();
        handleNewChat();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewChat]);

  // CREATE: Send message in current or newly created conversation
  const handleSendMessage = useCallback(
    (content: string, attachments?: ChatAttachment[]) => {
      if (isStreaming) return;
      const now = Date.now();

      const userMsg: ChatMessage = {
        id: createId(),
        role: "user",
        content,
        attachments:
          attachments && attachments.length > 0 ? attachments : undefined,
        createdAt: now,
      };

      const assistantPlaceholder: ChatMessage = {
        id: createId(),
        role: "model",
        content: "",
        createdAt: now + 1,
      };

      const firstAttachmentName = attachments?.[0]?.name;

      if (!activeConversation) {
        const fallbackTitle = deriveFallbackTitle(content, firstAttachmentName);
        const persona = resolvePersona(defaultPersonaId, customPersonas);
        const newConv: Conversation = {
          id: createId(),
          title: fallbackTitle,
          messages: [userMsg, assistantPlaceholder],
          model: defaultModel,
          personaId: persona.id,
          suggestions: [],
          pinned: false,
          createdAt: now,
          updatedAt: now,
        };

        setConversations((prev) => [newConv, ...prev]);
        setActiveId(newConv.id);

        void runAssistantStream(
          newConv.id,
          [userMsg],
          assistantPlaceholder.id,
          defaultModel,
          persona,
          Boolean(content.trim()),
          content.trim() || undefined
        );
        return;
      }

      const isFirstMessage = activeConversation.messages.length === 0;
      const nextTitle =
        isFirstMessage && activeConversation.title === "New conversation"
          ? deriveFallbackTitle(content, firstAttachmentName)
          : activeConversation.title;

      const historyWithUser = [
        ...activeConversation.messages.filter((m) => !m.isError),
        userMsg,
      ];

      const persona = resolvePersona(
        activeConversation.personaId,
        customPersonas
      );

      setConversations((prev) =>
        prev
          .map((c) => {
            if (c.id !== activeConversation.id) return c;
            return {
              ...c,
              title: nextTitle,
              suggestions: [],
              updatedAt: now,
              messages: [...historyWithUser, assistantPlaceholder],
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );

      void runAssistantStream(
        activeConversation.id,
        historyWithUser,
        assistantPlaceholder.id,
        activeConversation.model,
        persona,
        isFirstMessage &&
          activeConversation.title === "New conversation" &&
          Boolean(content.trim()),
        content.trim() || undefined
      );
    },
    [
      activeConversation,
      customPersonas,
      defaultModel,
      defaultPersonaId,
      isStreaming,
      runAssistantStream,
    ]
  );

  const handleSelectStarterPrompt = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  // UPDATE: Change model
  const handleChangeModel = useCallback(
    (model: ModelId) => {
      setDefaultModel(model);
      if (!activeId) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, model } : c))
      );
    },
    [activeId]
  );

  // UPDATE: Change persona
  const handleSelectPersona = useCallback(
    (personaId: string) => {
      setDefaultPersonaId(personaId);
      if (!activeId) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, personaId } : c))
      );
    },
    [activeId]
  );

  // CRUD for Custom Personas
  const handleSaveCustomPersona = useCallback((persona: Persona) => {
    setCustomPersonas((prev) => {
      const exists = prev.some((p) => p.id === persona.id);
      if (exists) {
        return prev.map((p) => (p.id === persona.id ? persona : p));
      }
      return [persona, ...prev];
    });
  }, []);

  const handleDeleteCustomPersona = useCallback((personaId: string) => {
    setCustomPersonas((prev) => prev.filter((p) => p.id !== personaId));
    setDefaultPersonaId((prev) => (prev === personaId ? "default" : prev));
    setConversations((prev) =>
      prev.map((c) =>
        c.personaId === personaId ? { ...c, personaId: "default" } : c
      )
    );
  }, []);

  // UPDATE: Rename conversation
  const handleRenameConversation = useCallback(
    (id: string, newTitle: string) => {
      const cleaned = newTitle.trim();
      if (!cleaned) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, title: cleaned, updatedAt: Date.now() } : c
        )
      );
    },
    []
  );

  // UPDATE: Pin / unpin conversation
  const handleTogglePinConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  }, []);

  // UPDATE: Bookmark / unbookmark message
  const handleToggleBookmarkMessage = useCallback(
    (conversationId: string, messageId: string) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === messageId ? { ...m, bookmarked: !m.bookmarked } : m
            ),
          };
        })
      );
    },
    []
  );

  const handleToggleActiveMessageBookmark = useCallback(
    (messageId: string) => {
      if (!activeId) return;
      handleToggleBookmarkMessage(activeId, messageId);
    },
    [activeId, handleToggleBookmarkMessage]
  );

  // UPDATE: Edit existing message
  const handleEditMessage = useCallback(
    (messageId: string, newContent: string, regenerate: boolean) => {
      if (!activeConversation) return;
      const convId = activeConversation.id;
      const now = Date.now();

      if (!regenerate) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              updatedAt: now,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? { ...m, content: newContent, updatedAt: now, isError: false }
                  : m
              ),
            };
          })
        );
        return;
      }

      const targetIndex = activeConversation.messages.findIndex(
        (m) => m.id === messageId
      );
      if (targetIndex === -1) return;

      const updatedUserMsg: ChatMessage = {
        ...activeConversation.messages[targetIndex],
        content: newContent,
        updatedAt: now,
        isError: false,
      };

      const historyUpToEdited = [
        ...activeConversation.messages
          .slice(0, targetIndex)
          .filter((m) => !m.isError),
        updatedUserMsg,
      ];

      const assistantPlaceholder: ChatMessage = {
        id: createId(),
        role: "model",
        content: "",
        createdAt: now + 1,
      };

      const persona = resolvePersona(
        activeConversation.personaId,
        customPersonas
      );

      setConversations((prev) =>
        prev
          .map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              suggestions: [],
              updatedAt: now,
              messages: [...historyUpToEdited, assistantPlaceholder],
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );

      void runAssistantStream(
        convId,
        historyUpToEdited,
        assistantPlaceholder.id,
        activeConversation.model,
        persona,
        false
      );
    },
    [activeConversation, customPersonas, runAssistantStream]
  );

  // UPDATE: Regenerate response from an assistant message
  const handleRegenerateFromMessage = useCallback(
    (assistantMessageId: string) => {
      if (!activeConversation || isStreaming) return;
      const idx = activeConversation.messages.findIndex(
        (m) => m.id === assistantMessageId
      );
      if (idx === -1) return;

      const precedingHistory = activeConversation.messages
        .slice(0, idx)
        .filter((m) => !m.isError);

      if (!precedingHistory.some((m) => m.role === "user")) return;

      const now = Date.now();
      const assistantPlaceholder: ChatMessage = {
        id: createId(),
        role: "model",
        content: "",
        createdAt: now,
      };

      const persona = resolvePersona(
        activeConversation.personaId,
        customPersonas
      );

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeConversation.id) return c;
          return {
            ...c,
            suggestions: [],
            updatedAt: now,
            messages: [...precedingHistory, assistantPlaceholder],
          };
        })
      );

      void runAssistantStream(
        activeConversation.id,
        precedingHistory,
        assistantPlaceholder.id,
        activeConversation.model,
        persona,
        false
      );
    },
    [activeConversation, customPersonas, isStreaming, runAssistantStream]
  );

  // DELETE: Delete an individual message
  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!activeId) return;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          return {
            ...c,
            updatedAt: Date.now(),
            messages: c.messages.filter((m) => m.id !== messageId),
          };
        })
      );
    },
    [activeId]
  );

  // DELETE: Delete an entire conversation
  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (streamingConvId === id) {
        stopStreaming();
      }
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (activeId === id) {
          setActiveId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
    },
    [activeId, stopStreaming, streamingConvId]
  );

  // DELETE: Clear all conversations
  const handleClearAllConversations = useCallback(() => {
    stopStreaming();
    setConversations([]);
    setActiveId(null);
  }, [stopStreaming]);

  const handleExportAllJson = useCallback(() => {
    exportConversationsJson(conversations);
  }, [conversations]);

  // IMPORT: Merge conversations from JSON backup file
  const handleImportConversationsFile = useCallback(async (file: File) => {
    try {
      const rawText = await file.text();
      const imported = parseImportedConversationsJson(rawText);
      setConversations((prev) => {
        const byId = new Map<string, Conversation>();
        for (const c of prev) byId.set(c.id, c);
        for (const c of imported) byId.set(c.id, c);
        return Array.from(byId.values()).sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
      });
      if (imported[0]) {
        setActiveId(imported[0].id);
      }
      setStatusBanner({
        tone: "info",
        text: `Imported ${imported.length} ${
          imported.length === 1 ? "conversation" : "conversations"
        } from backup.`,
      });
    } catch (err) {
      setStatusBanner({
        tone: "warning",
        text:
          err instanceof Error
            ? err.message
            : "Could not read JSON backup file.",
      });
    }
  }, []);

  // Stable UI callbacks for memoized children
  const handleCloseMobileSidebar = useCallback(() => {
    setIsSidebarOpenMobile(false);
  }, []);

  const handleToggleDesktopSidebar = useCallback(() => {
    setIsSidebarOpenDesktop((v) => !v);
  }, []);

  const handleOpenPersonaModal = useCallback(() => {
    setIsPersonaModalOpen(true);
  }, []);

  const handleClosePersonaModal = useCallback(() => {
    setIsPersonaModalOpen(false);
  }, []);

  const handleAddAttachments = useCallback((items: ChatAttachment[]) => {
    setPendingAttachments((prev) => [...prev, ...items]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleClearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  // Workspace Drag & Drop for Multimodal Attachments
  const handleWorkspaceDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);

    if (isStreaming) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const remaining = 4 - pendingAttachments.length;
    if (remaining <= 0) {
      setStatusBanner({
        tone: "warning",
        text: "You can attach up to 4 files per message.",
      });
      return;
    }

    const processed: ChatAttachment[] = [];
    for (const file of files.slice(0, remaining)) {
      try {
        const att = await processUploadedFile(file);
        processed.push(att);
      } catch (err) {
        setStatusBanner({
          tone: "warning",
          text: err instanceof Error ? err.message : "Could not attach file.",
        });
      }
    }

    if (processed.length > 0) {
      setPendingAttachments((prev) => [...prev, ...processed]);
    }
  };

  const startHeaderRename = () => {
    if (!activeConversation) return;
    setHeaderTitleDraft(activeConversation.title);
    setIsRenamingHeader(true);
  };

  const commitHeaderRename = () => {
    if (activeConversation && headerTitleDraft.trim()) {
      handleRenameConversation(activeConversation.id, headerTitleDraft.trim());
    }
    setIsRenamingHeader(false);
  };

  return (
    <div
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          dragDepthRef.current += 1;
          setIsDraggingFiles(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setIsDraggingFiles(false);
          }
        }
      }}
      onDrop={(e) => void handleWorkspaceDrop(e)}
      className="relative flex h-dvh w-full max-w-full overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      {/* Drag & Drop File Overlay */}
      {isDraggingFiles && (
        <div className="pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-600 bg-zinc-50/90 p-4 text-center backdrop-blur-xs dark:border-teal-400 dark:bg-zinc-950/90">
          <Paperclip className="h-8 w-8 text-teal-700 dark:text-teal-400" />
          <p className="mt-2 font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Drop images or code/text files to attach
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Up to 4 attachments per message
          </p>
        </div>
      )}

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpenDesktop={isSidebarOpenDesktop}
        isOpenMobile={isSidebarOpenMobile}
        searchInputRef={searchInputRef}
        onCloseMobile={handleCloseMobileSidebar}
        onToggleDesktop={handleToggleDesktopSidebar}
        onSelectConversation={setActiveId}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onTogglePinConversation={handleTogglePinConversation}
        onToggleBookmarkMessage={handleToggleBookmarkMessage}
        onDeleteConversation={handleDeleteConversation}
        onClearAllConversations={handleClearAllConversations}
        onExportConversations={handleExportAllJson}
        onImportConversationsFile={handleImportConversationsFile}
      />

      {/* Main Chat Workspace */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Workspace Header (56px compact height across viewports) */}
        <header className="pt-safe flex min-h-[56px] shrink-0 items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/90 px-3 backdrop-blur-xs sm:gap-4 sm:px-6 dark:border-zinc-800/90 dark:bg-zinc-950/90">
          {/* Left: Sidebar Toggle + Active Conversation Title */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setIsSidebarOpenMobile(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 transition-colors duration-150 hover:bg-zinc-200/70 hover:text-zinc-900 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 shrink-0"
              aria-label="Open conversation history"
            >
              <Menu className="h-5 w-5" />
            </button>

            {!isSidebarOpenDesktop && (
              <button
                type="button"
                onClick={() => setIsSidebarOpenDesktop(true)}
                className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 lg:flex dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 shrink-0"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            {activeConversation ? (
              isRenamingHeader ? (
                <div className="flex min-w-0 flex-1 max-w-xs items-center gap-1 rounded-xl border border-zinc-300 bg-white px-2.5 py-1 sm:max-w-md sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <input
                    type="text"
                    value={headerTitleDraft}
                    onChange={(e) => setHeaderTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitHeaderRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsRenamingHeader(false);
                      }
                    }}
                    autoFocus
                    maxLength={80}
                    aria-label="Edit conversation title"
                    className="min-w-0 flex-1 bg-transparent text-base font-medium text-zinc-900 focus:outline-none sm:text-sm dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={commitHeaderRename}
                    className="flex h-7 w-7 items-center justify-center rounded text-emerald-600 hover:bg-zinc-100 dark:text-emerald-400 dark:hover:bg-zinc-800 shrink-0"
                    aria-label="Save title"
                  >
                    <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenamingHeader(false)}
                    className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 shrink-0"
                    aria-label="Cancel rename"
                  >
                    <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={startHeaderRename}
                    className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors duration-150 hover:bg-zinc-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:px-2 dark:hover:bg-zinc-800/70"
                    title="Tap or click to rename conversation"
                  >
                    <span className="truncate font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {activeConversation.title}
                    </span>
                    <Pencil className="h-3 w-3 shrink-0 text-zinc-400 opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                  </button>
                  <span className="hidden text-xs text-zinc-400 md:inline dark:text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
                    · {activePersona.name} · {activeConversation.messages.length}{" "}
                    {activeConversation.messages.length === 1 ? "msg" : "msgs"}
                  </span>
                </div>
              )
            ) : (
              <span className="truncate font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Lumina Chat
              </span>
            )}
          </div>

          {/* Right: Markdown Export + Theme Switch + New Chat */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {activeConversation && activeConversation.messages.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  exportConversationMarkdown(
                    activeConversation,
                    activePersona.name
                  )
                }
                className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:h-9 sm:w-auto sm:rounded-lg sm:px-3 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 whitespace-nowrap shrink-0"
                title="Download conversation as Markdown (.md)"
                aria-label="Download conversation as Markdown"
              >
                <FileDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Export .md</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setTheme((prev) => (prev === "dark" ? "light" : "dark"))
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 sm:h-9 sm:w-9 sm:rounded-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 shrink-0"
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              title={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white transition-all duration-150 hover:bg-zinc-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:h-9 sm:rounded-lg sm:px-3.5 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
              aria-label="Start new chat"
            >
              <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden min-[380px]:inline">New Chat</span>
            </button>
          </div>
        </header>

        {/* Status / Storage Banner */}
        {statusBanner && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-xs sm:px-6 ${
              statusBanner.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-teal-200 bg-teal-50/80 text-teal-900 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-200"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              {statusBanner.tone === "warning" && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <span className="[overflow-wrap:anywhere]">
                {statusBanner.text}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Messages Stream / Empty State */}
        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
        >
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <EmptyState
              selectedPersonaId={currentPersonaId}
              customPersonas={customPersonas}
              onSelectPersona={handleSelectPersona}
              onOpenPersonaModal={handleOpenPersonaModal}
              onSelectPrompt={handleSelectStarterPrompt}
            />
          ) : (
            <div className="mx-auto w-full max-w-3xl flex-1 divide-y divide-zinc-100 px-3 py-3 sm:px-6 sm:py-4 2xl:max-w-4xl dark:divide-zinc-900/80">
              {activeConversation.messages.map((msg) => {
                const isMsgStreaming =
                  streamingConvId === activeConversation.id &&
                  streamingMsgId === msg.id;
                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    streamingContent={isMsgStreaming ? streamingText : undefined}
                    isStreamingThisMessage={isMsgStreaming}
                    isBusy={isStreaming}
                    onEditMessage={handleEditMessage}
                    onToggleBookmark={handleToggleActiveMessageBookmark}
                    onDeleteMessage={handleDeleteMessage}
                    onRegenerateFromMessage={handleRegenerateFromMessage}
                  />
                );
              })}

              {/* Contextual Follow-Up Prompt Suggestions */}
              {!isStreaming &&
                activeConversation.suggestions &&
                activeConversation.suggestions.length > 0 && (
                  <div className="pt-3.5 pb-2 sm:pl-10">
                    <div className="mb-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                      Suggested follow-ups
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeConversation.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSendMessage(suggestion)}
                          className="group inline-flex min-h-[38px] max-w-full items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-100/80 active:scale-[0.99] sm:min-h-0 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          <span className="[overflow-wrap:anywhere]">
                            {suggestion}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </main>

        {/* Floating Scroll-to-Bottom Button */}
        {showScrollBottom &&
          activeConversation &&
          activeConversation.messages.length > 0 && (
            <div className="pointer-events-none absolute right-0 bottom-28 left-0 flex justify-center sm:bottom-32">
              <button
                type="button"
                onClick={scrollToBottomSmooth}
                className="pointer-events-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-zinc-200 bg-white/95 px-3.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur-xs transition-colors duration-150 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
                aria-label="Scroll to latest message"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span>Latest</span>
              </button>
            </div>
          )}

        {/* Message Composer */}
        <ChatComposer
          selectedModel={currentModel}
          activePersona={activePersona}
          pendingAttachments={pendingAttachments}
          focusTriggerKey={activeId}
          onAddAttachments={handleAddAttachments}
          onRemoveAttachment={handleRemoveAttachment}
          onClearAttachments={handleClearAttachments}
          onChangeModel={handleChangeModel}
          onOpenPersonaModal={handleOpenPersonaModal}
          onComposerFocus={handleComposerFocus}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onStopStreaming={stopStreaming}
        />
      </div>

      {/* Custom Persona Studio Modal */}
      <PersonaModal
        isOpen={isPersonaModalOpen}
        selectedPersonaId={currentPersonaId}
        customPersonas={customPersonas}
        onClose={handleClosePersonaModal}
        onSelectPersona={handleSelectPersona}
        onSaveCustomPersona={handleSaveCustomPersona}
        onDeleteCustomPersona={handleDeleteCustomPersona}
      />
    </div>
  );
}

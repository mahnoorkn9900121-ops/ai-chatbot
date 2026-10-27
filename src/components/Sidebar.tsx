import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Conversation } from "../types/chat";
import {
  Bookmark,
  Check,
  Download,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpenDesktop: boolean;
  isOpenMobile: boolean;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onCloseMobile: () => void;
  onToggleDesktop: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onTogglePinConversation: (id: string) => void;
  onToggleBookmarkMessage: (conversationId: string, messageId: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearAllConversations: () => void;
  onExportConversations: () => void;
  onImportConversationsFile: (file: File) => void;
}

function formatRelativeGroup(
  timestamp: number
): "Today" | "Previous 7 Days" | "Earlier" {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  if (timestamp >= startOfToday) return "Today";
  const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;
  if (timestamp >= sevenDaysAgo) return "Previous 7 Days";
  return "Earlier";
}

export const Sidebar = memo(function Sidebar({
  conversations,
  activeId,
  isOpenDesktop,
  isOpenMobile,
  searchInputRef,
  onCloseMobile,
  onToggleDesktop,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onTogglePinConversation,
  onToggleBookmarkMessage,
  onDeleteConversation,
  onClearAllConversations,
  onExportConversations,
  onImportConversationsFile,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [activeTab, setActiveTab] = useState<"chats" | "saved">("chats");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!isOpenMobile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseMobile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpenMobile, onCloseMobile]);

  const filteredConversations = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      if (conv.title.toLowerCase().includes(q)) return true;
      return conv.messages.some((m) => m.content.toLowerCase().includes(q));
    });
  }, [conversations, deferredSearchQuery]);

  const savedBookmarks = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const list: {
      conversationId: string;
      conversationTitle: string;
      messageId: string;
      role: "user" | "model";
      content: string;
      createdAt: number;
    }[] = [];

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (!msg.bookmarked) continue;
        if (
          q &&
          !msg.content.toLowerCase().includes(q) &&
          !conv.title.toLowerCase().includes(q)
        ) {
          continue;
        }
        list.push({
          conversationId: conv.id,
          conversationTitle: conv.title,
          messageId: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [conversations, deferredSearchQuery]);

  const totalSavedCount = useMemo(
    () =>
      conversations.reduce(
        (acc, c) => acc + c.messages.filter((m) => m.bookmarked).length,
        0
      ),
    [conversations]
  );

  const grouped = useMemo(() => {
    const pinned: Conversation[] = [];
    const today: Conversation[] = [];
    const week: Conversation[] = [];
    const earlier: Conversation[] = [];

    for (const conv of filteredConversations) {
      if (conv.pinned) {
        pinned.push(conv);
        continue;
      }
      const bucket = formatRelativeGroup(conv.updatedAt);
      if (bucket === "Today") today.push(conv);
      else if (bucket === "Previous 7 Days") week.push(conv);
      else earlier.push(conv);
    }

    return [
      { label: "Pinned", items: pinned },
      { label: "Today", items: today },
      { label: "Previous 7 Days", items: week },
      { label: "Earlier", items: earlier },
    ].filter((section) => section.items.length > 0);
  }, [filteredConversations]);

  const startRename = (conv: Conversation) => {
    setConfirmDeleteId(null);
    setEditingId(conv.id);
    setEditDraft(conv.title);
  };

  const commitRename = (id: string) => {
    const trimmed = editDraft.trim();
    if (trimmed) {
      onRenameConversation(id, trimmed);
    }
    setEditingId(null);
    setEditDraft("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const renderConversationRow = (conv: Conversation) => {
    const isActive = conv.id === activeId;
    const isEditing = editingId === conv.id;
    const isConfirmingDelete = confirmDeleteId === conv.id;

    if (isEditing) {
      return (
        <div
          key={conv.id}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-2.5 py-1.5 sm:rounded-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <input
            type="text"
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename(conv.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            autoFocus
            maxLength={80}
            aria-label="Conversation title"
            className="min-w-0 flex-1 bg-transparent text-base text-zinc-900 focus:outline-none sm:text-sm dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => commitRename(conv.id)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-zinc-100 sm:h-7 sm:w-7 dark:text-emerald-400 dark:hover:bg-zinc-800 shrink-0"
            title="Save title"
            aria-label="Save title"
          >
            <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelRename}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 sm:h-7 sm:w-7 dark:text-zinc-400 dark:hover:bg-zinc-800 shrink-0"
            title="Cancel rename"
            aria-label="Cancel rename"
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>
      );
    }

    if (isConfirmingDelete) {
      return (
        <div
          key={conv.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-xs sm:rounded-lg dark:border-red-900/60 dark:bg-red-950/30"
        >
          <span className="truncate font-medium text-red-800 dark:text-red-300">
            Delete chat?
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onDeleteConversation(conv.id);
                setConfirmDeleteId(null);
              }}
              className="min-h-[34px] rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 sm:min-h-0 whitespace-nowrap shrink-0"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="min-h-[34px] rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 sm:min-h-0 dark:text-zinc-300 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={conv.id}
        className={`group relative flex min-h-[46px] items-center justify-between gap-1 rounded-xl px-2.5 py-2 transition-colors sm:min-h-0 sm:rounded-lg ${
          isActive
            ? "bg-zinc-200/80 text-zinc-950 dark:bg-zinc-800/90 dark:text-zinc-50"
            : "text-zinc-700 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            onSelectConversation(conv.id);
            onCloseMobile();
          }}
          onDoubleClick={() => startRename(conv)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-snug">
              {conv.title}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span>
                {conv.messages.length}{" "}
                {conv.messages.length === 1 ? "msg" : "msgs"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {new Date(conv.updatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </button>

        <div
          className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
            isActive
              ? "opacity-100"
              : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinConversation(conv.id);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-zinc-300/60 sm:h-7 sm:w-7 sm:rounded-md dark:hover:bg-zinc-700/70 ${
              conv.pinned
                ? "text-teal-700 dark:text-teal-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
            title={conv.pinned ? "Unpin chat" : "Pin chat"}
            aria-label={conv.pinned ? "Unpin chat" : "Pin chat"}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startRename(conv);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-300/60 hover:text-zinc-900 sm:h-7 sm:w-7 sm:rounded-md dark:text-zinc-400 dark:hover:bg-zinc-700/70 dark:hover:text-zinc-100"
            title="Rename chat"
            aria-label="Rename chat"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingId(null);
              setConfirmDeleteId(conv.id);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-100 hover:text-red-600 sm:h-7 sm:w-7 sm:rounded-md dark:text-zinc-400 dark:hover:bg-red-950/60 dark:hover:text-red-400"
            title="Delete chat"
            aria-label="Delete chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderSidebarInner = (attachSearchRef: boolean) => (
    <div className="pt-safe flex h-full flex-col bg-zinc-100/95 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {/* Top Sidebar Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2.5">
        <span className="font-display text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 whitespace-nowrap shrink-0">
          Lumina Chat
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleDesktop}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 lg:flex dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* New Chat Action + Search + View Switcher */}
      <div className="space-y-2.5 px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 sm:min-h-0 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
          <input
            ref={attachSearchRef ? searchInputRef : undefined}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search conversations"
            className="w-full rounded-xl border border-zinc-200/90 bg-white py-2 pr-8 pl-8 text-base text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-zinc-400 focus:outline-none sm:rounded-lg sm:py-1.5 sm:text-xs dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Segmented Filter Control: Chats vs Saved Bookmarks */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-200/70 p-0.5 sm:rounded-lg dark:bg-zinc-800/90">
          <button
            type="button"
            onClick={() => setActiveTab("chats")}
            className={`min-h-[34px] rounded-lg py-1 text-xs font-medium transition-colors sm:min-h-0 sm:rounded-md whitespace-nowrap shrink-0 ${
              activeTab === "chats"
                ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Chats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("saved")}
            className={`min-h-[34px] rounded-lg py-1 text-xs font-medium transition-colors sm:min-h-0 sm:rounded-md whitespace-nowrap shrink-0 tabular-nums ${
              activeTab === "saved"
                ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Saved {totalSavedCount > 0 ? `(${totalSavedCount})` : ""}
          </button>
        </div>
      </div>

      {/* Main List Body */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1">
        {activeTab === "saved" ? (
          savedBookmarks.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                No saved messages yet
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Bookmark important answers or snippets in any chat to access them quickly here.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 pb-4">
              {savedBookmarks.map((item) => (
                <div
                  key={item.messageId}
                  className="group rounded-xl border border-zinc-200/80 bg-white/80 p-2.5 transition-colors hover:border-zinc-300 sm:rounded-lg dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      {item.conversationTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onToggleBookmarkMessage(
                          item.conversationId,
                          item.messageId
                        )
                      }
                      className="flex h-7 w-7 items-center justify-center rounded text-teal-700 hover:bg-zinc-100 dark:text-teal-400 dark:hover:bg-zinc-800 shrink-0"
                      title="Remove bookmark"
                      aria-label="Remove bookmark"
                    >
                      <Bookmark className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(item.conversationId);
                      onCloseMobile();
                    }}
                    className="mt-1 block w-full text-left"
                  >
                    <p className="line-clamp-3 text-xs leading-relaxed text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-200">
                      {item.content || "Attached file"}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          )
        ) : conversations.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              No saved chats yet
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              Send a message or import a JSON backup to get started.
            </p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No conversations match &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {grouped.map((section) => (
              <div key={section.label}>
                <div className="px-2.5 pb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map(renderConversationRow)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden JSON Backup Import Input */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onImportConversationsFile(file);
          }
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Sidebar Storage Footer */}
      <div className="pb-safe border-t border-zinc-200/80 px-3 pt-3 sm:py-3 dark:border-zinc-800">
        {confirmClearAll ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/80 px-2.5 py-2 text-xs sm:rounded-lg dark:border-red-900/60 dark:bg-red-950/40">
            <span className="font-medium text-red-800 dark:text-red-300">
              Clear all chats?
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClearAllConversations();
                  setConfirmClearAll(false);
                }}
                className="min-h-[34px] rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 sm:min-h-0 whitespace-nowrap shrink-0"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[34px] rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200/70 sm:min-h-0 dark:text-zinc-300 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {conversations.length}{" "}
              {conversations.length === 1 ? "chat" : "chats"}
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => importFileInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 sm:h-8 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 whitespace-nowrap shrink-0"
                title="Import conversations from JSON backup"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import</span>
              </button>
              {conversations.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={onExportConversations}
                    className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900 sm:h-8 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 whitespace-nowrap shrink-0"
                    title="Export chat history as JSON"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-red-100 hover:text-red-700 sm:h-8 dark:text-zinc-400 dark:hover:bg-red-950/50 dark:hover:text-red-400 whitespace-nowrap shrink-0"
                    title="Delete all stored conversations"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Sidebar */}
      <aside
        aria-label="Conversation history"
        className={`hidden shrink-0 border-r border-zinc-200/90 dark:border-zinc-800 lg:block ${
          isOpenDesktop ? "w-[280px] xl:w-[296px]" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        {isOpenDesktop && renderSidebarInner(true)}
      </aside>

      {/* Smooth Mobile & Tablet Slide-Over Drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          isOpenMobile ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!isOpenMobile}
      >
        {/* Backdrop */}
        <div
          onClick={onCloseMobile}
          className={`fixed inset-0 bg-black/50 backdrop-blur-[1px] transition-opacity duration-200 ${
            isOpenMobile ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Slide-Over Panel (compositor-only transform transition) */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat history navigation"
          className={`relative z-10 flex h-full w-[292px] max-w-[85vw] flex-col border-r border-zinc-200 shadow-2xl transition-transform duration-200 ease-out dark:border-zinc-800 ${
            isOpenMobile ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderSidebarInner(!isOpenDesktop)}
        </div>
      </div>
    </>
  );
});

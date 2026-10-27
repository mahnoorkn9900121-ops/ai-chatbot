# Lumina Chat — AI Chatbot with Google Gemini & Local Storage

A minimal, fast, responsive AI chatbot application powered by the free-tier **Google Gemini API** (`@google/genai`) on the server and **Browser Local Storage** on the client for persistent full-CRUD conversation management.

---

## Features

- **Real-Time Streaming AI Responses:** Server-side streaming via Server-Sent Events (`/api/chat`) using `@google/genai` (`gemini-3.8-flash` and `gemini-3.1-flash-lite`).
- **Secure API Architecture:** `GEMINI_API_KEY` stays strictly on the server and is never exposed in client bundles.
- **Persistent Browser Local Storage (No Database Required):** Conversations, active thread state, and theme preference persist across page refreshes and browser restarts.
- **Full CRUD Operations:**
  - **Create:** Start new chats, use starter prompts, and send messages.
  - **Read:** Browse grouped chat history (`Pinned`, `Today`, `Previous 7 Days`, `Earlier`) and search across titles and message contents.
  - **Update:** Rename conversations inline (in sidebar or header), pin/unpin threads, edit existing messages (`Save Only` or `Save & Regenerate`), and regenerate assistant responses.
  - **Delete:** Delete individual messages, delete individual conversations, or clear all stored history (plus optional JSON backup export).
- **Responsive Minimal UI:** Works across mobile phones, tablets, laptops, and desktop screens with Light and Dark themes.
- **Graceful Error Handling:** Handles empty messages, rate limits (`429`), authentication issues, network drops, and stream cancellation (`Stop`).

---

## Project Structure

```text
├── .env.example                 # Environment variable template (no real secrets)
├── index.html                   # App HTML entry & typography links
├── metadata.json                # Application metadata
├── package.json                 # Scripts & dependencies
├── server.ts                    # Server-side API routes (/api/chat, /api/chat/title)
├── src/
│   ├── App.tsx                  # Main chat state & full CRUD orchestration
│   ├── index.css                # Tailwind CSS configuration & theme styles
│   ├── main.tsx                 # Client React entry point
│   ├── components/
│   │   ├── ChatComposer.tsx     # Auto-expanding prompt input, model selector & stop/send
│   │   ├── EmptyState.tsx       # Welcome view & starter prompts
│   │   ├── MarkdownRenderer.tsx # Markdown, GFM tables & copyable code blocks
│   │   ├── MessageItem.tsx      # Message bubble, inline editor, retry & delete controls
│   │   └── Sidebar.tsx          # Responsive drawer/sidebar, search, pin, rename & delete
│   ├── lib/
│   │   ├── api.ts               # SSE stream reader & typed error handling
│   │   └── storage.ts           # Safe Browser Local Storage CRUD helpers
│   └── types/
│       └── chat.ts              # Shared TypeScript interfaces
└── vite.config.ts               # Build configuration
```

---

## Getting a Free-Tier Google Gemini API Key

1. Visit **[Google AI Studio](https://aistudio.google.com/apikey)** and sign in with your Google account.
2. Click **Create API Key** and select a new or existing Google Cloud project (no billing account is required for the free tier).
3. Copy the generated API key.

---

## Local Installation & Setup

### Prerequisites

- **Node.js** `v20+` (or `v22+` recommended)
- **npm** `v10+`

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Your Environment Variable

Create a `.env.local` file in the project root by copying `.env.example`:

```bash
cp .env.example .env.local
```

Open `.env.local` and set your Gemini API key:

```env
GEMINI_API_KEY="your_actual_gemini_api_key"
```

*(Note: `.env.local` is ignored by Git so your key is never committed to version control.)*

### 3. Run in Development Mode

```bash
npm run dev
```

Open **`http://localhost:3000`** in your browser.

### 4. Production Build & Start

```bash
npm run build
npm start
```

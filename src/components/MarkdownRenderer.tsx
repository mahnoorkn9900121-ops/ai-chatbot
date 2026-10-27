import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  return (
    <div className="my-3.5 max-w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 text-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-400 sm:px-3.5">
        <span className="truncate font-mono lowercase">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 whitespace-nowrap shrink-0"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="max-w-full overflow-x-auto p-3 sm:p-3.5">
        <pre className="font-mono text-xs leading-relaxed text-zinc-100 sm:text-[13px]">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="min-w-0 max-w-full text-[15px] leading-7 text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-200 dark:tracking-[0.005em]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children }) {
            return <p className="mb-3.5 last:mb-0">{children}</p>;
          },
          h1({ children }) {
            return (
              <h1 className="mt-5 mb-2.5 text-lg font-semibold tracking-tight text-zinc-900 first:mt-0 sm:mt-6 sm:mb-3 sm:text-xl dark:text-zinc-50">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mt-4 mb-2 text-base font-semibold tracking-tight text-zinc-900 first:mt-0 sm:mt-5 sm:mb-2.5 sm:text-lg dark:text-zinc-50">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mt-4 mb-1.5 text-[15px] font-semibold text-zinc-900 first:mt-0 sm:text-base dark:text-zinc-100">
                {children}
              </h3>
            );
          },
          ul({ children }) {
            return (
              <ul className="mb-3.5 list-disc space-y-1.5 pl-5 last:mb-0 marker:text-zinc-400 dark:marker:text-zinc-500">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="mb-3.5 list-decimal space-y-1.5 pl-5 last:mb-0 marker:text-zinc-500 dark:marker:text-zinc-400 tabular-nums">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="pl-1">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3.5 rounded-lg border border-zinc-200/90 bg-zinc-100/70 px-3.5 py-2.5 text-zinc-700 italic sm:px-4 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-700 underline decoration-teal-700/40 underline-offset-2 transition-colors hover:text-teal-800 [overflow-wrap:anywhere] dark:text-teal-400 dark:decoration-teal-400/40 dark:hover:text-teal-300"
              >
                {children}
              </a>
            );
          },
          hr() {
            return <hr className="my-5 border-zinc-200 dark:border-zinc-800" />;
          },
          table({ children }) {
            return (
              <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-left text-xs sm:text-sm tabular-nums">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="border-b border-zinc-200 bg-zinc-100/80 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 font-semibold sm:px-3.5 sm:py-2.5">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-t border-zinc-200/70 px-3 py-2 text-zinc-700 sm:px-3.5 dark:border-zinc-800/80 dark:text-zinc-300">
                {children}
              </td>
            );
          },
          code({ className, children, ...props }) {
            const rawText = String(children).replace(/\n$/, "");
            const match = /language-([\w-]+)/.exec(className || "");
            const isBlock = Boolean(match) || rawText.includes("\n");

            if (isBlock) {
              return <CodeBlock language={match?.[1] ?? ""} code={rawText} />;
            }

            return (
              <code
                className="rounded-md border border-zinc-200/80 bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-900 [overflow-wrap:anywhere] sm:text-[13px] dark:border-zinc-800 dark:bg-zinc-800/90 dark:text-zinc-100"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

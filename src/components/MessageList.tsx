import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  RotateCcw,
} from "lucide-react";
import type { ChatMode, Message } from "../types/chat";
import { formatTimestamp } from "../utils/format";
import { MessageContent } from "./MessageContent";

interface MessageListProps {
  conversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  loadingMode: ChatMode;
  error: string | null;
  onRetry: () => void;
  onDismissError: () => void;
  onSelectPrompt: (prompt: string, mode?: ChatMode) => void;
}

const STARTER_PROMPTS: Array<{
  title: string;
  prompt: string;
  mode: ChatMode;
}> = [
  {
    title: "Explain simply",
    prompt: "Explain how async/await works in JavaScript with a short example.",
    mode: "chat",
  },
  {
    title: "Draft a message",
    prompt: "Help me write a polite follow-up email after a project meeting.",
    mode: "chat",
  },
  {
    title: "Generate an image",
    prompt:
      "A sunlit minimalist wooden desk with a laptop, warm ceramic coffee mug, and small indoor plant.",
    mode: "image",
  },
  {
    title: "Brainstorm ideas",
    prompt: "Suggest 5 simple weekend project ideas I can build with React.",
    mode: "chat",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-[32px] items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      aria-label="Copy message"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function GeneratedImageCard({
  imageUrl,
  altText,
}: {
  imageUrl: string;
  altText: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 px-4 text-center text-xs text-zinc-500">
        Unable to display generated image.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
      <img
        src={imageUrl}
        alt={altText}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="block max-h-[420px] w-full object-contain"
      />
    </div>
  );
}

export function MessageList({
  conversationId,
  messages,
  isLoading,
  loadingMode,
  error,
  onRetry,
  onDismissError,
  onSelectPrompt,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevLengthRef = useRef(messages.length);
  const [showScrollDown, setShowScrollDown] = useState(false);

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowScrollDown(false);
    prevLengthRef.current = messages.length;
  }, [conversationId]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 96;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom && el.scrollHeight > el.clientHeight + 120);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    isNearBottomRef.current = true;
    setShowScrollDown(false);
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const grewWithUserMessage =
      messages.length > prevLengthRef.current && last?.role === "user";
    prevLengthRef.current = messages.length;

    if (grewWithUserMessage) {
      isNearBottomRef.current = true;
      setShowScrollDown(false);
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }

    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({
        behavior: isLoading ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [messages, isLoading, error]);

  if (messages.length === 0 && !isLoading && !error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-6 sm:py-12">
        <div className="w-full max-w-2xl">
          <div className="mx-auto max-w-md text-center">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl text-balance">
              How can I help today?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Chat, ask follow-up questions, or switch to{" "}
              <strong className="font-medium text-zinc-700">
                Generate Image
              </strong>{" "}
              to create visuals.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {STARTER_PROMPTS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onSelectPrompt(item.prompt, item.mode)}
                className="flex min-h-[48px] flex-col items-start justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                  {item.mode === "image" && (
                    <ImageIcon className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                  )}
                  <span>{item.title}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                  {item.prompt}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const lastMessage = messages[messages.length - 1];
  const showWaitingIndicator =
    isLoading &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      (lastMessage.text === "" && !lastMessage.imageUrl));

  const lastModelIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (
        messages[i].role === "model" &&
        (messages[i].text.trim().length > 0 || Boolean(messages[i].imageUrl))
      ) {
        return i;
      }
    }
    return -1;
  })();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
          {messages.map((msg, index) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex min-w-0 flex-col items-end">
                  <div className="max-w-[88%] min-w-0 rounded-2xl bg-zinc-900 px-4 py-3 text-[15px] leading-relaxed text-white sm:max-w-[75%]">
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {msg.text}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-zinc-400 tabular-nums">
                    {msg.mode === "image" && (
                      <>
                        <span>Image prompt</span>
                        {msg.imageAspectRatio && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{msg.imageAspectRatio}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{formatTimestamp(msg.createdAt)}</span>
                  </div>
                </div>
              );
            }

            if (msg.text === "" && !msg.imageUrl && isLoading) {
              return null;
            }

            const isLatestModel = index === lastModelIndex;

            return (
              <div key={msg.id} className="group flex min-w-0 flex-col items-start">
                <div className="w-full min-w-0 max-w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 sm:px-5 sm:py-4">
                  {msg.imageUrl && (
                    <GeneratedImageCard
                      imageUrl={msg.imageUrl}
                      altText={msg.text || "Generated image"}
                    />
                  )}
                  {msg.text && (
                    <div className={msg.imageUrl ? "mt-3" : ""}>
                      <MessageContent text={msg.text} />
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                  <span className="mr-1 text-xs text-zinc-400 tabular-nums">
                    {formatTimestamp(msg.createdAt)}
                  </span>
                  {msg.imageUrl && !isLoading && (
                    <a
                      href={msg.imageUrl}
                      download={`gemini-image-${msg.createdAt}.png`}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      aria-label="Download image"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Download</span>
                    </a>
                  )}
                  {msg.text && !isLoading && <CopyButton text={msg.text} />}
                  {isLatestModel && !isLoading && !error && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      aria-label="Regenerate response"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {showWaitingIndicator && (
            <div role="status" aria-live="polite" className="flex items-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 text-sm text-zinc-500">
                <span>
                  {loadingMode === "image"
                    ? "Generating image"
                    : "Generating response"}
                </span>
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:150ms] motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:300ms] motion-reduce:animate-none" />
                </span>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 whitespace-nowrap sm:h-8"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  onClick={onDismissError}
                  className="inline-flex h-9 items-center rounded-md px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 whitespace-nowrap sm:h-8"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {showScrollDown && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Scroll to latest message"
          className="absolute right-4 bottom-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:right-6"
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

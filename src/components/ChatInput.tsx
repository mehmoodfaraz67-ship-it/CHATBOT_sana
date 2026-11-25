import { useEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Image as ImageIcon, MessageSquare, Square } from "lucide-react";
import type { ChatMode, ImageAspectRatio } from "../types/chat";

interface ChatInputProps {
  value: string;
  mode: ChatMode;
  aspectRatio: ImageAspectRatio;
  onChange: (value: string) => void;
  onModeChange: (mode: ChatMode) => void;
  onAspectRatioChange: (ratio: ImageAspectRatio) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
}

const ASPECT_RATIOS: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3"];

export function ChatInput({
  value,
  mode,
  aspectRatio,
  onChange,
  onModeChange,
  onAspectRatioChange,
  onSend,
  onStop,
  isLoading,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSend();
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) {
      onStop();
      return;
    }
    if (value.trim()) {
      onSend();
    }
  };

  const canSend = value.trim().length > 0;
  const isImageMode = mode === "image";

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-3 sm:pb-4">
      <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Response mode"
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1"
        >
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onModeChange("chat")}
            aria-pressed={!isImageMode}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
              !isImageMode
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              onModeChange("image");
              textareaRef.current?.focus();
            }}
            aria-pressed={isImageMode}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
              isImageMode
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Generate Image</span>
          </button>
        </div>

        {isImageMode && (
          <div
            role="group"
            aria-label="Image aspect ratio"
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                disabled={isLoading}
                onClick={() => onAspectRatioChange(ratio)}
                aria-pressed={aspectRatio === ratio}
                className={`min-h-[32px] rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
                  aspectRatio === ratio
                    ? "bg-white text-zinc-950 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-950"
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border border-zinc-300 bg-white p-2 transition-colors focus-within:border-zinc-900"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isImageMode
              ? "Describe the image to generate..."
              : "Message Gemini..."
          }
          aria-label={isImageMode ? "Image prompt input" : "Message input"}
          className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-normal text-zinc-950 placeholder:text-zinc-400 focus:outline-none sm:min-h-[40px] sm:py-2 sm:text-[15px]"
        />

        {isLoading ? (
          <button
            type="submit"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:h-10 sm:w-10"
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 sm:h-10 sm:w-10"
            aria-label={isImageMode ? "Generate image" : "Send message"}
            title={isImageMode ? "Generate image" : "Send message"}
          >
            {isImageMode ? (
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </form>
      <p className="mx-auto mt-2 hidden max-w-3xl text-center text-xs text-zinc-400 sm:block">
        Press Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export const maxDuration = 30;

const PRIMARY_MODEL = "gemini-4-hydrogen";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const MAX_CONTEXT_MESSAGES = 16;

interface ChatMessageInput {
  role: "user" | "model";
  text: string;
}

let cachedClient: { apiKey: string; client: GoogleGenAI } | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please add GEMINI_API_KEY in Settings > Secrets or Vercel Environment Variables."
    );
  }
  if (cachedClient && cachedClient.apiKey === apiKey) {
    return cachedClient.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
  cachedClient = { apiKey, client };
  return client;
}

function extractReadableErrorMessage(raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 3; i++) {
    if (!current.startsWith("{")) break;
    try {
      const parsed = JSON.parse(current) as Record<string, unknown>;
      if (parsed.error && typeof parsed.error === "object") {
        const inner = parsed.error as Record<string, unknown>;
        if (typeof inner.message === "string") {
          current = inner.message.trim();
          continue;
        }
      }
      if (typeof parsed.message === "string") {
        current = parsed.message.trim();
        continue;
      }
    } catch {
      break;
    }
    break;
  }
  return current;
}

function parseGeminiError(err: unknown): {
  status: number;
  message: string;
  shouldFallback: boolean;
  isRateLimit?: boolean;
} {
  const rawMessage =
    err instanceof Error ? err.message : "An unexpected error occurred.";
  const readable = extractReadableErrorMessage(rawMessage);
  const lower = rawMessage.toLowerCase();

  if (
    rawMessage.includes("API_KEY_INVALID") ||
    rawMessage.includes("PERMISSION_DENIED") ||
    lower.includes("gemini api key is not configured")
  ) {
    return {
      status: 403,
      message:
        "Invalid or missing Gemini API key. Please check GEMINI_API_KEY in Settings > Secrets or Vercel Environment Variables.",
      shouldFallback: false,
    };
  }

  if (rawMessage.includes("RESOURCE_EXHAUSTED") || rawMessage.includes("429")) {
    return {
      status: 429,
      message:
        "Rate limit or quota exceeded. Please wait a moment and try again.",
      shouldFallback: true,
      isRateLimit: true,
    };
  }

  if (
    rawMessage.includes("UNAVAILABLE") ||
    rawMessage.includes("503") ||
    rawMessage.includes("high demand") ||
    rawMessage.includes("fetch failed") ||
    rawMessage.includes("ECONNRESET") ||
    rawMessage.includes("ETIMEDOUT") ||
    rawMessage.includes("socket")
  ) {
    return {
      status: 503,
      message: "Gemini is temporarily busy. Please try again in a moment.",
      shouldFallback: true,
    };
  }

  if (rawMessage.includes("NOT_FOUND") || rawMessage.includes("404")) {
    return {
      status: 404,
      message: "Requested Gemini model is unavailable.",
      shouldFallback: true,
    };
  }

  if (rawMessage.includes("INVALID_ARGUMENT")) {
    return {
      status: 400,
      message: readable || "Invalid request sent to Gemini.",
      shouldFallback: false,
    };
  }

  return {
    status: 500,
    message: readable || "Failed to generate a response from Gemini.",
    shouldFallback:
      rawMessage.includes("500") ||
      rawMessage.includes("INTERNAL") ||
      lower.includes("empty response"),
  };
}

function sanitizeMessages(rawMessages: unknown): ChatMessageInput[] {
  if (!Array.isArray(rawMessages)) return [];
  const filtered = rawMessages
    .filter((item): item is ChatMessageInput => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return (
        (candidate.role === "user" || candidate.role === "model") &&
        typeof candidate.text === "string" &&
        candidate.text.trim().length > 0
      );
    })
    .map((item) => ({
      role: item.role,
      text: item.text.trim(),
    }));

  const merged: ChatMessageInput[] = [];
  for (const msg of filtered) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      prev.text = `${prev.text}\n\n${msg.text}`;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: unknown } | null = null;
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return jsonResponse(400, { error: "Invalid JSON request body." });
  }

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse(400, {
      error: "A non-empty messages array is required.",
    });
  }

  const sanitizedMessages = sanitizeMessages(body.messages);
  if (
    sanitizedMessages.length === 0 ||
    sanitizedMessages[sanitizedMessages.length - 1].role !== "user"
  ) {
    return jsonResponse(400, {
      error: "Conversation must end with a non-empty user message.",
    });
  }

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    const { status, message } = parseGeminiError(err);
    return jsonResponse(status, { error: message });
  }

  const recentMessages = sanitizedMessages.slice(-MAX_CONTEXT_MESSAGES);
  const contents = recentMessages.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  const systemInstruction =
    "You are a fast, helpful, and concise AI assistant. Give direct, clear answers without unnecessary filler. If the user asks to generate or create an image while in text chat mode, briefly let them know they can switch to the Generate Image button below the input box.";

  const attempts = [
    {
      model: PRIMARY_MODEL,
      thinkingLevel: ThinkingLevel.LOW as ThinkingLevel | null,
      firstTokenTimeoutMs: 5500,
      delayBeforeMs: 0,
      nonStream: false,
    },
    {
      model: FALLBACK_MODEL,
      thinkingLevel: null as ThinkingLevel | null,
      firstTokenTimeoutMs: 7000,
      delayBeforeMs: 0,
      nonStream: true,
    },
    {
      model: FALLBACK_MODEL,
      thinkingLevel: null as ThinkingLevel | null,
      firstTokenTimeoutMs: 7000,
      delayBeforeMs: 200,
      nonStream: true,
    },
  ];

  const encoder = new TextEncoder();
  let activeAbortController: AbortController | null = null;

  const onRequestAbort = () => {
    activeAbortController?.abort();
  };
  request.signal.addEventListener("abort", onRequestAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueueSse = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      // Flush SSE heartbeat immediately so proxies start streaming right away
      controller.enqueue(encoder.encode(": open\n\n"));

      try {
        let lastError: unknown = null;
        let lastErrorWasRateLimit = false;
        let completed = false;
        let lastAttemptTimedOut = false;
        const rateLimitedModels = new Set<string>();

        for (let i = 0; i < attempts.length; i++) {
          if (request.signal.aborted) break;

          const attempt = attempts[i];
          if (rateLimitedModels.has(attempt.model)) {
            continue;
          }

          if (attempt.delayBeforeMs > 0 && i > 0 && !lastAttemptTimedOut) {
            await new Promise((resolve) =>
              setTimeout(resolve, attempt.delayBeforeMs)
            );
            if (request.signal.aborted) break;
          }

          const attemptController = new AbortController();
          activeAbortController = attemptController;

          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            attemptController.abort();
          }, attempt.firstTokenTimeoutMs);

          try {
            const cfg: Record<string, unknown> = {
              abortSignal: attemptController.signal,
              systemInstruction,
            };
            if (attempt.thinkingLevel) {
              cfg.thinkingConfig = { thinkingLevel: attempt.thinkingLevel };
            }

            if (attempt.nonStream) {
              const res = await ai.models.generateContent({
                model: attempt.model,
                contents,
                config: cfg,
              });
              clearTimeout(timer);
              const fullText = res.text ?? "";
              if (!fullText) {
                throw new Error("Model returned an empty response.");
              }
              if (request.signal.aborted) break;
              enqueueSse({ text: fullText });
              enqueueSse({ done: true });
              completed = true;
              break;
            }

            const geminiStream = await ai.models.generateContentStream({
              model: attempt.model,
              contents,
              config: cfg,
            });

            const iterator = geminiStream[Symbol.asyncIterator]();
            let firstText = "";

            while (true) {
              const step = await iterator.next();
              if (step.done) break;
              const text = step.value.text ?? "";
              if (text) {
                firstText = text;
                break;
              }
            }

            clearTimeout(timer);

            if (!firstText) {
              throw new Error("Model returned an empty response.");
            }

            if (request.signal.aborted) break;

            enqueueSse({ text: firstText });

            while (true) {
              if (request.signal.aborted) break;
              const step = await iterator.next();
              if (step.done) break;
              const text = step.value.text ?? "";
              if (text) {
                enqueueSse({ text });
              }
            }

            if (!request.signal.aborted) {
              enqueueSse({ done: true });
            }

            completed = true;
            break;
          } catch (err) {
            clearTimeout(timer);
            if (request.signal.aborted) break;

            if (timedOut) {
              lastAttemptTimedOut = true;
              lastError = new Error(
                "Gemini took too long to respond. Please try again."
              );
              lastErrorWasRateLimit = false;
              if (i < attempts.length - 1) continue;
              throw lastError;
            }

            lastAttemptTimedOut = false;
            const parsed = parseGeminiError(err);
            if (parsed.isRateLimit) {
              rateLimitedModels.add(attempt.model);
            }

            // Do not overwrite an earlier transient/timeout error with a fallback 429
            if (!lastError || !parsed.isRateLimit || lastErrorWasRateLimit) {
              lastError = err;
              lastErrorWasRateLimit = Boolean(parsed.isRateLimit);
            }

            if (!parsed.shouldFallback || i === attempts.length - 1) {
              throw lastError;
            }
          } finally {
            if (activeAbortController === attemptController) {
              activeAbortController = null;
            }
          }
        }

        if (!completed && !request.signal.aborted) {
          throw (
            lastError ?? new Error("Failed to generate a response from Gemini.")
          );
        }
      } catch (err) {
        if (!request.signal.aborted) {
          const { message } = parseGeminiError(err);
          enqueueSse({ error: message });
        }
      } finally {
        request.signal.removeEventListener("abort", onRequestAbort);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      }
    },
    cancel() {
      activeAbortController?.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import { GoogleGenAI } from "@google/genai";

export const maxDuration = 30;

const IMAGE_MODEL = "gemini-3.1-flash-lite-image";
const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);

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

function parseImageError(err: unknown): { status: number; message: string } {
  const rawMessage =
    err instanceof Error ? err.message : "Failed to generate image.";
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
        "Invalid or missing Gemini API key. Image generation requires a valid billing-enabled GEMINI_API_KEY in Settings > Secrets or Vercel Environment Variables.",
    };
  }

  if (
    rawMessage.includes("RESOURCE_EXHAUSTED") ||
    rawMessage.includes("429") ||
    lower.includes("quota") ||
    lower.includes("billing")
  ) {
    return {
      status: 429,
      message:
        "Image generation requires a billing-enabled Gemini API key or higher quota. Please select your paid GEMINI_API_KEY in Settings > Secrets or Vercel Environment Variables.",
    };
  }

  if (
    rawMessage.includes("UNAVAILABLE") ||
    rawMessage.includes("503") ||
    lower.includes("high demand")
  ) {
    return {
      status: 503,
      message:
        "Image generation service is temporarily busy. Please try again in a moment.",
    };
  }

  if ((err as { name?: string })?.name === "AbortError") {
    return {
      status: 504,
      message: "Image generation timed out. Please try again.",
    };
  }

  return {
    status: 500,
    message: readable || "Failed to generate an image. Please try again.",
  };
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
  let body: { prompt?: unknown; aspectRatio?: unknown } | null = null;
  try {
    body = (await request.json()) as {
      prompt?: unknown;
      aspectRatio?: unknown;
    };
  } catch {
    return jsonResponse(400, { error: "Invalid JSON request body." });
  }

  const prompt =
    typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) {
    return jsonResponse(400, {
      error: "Please enter a description for the image you want to generate.",
    });
  }

  const aspectRatio =
    typeof body?.aspectRatio === "string" &&
    ALLOWED_ASPECT_RATIOS.has(body.aspectRatio)
      ? body.aspectRatio
      : "1:1";

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    const { status, message } = parseImageError(err);
    return jsonResponse(status, { error: message });
  }

  const startedAt = Date.now();
  const totalBudgetMs = 22000;
  let lastParsedError: { status: number; message: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (request.signal.aborted) {
      return jsonResponse(499, { error: "Request cancelled." });
    }

    const elapsed = Date.now() - startedAt;
    const remainingMs = totalBudgetMs - elapsed;
    if (remainingMs < 4000) break;

    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (request.signal.aborted) {
        return jsonResponse(499, { error: "Request cancelled." });
      }
    }

    const attemptController = new AbortController();
    const onRequestAbort = () => attemptController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });

    const attemptTimeoutMs = Math.max(4000, totalBudgetMs - (Date.now() - startedAt));
    const timer = setTimeout(() => attemptController.abort(), attemptTimeoutMs);

    try {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          abortSignal: attemptController.signal,
          imageConfig: {
            aspectRatio,
          },
        },
      });

      clearTimeout(timer);

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let imageUrl = "";
      let caption = "";

      for (const part of parts) {
        if (part.inlineData?.data && !imageUrl) {
          const mime = part.inlineData.mimeType ?? "image/png";
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          caption += (caption ? "\n" : "") + part.text;
        }
      }

      if (!imageUrl) {
        const fallbackMsg =
          caption.trim() ||
          "No image was returned for that prompt. Try describing the scene differently.";
        return jsonResponse(422, { error: fallbackMsg });
      }

      return jsonResponse(200, {
        imageUrl,
        text: caption.trim(),
        aspectRatio,
      });
    } catch (err) {
      clearTimeout(timer);
      if (request.signal.aborted) {
        return jsonResponse(499, { error: "Request cancelled." });
      }
      const parsed = parseImageError(err);
      lastParsedError = parsed;
      if (parsed.status !== 503 || attempt === 1) {
        return jsonResponse(parsed.status, { error: parsed.message });
      }
    } finally {
      request.signal.removeEventListener("abort", onRequestAbort);
    }
  }

  return jsonResponse(
    lastParsedError?.status ?? 504,
    {
      error:
        lastParsedError?.message ??
        "Image generation timed out. Please try again.",
    }
  );
}

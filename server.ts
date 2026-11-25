import "dotenv/config";
import express from "express";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { OPTIONS as chatOptions, POST as chatPost } from "./api/chat.ts";
import { GET as healthGet } from "./api/health.ts";
import { OPTIONS as imageOptions, POST as imagePost } from "./api/image.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pipeWebResponse(
  webRes: Response,
  expressRes: ExpressResponse,
  isAborted: () => boolean
): Promise<void> {
  expressRes.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    expressRes.setHeader(key, value);
  });
  expressRes.flushHeaders?.();

  if (!webRes.body) {
    expressRes.end();
    return;
  }

  const reader = webRes.body.getReader();
  try {
    while (true) {
      if (isAborted()) {
        await reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !isAborted()) {
        expressRes.write(Buffer.from(value));
      }
    }
  } finally {
    if (!expressRes.writableEnded) {
      expressRes.end();
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req: ExpressRequest, res: ExpressResponse) => {
    const webRes = healthGet();
    await pipeWebResponse(webRes, res, () => false);
  });

  app.all("/api/chat", async (req: ExpressRequest, res: ExpressResponse) => {
    if (req.method === "OPTIONS") {
      const webRes = await chatOptions();
      await pipeWebResponse(webRes, res, () => false);
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const abortController = new AbortController();
    let aborted = false;

    res.on("close", () => {
      if (!res.writableEnded) {
        aborted = true;
        abortController.abort();
      }
    });

    req.socket?.setNoDelay?.(true);

    const webRequest = new Request(`http://localhost:${PORT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: abortController.signal,
    });

    const webRes = await chatPost(webRequest);
    await pipeWebResponse(webRes, res, () => aborted);
  });

  app.all("/api/image", async (req: ExpressRequest, res: ExpressResponse) => {
    if (req.method === "OPTIONS") {
      const webRes = await imageOptions();
      await pipeWebResponse(webRes, res, () => false);
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const abortController = new AbortController();
    let aborted = false;

    res.on("close", () => {
      if (!res.writableEnded) {
        aborted = true;
        abortController.abort();
      }
    });

    const webRequest = new Request(`http://localhost:${PORT}/api/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: abortController.signal,
    });

    const webRes = await imagePost(webRequest);
    await pipeWebResponse(webRes, res, () => aborted);
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: ExpressRequest, res: ExpressResponse) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

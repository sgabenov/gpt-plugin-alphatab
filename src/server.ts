import express, { type Request, type Response } from "express";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { DEMO_SCORE } from "./demo-score.js";
import {
  DEMO_GP_DOWNLOAD_ROUTE,
  DEMO_GP_FILENAME,
  exportDemoGp,
  GP_MIME_TYPE
} from "./gp-export.js";
import { createAlphaTabMcpServer } from "./mcp-server.js";
import { InMemoryScoreStore, ScoreStoreError } from "./score-store.js";
import {
  compileMusicScoreSpec,
  exportMusicScoreSpecAsGp
} from "./alphatab-conversion.js";
import { SCORE_DOWNLOAD_ROUTE_PREFIX } from "./alphatab-tools.js";
import {
  ALPHATAB_ASSET_ROUTE,
  ALPHATAB_VERSION,
  buildUiHtml,
  buildPreviewCsp,
  loadUiBundle
} from "./ui-resource.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MCP_PATH = "/mcp";

function configuredPort(): number {
  const value = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  return Number.isFinite(value) ? value : DEFAULT_PORT;
}

function assetBaseUrl(port: number): string {
  return process.env.ASSET_BASE_URL ?? `http://127.0.0.1:${port}`;
}

function addAssetRoutes(app: express.Express): void {
  const assetDirectory = resolve("dist", "assets", "alphatab", ALPHATAB_VERSION);
  app.use(
    ALPHATAB_ASSET_ROUTE,
    express.static(assetDirectory, {
      immutable: true,
      maxAge: "1y",
      fallthrough: false
    })
  );
}

function addPreviewRoute(app: express.Express, assets: string): void {
  app.get("/preview", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", buildPreviewCsp(assets));
    response.type("html").send(buildUiHtml(loadUiBundle(), assets, DEMO_SCORE));
  });
}

function safeDownloadName(title: string, extension: string): string {
  const stem = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "score";
  return `${stem}.${extension}`;
}

function addDownloadRoutes(app: express.Express, scoreStore: InMemoryScoreStore): void {
  app.get(DEMO_GP_DOWNLOAD_ROUTE, (_request, response) => {
    const bytes = exportDemoGp();
    response.setHeader("Content-Type", GP_MIME_TYPE);
    response.setHeader("Content-Disposition", `attachment; filename="${DEMO_GP_FILENAME}"`);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.send(Buffer.from(bytes));
  });

  app.get(`${SCORE_DOWNLOAD_ROUTE_PREFIX}/:scoreId/:version/:format`, (request, response) => {
    const version = Number.parseInt(request.params.version ?? "", 10);
    const format = request.params.format;
    if (!Number.isSafeInteger(version) || version < 1 || (format !== "gp" && format !== "alphatex")) {
      response.status(400).json({ error: "Invalid score export request." });
      return;
    }
    try {
      const stored = scoreStore.get(request.params.scoreId ?? "", version);
      const compiled = compileMusicScoreSpec(stored.score);
      if (!compiled.success) {
        response.status(422).json({ error: "The stored score could not be compiled." });
        return;
      }
      const isGp = format === "gp";
      const bytes = isGp
        ? exportMusicScoreSpecAsGp(stored.score)
        : new TextEncoder().encode(compiled.payload.alphaTex);
      const filename = safeDownloadName(compiled.payload.title, isGp ? "gp" : "alphatex");
      response.setHeader("Content-Type", isGp ? GP_MIME_TYPE : "text/plain; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.setHeader("Cache-Control", "private, no-store");
      response.send(Buffer.from(bytes));
    } catch (error) {
      if (error instanceof ScoreStoreError) {
        response.status(404).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}

function listen(app: express.Express, port: number, label: string): void {
  app.listen(port, "127.0.0.1", () => {
    console.error(`${label} listening at http://127.0.0.1:${port}`);
  });
}

async function runStdio(): Promise<void> {
  const port = configuredPort();
  const scoreStore = new InMemoryScoreStore();
  const app = express();
  addAssetRoutes(app);
  addPreviewRoute(app, assetBaseUrl(port));
  addDownloadRoutes(app, scoreStore);
  listen(app, port, "alphaTab local asset server");

  const server = createAlphaTabMcpServer({
    assetBaseUrl: assetBaseUrl(port),
    scoreStore
  });
  await server.connect(new StdioServerTransport());
}

async function runHttp(): Promise<void> {
  const port = configuredPort();
  const assets = assetBaseUrl(port);
  const app = express();
  const scoreStore = new InMemoryScoreStore();
  app.use(express.json({ limit: "1mb" }));
  addAssetRoutes(app);
  addPreviewRoute(app, assets);
  addDownloadRoutes(app, scoreStore);

  const mcpPath = process.env.MCP_PATH ?? DEFAULT_MCP_PATH;

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "alphatab-composer", alphaTabVersion: ALPHATAB_VERSION });
  });

  app.all(mcpPath, async (request: Request, response: Response) => {
    const server = createAlphaTabMcpServer({ assetBaseUrl: assets, scoreStore });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!response.headersSent) {
        response.status(500).json({ error: "Internal MCP server error" });
      }
    }
  });

  listen(app, port, `alphaTab Composer MCP server (${mcpPath})`);
}

if (process.argv.includes("--stdio")) {
  await runStdio();
} else {
  await runHttp();
}

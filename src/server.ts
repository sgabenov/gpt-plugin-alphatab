import express, { type Request, type Response } from "express";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAlphaTabMcpServer } from "./mcp-server.js";
import { ALPHATAB_ASSET_ROUTE, ALPHATAB_VERSION } from "./ui-resource.js";

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

function listen(app: express.Express, port: number, label: string): void {
  app.listen(port, "127.0.0.1", () => {
    console.error(`${label} listening at http://127.0.0.1:${port}`);
  });
}

async function runStdio(): Promise<void> {
  const port = configuredPort();
  const app = express();
  addAssetRoutes(app);
  listen(app, port, "alphaTab local asset server");

  const server = createAlphaTabMcpServer({ assetBaseUrl: assetBaseUrl(port) });
  await server.connect(new StdioServerTransport());
}

async function runHttp(): Promise<void> {
  const port = configuredPort();
  const assets = assetBaseUrl(port);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  addAssetRoutes(app);

  const mcpPath = process.env.MCP_PATH ?? DEFAULT_MCP_PATH;

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "alphatab-composer", alphaTabVersion: ALPHATAB_VERSION });
  });

  app.all(mcpPath, async (request: Request, response: Response) => {
    const server = createAlphaTabMcpServer({ assetBaseUrl: assets });
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

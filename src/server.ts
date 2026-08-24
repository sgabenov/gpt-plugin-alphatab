import express, { type Request, type Response } from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAlphaTabMcpServer } from "./mcp-server.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MCP_PATH = "/mcp";

async function runStdio(): Promise<void> {
  const server = createAlphaTabMcpServer();
  await server.connect(new StdioServerTransport());
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const mcpPath = process.env.MCP_PATH ?? DEFAULT_MCP_PATH;

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "alphatab-composer" });
  });

  app.all(mcpPath, async (request: Request, response: Response) => {
    const server = createAlphaTabMcpServer();
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

  const configuredPort = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const port = Number.isFinite(configuredPort) ? configuredPort : DEFAULT_PORT;

  app.listen(port, "127.0.0.1", () => {
    console.error(`alphaTab Composer MCP server listening at http://127.0.0.1:${port}${mcpPath}`);
  });
}

if (process.argv.includes("--stdio")) {
  await runStdio();
} else {
  await runHttp();
}

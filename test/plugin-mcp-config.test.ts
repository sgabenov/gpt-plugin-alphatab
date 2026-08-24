import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { UI_RESOURCE_URI } from "../src/ui-resource.js";

interface McpConfig {
  mcpServers: {
    "guitarpro-tab-composer": {
      command: string;
      args: string[];
      cwd: string;
    };
  };
}

describe("the packaged MCP configuration", () => {
  it("starts from the plugin root and exposes the inline score renderer", async () => {
    const pluginRoot = resolve(".");
    const config = JSON.parse(readFileSync(resolve(pluginRoot, ".mcp.json"), "utf8")) as McpConfig;
    const server = config.mcpServers["guitarpro-tab-composer"];

    expect(server.cwd).toBe(".");

    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: resolve(pluginRoot, server.cwd),
      env: { ...getDefaultEnvironment(), PORT: "0" },
      stderr: "pipe"
    });
    const client = new Client({ name: "plugin-config-smoke-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const renderTool = tools.tools.find((tool) => tool.name === "render_score");

      expect(renderTool?._meta?.ui).toEqual({ resourceUri: UI_RESOURCE_URI });
      expect(tools.tools.map((tool) => tool.name)).toContain("create_score");
    } finally {
      await client.close();
    }
  });
});

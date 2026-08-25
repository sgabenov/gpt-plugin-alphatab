import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
      env_vars: string[];
    };
  };
}

function stdioTransport(pluginRoot: string, dataDirectory: string): StdioClientTransport {
  return new StdioClientTransport({
    command: resolve(pluginRoot, "scripts", "launch-guitarpro-tab-composer-mcp"),
    args: ["--stdio"],
    cwd: pluginRoot,
    env: {
      ...getDefaultEnvironment(),
      CODEX_MCP_NODE_PATH: process.execPath,
      GUITARPRO_TAB_DATA_DIR: dataDirectory,
      GUITARPRO_TAB_ARTIFACT_DIR: join(dataDirectory, "artifacts"),
      PATH: "/usr/bin:/bin",
      PORT: "0"
    },
    stderr: "pipe"
  });
}

describe("the packaged MCP configuration", () => {
  it("starts from the plugin root and exposes the inline score renderer", async () => {
    const pluginRoot = resolve(".");
    const config = JSON.parse(readFileSync(resolve(pluginRoot, ".mcp.json"), "utf8")) as McpConfig;
    const server = config.mcpServers["guitarpro-tab-composer"];

    expect(server.cwd).toBe(".");
    expect(server.command).toBe("./scripts/launch-guitarpro-tab-composer-mcp");
    expect(server.env_vars).toContain("CODEX_MCP_NODE_PATH");
    expect(server.env_vars).toContain("GUITARPRO_TAB_DATA_DIR");
    expect(server.env_vars).toContain("XDG_DATA_HOME");
    accessSync(resolve(pluginRoot, server.command), constants.X_OK);

    const dataDirectory = mkdtempSync(join(tmpdir(), "guitarpro-tab-plugin-test-"));

    const transport = stdioTransport(pluginRoot, dataDirectory);
    const client = new Client({ name: "plugin-config-smoke-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const renderTool = tools.tools.find((tool) => tool.name === "render_score");

      expect(renderTool?._meta?.ui).toEqual({ resourceUri: UI_RESOURCE_URI });
      expect(tools.tools.map((tool) => tool.name)).toContain("create_score");
    } finally {
      await client.close();
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  });

  it("restores an unexpired score through a restarted stdio MCP process", async () => {
    const pluginRoot = resolve(".");
    const dataDirectory = mkdtempSync(join(tmpdir(), "guitarpro-tab-restart-test-"));
    const score = JSON.parse(
      readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
    );
    const firstClient = new Client({ name: "persistent-score-writer", version: "1.0.0" });

    try {
      await firstClient.connect(stdioTransport(pluginRoot, dataDirectory));
      const created = await firstClient.callTool({
        name: "create_score",
        arguments: { score, ttlSeconds: 300 }
      });
      const createdContent = created.structuredContent as { scoreId?: unknown } | undefined;
      const scoreId = createdContent?.scoreId;
      expect(scoreId).toEqual(expect.any(String));
      await firstClient.close();

      const restartedClient = new Client({ name: "persistent-score-reader", version: "1.0.0" });
      try {
        await restartedClient.connect(stdioTransport(pluginRoot, dataDirectory));
        const restored = await restartedClient.callTool({
          name: "get_score",
          arguments: { scoreId, version: 1 }
        });
        expect(restored.structuredContent).toMatchObject({
          status: "found",
          scoreId,
          version: 1,
          score: { id: score.id }
        });
      } finally {
        await restartedClient.close();
      }
    } finally {
      await firstClient.close().catch(() => undefined);
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  });
});

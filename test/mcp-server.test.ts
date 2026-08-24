import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createAlphaTabMcpServer } from "../src/mcp-server.js";
import { UI_RESOURCE_URI } from "../src/ui-resource.js";

describe("the Phase 0 MCP server", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  async function connect() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createAlphaTabMcpServer({ uiBundle: 'console.log("test UI");' });
    const client = new Client({ name: "alphatab-test-client", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(async () => {
      await client.close();
      await server.close();
    });

    return client;
  }

  it("exposes separate headless and UI tools", async () => {
    const client = await connect();
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual(["get_demo_score", "render_demo_score"]);
    const renderTool = tools.tools.find((tool) => tool.name === "render_demo_score");
    expect(renderTool?._meta?.ui).toEqual({ resourceUri: UI_RESOURCE_URI });
  });

  it("returns model-readable demo score data", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "get_demo_score", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      id: "phase-0-drop-d-riff",
      format: "alphatex",
      bars: 2
    });
  });

  it("returns an MCP Apps HTML resource", async () => {
    const client = await connect();
    const result = await client.readResource({ uri: UI_RESOURCE_URI });
    const resource = result.contents[0];

    if (!resource || !("text" in resource)) {
      throw new Error("Expected a text UI resource.");
    }
    expect(resource?.mimeType).toBe("text/html;profile=mcp-app");
    expect(resource.text).toContain("test UI");
  });
});

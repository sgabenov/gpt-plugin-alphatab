import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createAlphaTabMcpServer } from "../src/mcp-server.js";
import { InMemoryScoreStore } from "../src/score-store.js";
import { UI_RESOURCE_URI } from "../src/ui-resource.js";
import { compileMusicScoreSpec } from "../src/alphatab-conversion.js";

describe("the Phase 0 MCP server", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  async function connect(scoreStore?: InMemoryScoreStore) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createAlphaTabMcpServer({
      uiBundle: 'console.log("test UI");',
      scoreStore
    });
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

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "validate_score",
      "create_score",
      "get_score",
      "update_score",
      "compile_score",
      "render_score",
      "export_score",
      "import_score",
      "get_demo_score",
      "render_demo_score",
      "export_demo_gp"
    ]);
    const renderTool = tools.tools.find((tool) => tool.name === "render_demo_score");
    expect(renderTool?._meta?.ui).toEqual({ resourceUri: UI_RESOURCE_URI });
    const scoreRenderTool = tools.tools.find((tool) => tool.name === "render_score");
    expect(scoreRenderTool?._meta?.ui).toEqual({ resourceUri: UI_RESOURCE_URI });
    expect(scoreRenderTool?.description).toContain("After every successful create_score request");
    expect(tools.tools.find((tool) => tool.name === "create_score")?.description).toContain(
      "call render_score"
    );
    expect(tools.tools.find((tool) => tool.name === "export_score")?.description).toContain(
      "does not open the inline player"
    );
    for (const name of [
      "validate_score",
      "create_score",
      "get_score",
      "update_score",
      "compile_score",
      "export_score",
      "import_score"
    ]) {
      const tool = tools.tools.find((candidate) => candidate.name === name);
      expect(tool?.inputSchema.additionalProperties).toBe(false);
      expect(tool?._meta?.ui).toBeUndefined();
    }
  });

  it("creates, versions, and retrieves a score through strict headless tools", async () => {
    const store = new InMemoryScoreStore({
      now: () => Date.parse("2026-08-24T12:00:00.000Z"),
      createId: () => "opaque-mcp-score-00000001"
    });
    const client = await connect(store);
    const score = JSON.parse(
      readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
    );

    const created = await client.callTool({
      name: "create_score",
      arguments: { score, ttlSeconds: 120 }
    });
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({
      status: "created",
      scoreId: "opaque-mcp-score-00000001",
      version: 1,
      expiresAt: "2026-08-24T12:02:00.000Z"
    });

    const compiled = await client.callTool({
      name: "compile_score",
      arguments: { scoreId: "opaque-mcp-score-00000001" }
    });
    expect(compiled.structuredContent).toMatchObject({
      id: "drop-d-study",
      format: "alphatex",
      bars: 1
    });

    const rendered = await client.callTool({
      name: "render_score",
      arguments: { scoreId: "opaque-mcp-score-00000001" }
    });
    expect(rendered.structuredContent).toMatchObject({ id: "drop-d-study" });

    const exported = await client.callTool({
      name: "export_score",
      arguments: { scoreId: "opaque-mcp-score-00000001", format: "gp" }
    });
    expect(exported.structuredContent).toMatchObject({
      filename: "drop-d-study.gp",
      scoreId: "opaque-mcp-score-00000001",
      version: 1
    });

    score.metadata.title = "Updated through MCP";
    const updated = await client.callTool({
      name: "update_score",
      arguments: {
        scoreId: "opaque-mcp-score-00000001",
        expectedVersion: 1,
        score
      }
    });
    expect(updated.structuredContent).toMatchObject({ status: "updated", version: 2 });

    const oldVersion = await client.callTool({
      name: "get_score",
      arguments: { scoreId: "opaque-mcp-score-00000001", version: 1 }
    });
    expect(oldVersion.structuredContent).toMatchObject({
      status: "found",
      version: 1,
      score: { metadata: { title: "Drop D Study" } }
    });

    const conflict = await client.callTool({
      name: "update_score",
      arguments: {
        scoreId: "opaque-mcp-score-00000001",
        expectedVersion: 1,
        score
      }
    });
    expect(conflict.structuredContent).toMatchObject({
      status: "version_conflict",
      currentVersion: 2
    });
  });

  it("imports alphaTex through the MCP file boundary", async () => {
    const store = new InMemoryScoreStore({ createId: () => "opaque-imported-score-0001" });
    const client = await connect(store);
    const score = JSON.parse(
      readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
    );
    const compiled = compileMusicScoreSpec(score);
    if (!compiled.success) throw new Error("Compilation failed.");

    const imported = await client.callTool({
      name: "import_score",
      arguments: {
        filename: "drop-d-study.alphatex",
        dataBase64: Buffer.from(compiled.payload.alphaTex).toString("base64")
      }
    });

    expect(imported.isError).not.toBe(true);
    expect(imported.structuredContent).toMatchObject({
      status: "imported",
      sourceFormat: "alphatex",
      scoreId: "opaque-imported-score-0001",
      version: 1
    });
  });

  it("returns deterministic validation diagnostics without creating a session", async () => {
    const client = await connect();
    const score = JSON.parse(
      readFileSync(resolve("test", "fixtures", "music-score-v1-invalid.json"), "utf8")
    );

    const validation = await client.callTool({
      name: "validate_score",
      arguments: { score }
    });
    expect(validation.isError).not.toBe(true);
    expect(validation.structuredContent).toMatchObject({
      valid: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_ID" }),
        expect.objectContaining({ code: "RHYTHM_UNDERFULL" })
      ])
    });

    const strictContract = await client.callTool({
      name: "get_score",
      arguments: { scoreId: "opaque-score-id-00000001", unexpected: true }
    });
    expect(strictContract.isError).toBe(true);
  });

  it("returns the demo Guitar Pro file as an MCP resource link", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "export_demo_gp", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      filename: "phase-0-drop-d-riff.gp",
      mimeType: "application/octet-stream",
      downloadUrl: "http://127.0.0.1:8787/downloads/phase-0-drop-d-riff.gp"
    });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource_link",
          name: "phase-0-drop-d-riff.gp"
        })
      ])
    );
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
    expect(resource._meta?.ui).toMatchObject({
      csp: {
        resourceDomains: ["http://127.0.0.1:8787", "blob:"]
      }
    });
  });
});

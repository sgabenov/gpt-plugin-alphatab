import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEMO_SCORE, summarizeDemoScore } from "./demo-score.js";
import {
  buildAssetUrls,
  buildUiHtml,
  loadUiBundle,
  UI_RESOURCE_URI
} from "./ui-resource.js";

export interface AlphaTabServerOptions {
  uiBundle?: string;
  assetBaseUrl?: string;
}

const demoScoreOutputSchema = {
  id: z.string(),
  title: z.string(),
  format: z.literal("alphatex"),
  alphaTex: z.string(),
  tempo: z.number().int().positive(),
  timeSignature: z.string(),
  tuning: z.array(z.string()),
  bars: z.number().int().positive()
};

function demoScoreResult() {
  return {
    structuredContent: { ...DEMO_SCORE },
    content: [{ type: "text" as const, text: summarizeDemoScore() }]
  };
}

export function createAlphaTabMcpServer(options: AlphaTabServerOptions = {}): McpServer {
  const assetBaseUrl = options.assetBaseUrl ?? process.env.ASSET_BASE_URL ?? "http://127.0.0.1:8787";
  const assetOrigin = buildAssetUrls(assetBaseUrl).origin;
  const server = new McpServer(
    { name: "alphatab-composer", version: "0.1.0" },
    {
      instructions:
        "Use get_demo_score for headless inspection. Use render_demo_score only when the user wants to see or play the score. The Phase 0 tools return a known alphaTex fixture."
    }
  );

  server.registerTool(
    "get_demo_score",
    {
      title: "Get the alphaTab demo score",
      description: "Return the known Phase 0 alphaTex score without opening an interactive UI.",
      inputSchema: {},
      outputSchema: demoScoreOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => demoScoreResult()
  );

  registerAppTool(
    server,
    "render_demo_score",
    {
      title: "Render the alphaTab demo score",
      description: "Open the known Phase 0 score in an interactive alphaTab notation and playback component.",
      inputSchema: {},
      outputSchema: demoScoreOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: UI_RESOURCE_URI },
        "openai/toolInvocation/invoking": "Preparing the score…",
        "openai/toolInvocation/invoked": "Score ready."
      }
    },
    async () => demoScoreResult()
  );

  registerAppResource(
    server,
    "alphaTab score viewer",
    UI_RESOURCE_URI,
    { description: "Interactive alphaTab score renderer and player." },
    async () => {
      const uiBundle = options.uiBundle ?? loadUiBundle();
      return {
        contents: [
          {
            uri: UI_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: buildUiHtml(uiBundle, assetBaseUrl),
            _meta: {
              ui: {
                prefersBorder: false,
                csp: {
                  connectDomains: [assetOrigin],
                  resourceDomains: [assetOrigin]
                }
              }
            }
          }
        ]
      };
    }
  );

  return server;
}

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEMO_SCORE, summarizeDemoScore } from "./demo-score.js";
import {
  DEMO_GP_DOWNLOAD_ROUTE,
  DEMO_GP_FILENAME,
  exportDemoGp,
  GP_MIME_TYPE
} from "./gp-export.js";
import {
  buildAssetUrls,
  buildUiHtml,
  loadUiBundle,
  UI_RESOURCE_URI
} from "./ui-resource.js";
import { InMemoryScoreStore } from "./score-store.js";
import { registerScoreTools } from "./score-tools.js";

export interface AlphaTabServerOptions {
  uiBundle?: string;
  assetBaseUrl?: string;
  scoreStore?: InMemoryScoreStore;
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
        "Use validate_score before persistence when the user only needs diagnostics. Use create_score, get_score, and update_score for expiring versioned MusicScoreSpec sessions. Use render_demo_score only when the user wants to see or play the Phase 0 demo score."
    }
  );

  registerScoreTools(server, options.scoreStore ?? new InMemoryScoreStore());

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

  server.registerTool(
    "export_demo_gp",
    {
      title: "Export the alphaTab demo as Guitar Pro",
      description: "Generate a Guitar Pro 7+ .gp file from the known Phase 0 score and return a download link.",
      inputSchema: {},
      outputSchema: {
        filename: z.string(),
        mimeType: z.string(),
        downloadUrl: z.string().url(),
        bytes: z.number().int().positive()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const bytes = exportDemoGp();
      const downloadUrl = new URL(DEMO_GP_DOWNLOAD_ROUTE, assetOrigin).href;
      return {
        structuredContent: {
          filename: DEMO_GP_FILENAME,
          mimeType: GP_MIME_TYPE,
          downloadUrl,
          bytes: bytes.byteLength
        },
        content: [
          {
            type: "resource_link" as const,
            uri: downloadUrl,
            name: DEMO_GP_FILENAME,
            description: "Guitar Pro 7+ file generated from the deterministic Phase 0 score.",
            mimeType: GP_MIME_TYPE,
            size: bytes.byteLength
          }
        ]
      };
    }
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

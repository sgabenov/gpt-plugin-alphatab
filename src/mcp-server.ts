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
import { registerAlphaTabScoreTools } from "./alphatab-tools.js";

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
  const scoreStore = options.scoreStore ?? new InMemoryScoreStore();
  const server = new McpServer(
    { name: "guitarpro-tab-composer", version: "0.1.0" },
    {
      instructions:
        "Translate musical requests into MusicScoreSpec v1 and validate before persistence. For every successful request to create, compose, or generate a score, call create_score and then always call render_score with the returned scoreId and version before the final response, including when export_score is also requested. For revisions, render the final version returned by update_score. Skip inline rendering only when the user explicitly requests no player or asks solely for validation or textual inspection. Use compile_score for deterministic alphaTex inspection, export_score for Guitar Pro or alphaTex downloads, import_score for supported score files, and demo tools only for diagnostics."
    }
  );

  registerScoreTools(server, scoreStore);
  registerAlphaTabScoreTools(server, scoreStore, assetOrigin);

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
    "GuitarPro Tab Composer score viewer",
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
                  resourceDomains: [assetOrigin, "blob:"]
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

import os from "node:os";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  MERXET_X402_ORIGIN: z.string().url().default("https://x402.merxet.com"),
  MERXET_SYNC_ORIGIN: z.string().url().default("https://sync.merxet.com"),
  MERXET_FRONTEND_ORIGIN: z.string().url().default("https://app.merxet.com"),
  MERXET_MCP_DATA_DIR: z.string().optional(),
}).passthrough();

export type McpConfig = {
  x402Origin: string;
  syncOrigin: string;
  frontendOrigin: string;
  dataDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, platform = process.platform): McpConfig {
  const value = schema.parse(env);
  const origin = (input: string) => {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Merxet origins must be bare HTTPS origins");
    }
    return url.origin;
  };
  const defaultData = platform === "win32"
    ? path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Merxet", "mcp")
    : path.join(env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "merxet", "mcp");
  return {
    x402Origin: origin(value.MERXET_X402_ORIGIN),
    syncOrigin: origin(value.MERXET_SYNC_ORIGIN),
    frontendOrigin: origin(value.MERXET_FRONTEND_ORIGIN),
    dataDir: value.MERXET_MCP_DATA_DIR ? path.resolve(value.MERXET_MCP_DATA_DIR) : defaultData,
  };
}

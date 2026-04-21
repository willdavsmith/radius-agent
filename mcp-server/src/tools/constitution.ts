import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// constitution.md is shipped alongside the dist/ directory in the published
// package (see "files" in package.json). We resolve it relative to this
// compiled module's location so it works whether installed via npx or run
// from a local checkout.
const HERE = dirname(fileURLToPath(import.meta.url));
const CONSTITUTION_PATH = resolve(HERE, "..", "..", "constitution.md");

let cached: string | null = null;
export function loadConstitution(): string {
  if (cached === null) {
    cached = readFileSync(CONSTITUTION_PATH, "utf8");
  }
  return cached;
}

export function registerConstitutionTool(server: McpServer): void {
  server.registerTool(
    "get_platform_constitution",
    {
      title: "Get the Radius platform constitution",
      description:
        "Returns the Radius platform constitution: the authoritative " +
        "rules for resource types, Bicep extensions, app.bicep structure, " +
        "naming, connections, and secret handling. Call this first before " +
        "modeling or auditing any Radius application.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: loadConstitution() }],
    }),
  );
}

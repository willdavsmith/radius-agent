import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConstitutionTool } from "./tools/constitution.js";
import { registerAnalyzeTool } from "./tools/analyze.js";
import { registerValidateTool } from "./tools/validate.js";

export function registerTools(server: McpServer): void {
  registerConstitutionTool(server);
  registerAnalyzeTool(server);
  registerValidateTool(server);
}

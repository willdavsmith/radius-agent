import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface Finding {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
}

const APPROVED_TYPES = new Set([
  "Applications.Core/applications",
  "Radius.Compute/containerImages",
  "Radius.Compute/containers",
  "Radius.Compute/persistentVolumes",
  "Radius.Compute/routes",
  "Radius.Data/mySqlDatabases",
  "Radius.Data/postgreSqlDatabases",
  "Radius.Data/neo4jDatabases",
  "Radius.Security/secrets",
]);

const NAMESPACE_EXTENSIONS = [
  "radius",
  "radiusCompute",
  "radiusSecurity",
  "radiusData",
];

const FORBIDDEN_EXTENSIONS = ["containers", "containerImages", "persistentVolumes", "routes"];

function findExtensionLines(bicep: string): string[] {
  const lines = bicep.split(/\r?\n/);
  const result: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*extension\s+([A-Za-z][A-Za-z0-9_]*)/);
    if (m) result.push(m[1]);
  }
  return result;
}

function containsConnectionsInsideContainers(bicep: string): boolean {
  // Find every `containers: {` opener, then walk the string with a brace
  // counter; if `connections:` appears before the matching close, that's a
  // violation.
  const openerRe = /containers\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = openerRe.exec(bicep)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < bicep.length && depth > 0) {
      const ch = bicep[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (
        depth > 0 &&
        ch === "c" &&
        bicep.startsWith("connections", i) &&
        /\s/.test(bicep[i - 1] ?? " ") &&
        /\s*:/.test(bicep.slice(i + "connections".length, i + "connections".length + 4))
      ) {
        return true;
      }
      i++;
    }
  }
  return false;
}

function findResourceTypes(bicep: string): string[] {
  const types: string[] = [];
  const re = /'([A-Za-z][A-Za-z0-9.]*\/[A-Za-z][A-Za-z0-9]*)@([0-9]{4}-[0-9]{2}-[0-9]{2}-preview)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bicep)) !== null) types.push(`${m[1]}@${m[2]}`);
  return types;
}

function validate(bicep: string): Finding[] {
  const findings: Finding[] = [];
  const lines = bicep.split(/\r?\n/);

  // Extensions
  const exts = findExtensionLines(bicep);
  if (!exts.includes("radius")) {
    findings.push({
      severity: "error",
      rule: "extensions.radius-required",
      message: "Missing `extension radius`. It must be declared first.",
    });
  }
  for (const e of exts) {
    if (FORBIDDEN_EXTENSIONS.includes(e)) {
      findings.push({
        severity: "error",
        rule: "extensions.no-per-type",
        message: `\`extension ${e}\` is forbidden. Use the namespace extension (e.g. \`extension radiusCompute\`) instead.`,
      });
    } else if (!NAMESPACE_EXTENSIONS.includes(e)) {
      findings.push({
        severity: "warning",
        rule: "extensions.unknown",
        message: `Unknown extension \`${e}\`. Approved extensions: ${NAMESPACE_EXTENSIONS.join(", ")}.`,
      });
    }
  }
  const orderIndex = (name: string) => NAMESPACE_EXTENSIONS.indexOf(name);
  for (let i = 1; i < exts.length; i++) {
    const a = orderIndex(exts[i - 1]);
    const b = orderIndex(exts[i]);
    if (a >= 0 && b >= 0 && a > b) {
      findings.push({
        severity: "error",
        rule: "extensions.order",
        message: `Extensions must appear in order: ${NAMESPACE_EXTENSIONS.join(" → ")}. Saw \`${exts[i - 1]}\` before \`${exts[i]}\`.`,
      });
      break;
    }
  }

  // Resource types and API versions
  const types = findResourceTypes(bicep);
  for (const t of types) {
    const [bare, api] = t.split("@");
    if (!APPROVED_TYPES.has(bare)) {
      findings.push({
        severity: "error",
        rule: "types.approved-only",
        message: `Resource type \`${bare}\` is not in the approved list (§5 of the constitution).`,
      });
    }
    if (bare === "Applications.Core/applications" && api !== "2023-10-01-preview") {
      findings.push({
        severity: "error",
        rule: "types.api-version",
        message: `\`Applications.Core/applications\` must use API version \`2023-10-01-preview\` (saw \`${api}\`).`,
      });
    } else if (bare.startsWith("Radius.") && api !== "2025-08-01-preview") {
      findings.push({
        severity: "error",
        rule: "types.api-version",
        message: `\`${bare}\` must use API version \`2025-08-01-preview\` (saw \`${api}\`).`,
      });
    }
  }

  if (/Radius\.Core\/applications/.test(bicep)) {
    findings.push({
      severity: "error",
      rule: "types.no-radius-core-applications",
      message: "`Radius.Core/applications` does not exist. Use `Applications.Core/applications`.",
    });
  }

  // Exactly one application resource
  const appCount = types.filter((t) => t.startsWith("Applications.Core/applications@")).length;
  if (appCount === 0) {
    findings.push({
      severity: "error",
      rule: "structure.application-required",
      message: "Missing `Applications.Core/applications` resource. Exactly one is required.",
    });
  } else if (appCount > 1) {
    findings.push({
      severity: "error",
      rule: "structure.single-application",
      message: `Found ${appCount} \`Applications.Core/applications\` resources. Exactly one is required.`,
    });
  }

  // environment param
  if (!/param\s+environment\s+string/.test(bicep)) {
    findings.push({
      severity: "error",
      rule: "params.environment-required",
      message: "Missing `param environment string`. It must always be declared.",
    });
  }

  // Secure params for sensitive values
  const passwordParams = bicep.matchAll(/^\s*param\s+(\w*[Pp]assword\w*|\w*[Ss]ecret\w*|\w*[Tt]oken\w*|\w*[Kk]ey\w*)\s+string/gm);
  for (const m of passwordParams) {
    const name = m[1];
    const idx = bicep.indexOf(m[0]);
    const before = bicep.slice(Math.max(0, idx - 80), idx);
    if (!/@secure\(\)/.test(before)) {
      findings.push({
        severity: "error",
        rule: "secrets.secure-param",
        message: `Param \`${name}\` looks sensitive but is not marked \`@secure()\`.`,
      });
    }
  }

  // containerPort, not port
  if (/\bport:\s*\d+/.test(bicep) && !/containerPort:\s*\d+/.test(bicep)) {
    findings.push({
      severity: "error",
      rule: "containers.port-name",
      message: "Container ports must use `containerPort:`, not `port:`.",
    });
  }

  // Hardcoded image refs (heuristic: image: 'literal' inside containerImages or container)
  const hardcoded = bicep.match(/image:\s*'([^']+)'/g) ?? [];
  for (const h of hardcoded) {
    if (!/properties\.image/.test(h) && !/\$\{/.test(h)) {
      findings.push({
        severity: "warning",
        rule: "images.parameterize",
        message: `Image reference \`${h}\` appears hardcoded. Prefer \`param image string\` and reference \`<imageSymbol>.properties.image\`.`,
      });
    }
  }

  // Image refs lowercase
  for (const h of hardcoded) {
    const m = h.match(/image:\s*'([^']+)'/);
    if (m && /[A-Z]/.test(m[1])) {
      findings.push({
        severity: "error",
        rule: "images.lowercase",
        message: `Image reference \`${m[1]}\` must be lowercase.`,
      });
    }
  }

  // No comments in generated bicep
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line) || /\/\*/.test(line)) {
      findings.push({
        severity: "warning",
        rule: "style.no-comments",
        message: `Line ${i + 1}: generated Bicep should not contain comments.`,
      });
    }
  }

  // connections inside containers (brace-balanced check)
  if (containsConnectionsInsideContainers(bicep)) {
    findings.push({
      severity: "error",
      rule: "connections.top-level",
      message: "`connections` must be a top-level property under `properties`, not nested inside `containers`.",
    });
  }

  // connections as array
  if (/connections:\s*\[/.test(bicep)) {
    findings.push({
      severity: "error",
      rule: "connections.object-map",
      message: "`connections` must be an object map, not an array.",
    });
  }

  // Registry property on containerImages
  if (/Radius\.Compute\/containerImages@/.test(bicep) && /registry:\s*{/.test(bicep)) {
    findings.push({
      severity: "warning",
      rule: "secrets.no-registry-creds",
      message: "Avoid setting `registry` on `Radius.Compute/containerImages`. Registry auth is platform-managed.",
    });
  }

  return findings;
}

export function registerValidateTool(server: McpServer): void {
  server.registerTool(
    "validate_app_bicep",
    {
      title: "Validate an app.bicep against the Radius constitution",
      description:
        "Runs the §9 validation checklist from the platform constitution " +
        "against an app.bicep document and returns structured findings. " +
        "Call this after generating Bicep, and again after each fix.",
      inputSchema: {
        bicep: z.string().describe("The full app.bicep content to validate."),
      },
    },
    async ({ bicep }) => {
      const findings = validate(bicep);
      const summary = {
        ok: findings.every((f) => f.severity !== "error"),
        errorCount: findings.filter((f) => f.severity === "error").length,
        warningCount: findings.filter((f) => f.severity === "warning").length,
        findings,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );
}

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface RepoSignals {
  appName: string;
  language: string | null;
  hasDockerfile: boolean;
  dockerfilePaths: string[];
  composeServices: string[];
  detectedDatastores: string[];
  ports: number[];
  envVarsOfInterest: string[];
  suggestedPattern:
    | "single-container"
    | "container-plus-datastore"
    | "build-from-source"
    | "stateful"
    | "multi-service";
  notes: string[];
}

const DATASTORE_HINTS: Array<{ engine: string; patterns: RegExp[] }> = [
  { engine: "postgres", patterns: [/postgres/i, /pg_/i, /psycopg/i, /pgx/i] },
  { engine: "mysql", patterns: [/mysql/i, /mariadb/i] },
  { engine: "neo4j", patterns: [/neo4j/i] },
  { engine: "redis", patterns: [/redis/i] },
  { engine: "mongodb", patterns: [/mongo/i] },
];

const ENV_VARS_OF_INTEREST = [
  "DATABASE_URL",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "POSTGRES_URL",
  "MYSQL_URL",
  "REDIS_URL",
  "NEO4J_URI",
  "PORT",
];

function safeRead(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function detectLanguage(root: string): string | null {
  if (existsSync(join(root, "package.json"))) return "node";
  if (existsSync(join(root, "go.mod"))) return "go";
  if (existsSync(join(root, "pyproject.toml"))) return "python";
  if (existsSync(join(root, "requirements.txt"))) return "python";
  if (existsSync(join(root, "Cargo.toml"))) return "rust";
  if (existsSync(join(root, "pom.xml"))) return "java";
  if (existsSync(join(root, "build.gradle"))) return "java";
  if (existsSync(join(root, "Gemfile"))) return "ruby";
  return null;
}

function findDockerfiles(root: string, depth = 2): string[] {
  const found: string[] = [];
  const walk = (dir: string, d: number) => {
    if (d < 0) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git") continue;
      const p = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(p, d - 1);
      } else if (entry === "Dockerfile" || entry.endsWith(".Dockerfile")) {
        found.push(p);
      }
    }
  };
  walk(root, depth);
  return found;
}

function parseComposeServices(composeYaml: string): string[] {
  // Lightweight: pull top-level entries under `services:` without a YAML dep.
  const lines = composeYaml.split(/\r?\n/);
  const services: string[] = [];
  let inServices = false;
  let servicesIndent = -1;
  for (const line of lines) {
    if (/^services\s*:/.test(line)) {
      inServices = true;
      servicesIndent = line.search(/\S/);
      continue;
    }
    if (!inServices) continue;
    if (/^\S/.test(line) && line.search(/\S/) <= servicesIndent) {
      inServices = false;
      continue;
    }
    const m = line.match(/^(\s+)([A-Za-z0-9_.-]+)\s*:\s*$/);
    if (m && m[1].length === servicesIndent + 2) {
      services.push(m[2]);
    }
  }
  return services;
}

function detectDatastores(haystacks: string[]): string[] {
  const found = new Set<string>();
  for (const text of haystacks) {
    for (const { engine, patterns } of DATASTORE_HINTS) {
      if (patterns.some((p) => p.test(text))) found.add(engine);
    }
  }
  return [...found];
}

function detectPorts(text: string): number[] {
  const ports = new Set<number>();
  const re = /\b(?:EXPOSE|listen|PORT[^\w]+|port:\s*)(\d{2,5})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n >= 80 && n <= 65535) ports.add(n);
  }
  return [...ports].sort((a, b) => a - b);
}

function detectEnvVars(text: string): string[] {
  return ENV_VARS_OF_INTEREST.filter((v) => new RegExp(`\\b${v}\\b`).test(text));
}

function classifyPattern(s: {
  hasDockerfile: boolean;
  composeServices: string[];
  detectedDatastores: string[];
}): RepoSignals["suggestedPattern"] {
  if (s.composeServices.length > 1) return "multi-service";
  if (s.detectedDatastores.length > 0 && s.hasDockerfile) {
    return "container-plus-datastore";
  }
  if (s.detectedDatastores.length > 0) return "container-plus-datastore";
  if (s.hasDockerfile) return "build-from-source";
  return "single-container";
}

function analyze(root: string, appName?: string): RepoSignals {
  const language = detectLanguage(root);
  const dockerfilePaths = findDockerfiles(root);
  const compose =
    safeRead(join(root, "docker-compose.yml")) ??
    safeRead(join(root, "docker-compose.yaml")) ??
    safeRead(join(root, "compose.yml")) ??
    safeRead(join(root, "compose.yaml")) ??
    "";
  const composeServices = compose ? parseComposeServices(compose) : [];

  const haystacks: string[] = [];
  for (const f of [
    "package.json",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "Gemfile",
    ".env",
    ".env.example",
    "README.md",
  ]) {
    const c = safeRead(join(root, f));
    if (c) haystacks.push(c);
  }
  if (compose) haystacks.push(compose);
  for (const dp of dockerfilePaths) {
    const c = safeRead(dp);
    if (c) haystacks.push(c);
  }

  const joined = haystacks.join("\n");
  const detectedDatastores = detectDatastores(haystacks);
  const ports = detectPorts(joined);
  const envVarsOfInterest = detectEnvVars(joined);

  const suggestedPattern = classifyPattern({
    hasDockerfile: dockerfilePaths.length > 0,
    composeServices,
    detectedDatastores,
  });

  const notes: string[] = [];
  if (!language) notes.push("No primary language detected from manifest files.");
  if (dockerfilePaths.length === 0)
    notes.push("No Dockerfile found; consider adding one for build-from-source.");
  if (detectedDatastores.length > 1)
    notes.push(
      `Multiple datastore signals detected (${detectedDatastores.join(", ")}); pick the primary one.`,
    );

  return {
    appName: appName ?? basename(root),
    language,
    hasDockerfile: dockerfilePaths.length > 0,
    dockerfilePaths,
    composeServices,
    detectedDatastores,
    ports,
    envVarsOfInterest,
    suggestedPattern,
    notes,
  };
}

export function registerAnalyzeTool(server: McpServer): void {
  server.registerTool(
    "analyze_source_repo",
    {
      title: "Analyze a source repository for Radius modeling",
      description:
        "Inspects a checked-out repository and returns the signals needed " +
        "to model it as a Radius application: detected language, Dockerfile " +
        "locations, compose services, likely datastores, exposed ports, " +
        "interesting env vars, and a suggested architecture pattern from " +
        "the platform constitution. Call this before generating app.bicep.",
      inputSchema: {
        path: z
          .string()
          .describe(
            "Absolute or workspace-relative path to the repository root.",
          ),
        appName: z
          .string()
          .optional()
          .describe("Override the app name (defaults to the directory name)."),
      },
    },
    async ({ path, appName }) => {
      const signals = analyze(path, appName);
      return {
        content: [{ type: "text", text: JSON.stringify(signals, null, 2) }],
      };
    },
  );
}

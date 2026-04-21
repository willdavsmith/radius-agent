# `@willdavsmith/radius-mcp-server`

A [Model Context Protocol](https://modelcontextprotocol.io/) server that
helps AI agents generate **Radius application definitions** (`app.bicep`)
from a source repository.

The server runs **in-process inside the Copilot cloud agent runner** (or
any MCP client). There is nothing to host — the agent runner fetches and
executes it via `npx` for each task.

## Tools

| Tool | What it does |
|---|---|
| `get_platform_constitution` | Returns the authoritative Radius platform constitution (resource types, Bicep structure, naming, secrets). Call this first. |
| `analyze_source_repo` | Inspects a checked-out repo and returns signals: language, Dockerfile paths, compose services, datastores, ports, env vars, and a suggested architecture pattern. |
| `validate_app_bicep` | Runs the §9 checklist from the constitution against an `app.bicep` and returns structured findings. |

The constitution is **baked into the package** — updates ship as a new
version of this package. The MCP server itself is stateless; all knowledge
lives in [`constitution.md`](./constitution.md).

## Use it from the GitHub Copilot cloud agent (UI-only flow)

1. **One-time setup (repo or org admin):** add this to your repo's
   *Settings → Copilot → Cloud agent → MCP configuration*:

   ```json
   {
     "mcpServers": {
       "radius": {
         "type": "local",
         "command": "npx",
         "args": ["-y", "@willdavsmith/radius-mcp-server@0.1.1"],
         "tools": [
           "get_platform_constitution",
           "analyze_source_repo",
           "validate_app_bicep"
         ]
       }
     }
   }
   ```

   See [`examples/repo-mcp-config.json`](./examples/repo-mcp-config.json).

2. **Optional: drop in the Radius custom agent** so the cloud agent has a
   pre-canned workflow. Copy
   [`examples/radius.agent.md`](./examples/radius.agent.md) to
   `.github/agents/radius.agent.md` in your repo (or to your org-level
   agents location to apply across all repos).

3. **Optional: add an issue template** so developers can kick off the flow
   from the GitHub UI in one click. Copy
   [`examples/issue-template.md`](./examples/issue-template.md) to
   `.github/ISSUE_TEMPLATE/create-radius-app.md`.

4. **Use it.** In any repo with the config above:
   - Open a new issue with the *Create Radius application definition*
     template (or just write the request manually).
   - Assign Copilot.
   - The cloud agent runs, calls the Radius MCP tools, generates
     `.radius/app.bicep`, validates it, and opens a PR.

No files in the user's repo other than the optional issue template and
agent definition. The constitution and tooling live in this package.

## Use it from VS Code Copilot Chat

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "radius": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@willdavsmith/radius-mcp-server@0.1.1"]
    }
  }
}
```

Then ask Copilot Chat: *"Create a Radius application definition for this
repo."* Copilot will call `get_platform_constitution`, `analyze_source_repo`,
and `validate_app_bicep` as needed.

## Use it from the Copilot CLI

Add to `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "radius": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@willdavsmith/radius-mcp-server@0.1.1"]
    }
  }
}
```

## Local development

```bash
npm install
npm run build
npm start            # starts the MCP server on stdio for ad-hoc testing
```

Smoke test the protocol by hand:

```bash
( printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 1
) | node dist/cli.js
```

## License

Apache-2.0

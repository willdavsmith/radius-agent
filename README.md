# Radius Agent

Tools for using GitHub Copilot to generate [Radius](https://radapp.io)
application definitions from source repositories.

This repo contains:

- **[`radius-platform-constitution.md`](./radius-platform-constitution.md)** —
  the authoritative platform spec (resource types, Bicep structure, naming,
  secrets, networking). Designed to be forked and customized by platform
  teams adopting Radius.
- **[`mcp-server/`](./mcp-server)** — the
  [`@willdavsmith/radius-mcp-server`](https://www.npmjs.com/package/@willdavsmith/radius-mcp-server)
  npm package. A [Model Context Protocol](https://modelcontextprotocol.io/)
  server that exposes the constitution and a Bicep validator to AI agents.

## How it works

The MCP server runs **in-process inside the GitHub Copilot cloud agent
runner** — there is no service to host. Once a repo admin pastes a small
JSON snippet into *Settings → Copilot → Cloud agent → MCP configuration*,
any Copilot task in that repo can call:

| Tool | Purpose |
|---|---|
| `get_platform_constitution` | Returns the authoritative platform rules. |
| `analyze_source_repo` | Inspects the checked-out repo (language, Dockerfiles, datastores, ports). |
| `validate_app_bicep` | Validates an `app.bicep` against the constitution. |

Typical end-to-end flow on github.com:

1. Developer files an issue: *"Create a Radius application definition for
   this repo."*
2. Assigns Copilot.
3. Cloud agent runner starts the Radius MCP server, calls the tools,
   generates `.radius/app.bicep`, validates it, and opens a PR.

No Radius-specific files in the user's repo (other than the optional
issue template).

## Get started

See [`mcp-server/README.md`](./mcp-server/README.md) for installation and
configuration instructions.

## Repository layout

```
radius-platform-constitution.md   Authoritative platform spec.
mcp-server/                       npm package source.
├── src/                          TypeScript source.
├── examples/                     Drop-in MCP config, custom agent, issue template.
├── constitution.md               Built copy of the spec, shipped with the package.
└── README.md                     Package usage docs.
```

## License

Apache-2.0

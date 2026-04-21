Repository-level MCP configuration

Paste this into your repo's Settings → Copilot → Cloud agent →  
MCP configuration. The cloud agent will fetch and run the Radius MCP  
server in-process for each task.

Pin the version (`@0.1.0`) for reproducible behavior. Bump deliberately.

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

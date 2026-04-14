# Radius Agent

A [GitHub Copilot custom agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-custom-agents) that builds working [Radius](https://radapp.io) cloud-native applications.

## What it does

Tell the Radius agent what application you want to build, and it will create:

- **`app.bicep`** — Radius application definition with the correct resource types and API versions
- **`bicepconfig.json`** — Bicep extension configuration
- **`app/Dockerfile`** + starter code — If you need a container image built
- **`.github/workflows/deploy.yaml`** — GitHub Actions workflow to deploy to a k3d cluster using GHCR

The agent knows how to use `Radius.Compute/containers`, `Radius.Compute/containerImages`, `Radius.Compute/persistentVolumes`, and other Radius resource types from [resource-types-contrib](https://github.com/radius-project/resource-types-contrib).

## How to use

1. Go to [github.com/copilot/agents](https://github.com/copilot/agents)
2. Select this repository from the dropdown
3. Choose the **radius** agent
4. Describe the application you want to build

## Example prompt

> Build me a Node.js web app that listens on port 3000 and deploys to Kubernetes using Radius. Include a GitHub Actions workflow.

## Repository structure

```
.github/
├── agents/
│   └── radius.agent.md          # Copilot agent profile
└── copilot-setup-steps.yml      # Cloud agent environment setup
```

## Learn more

- [Radius documentation](https://docs.radapp.io/)
- [Radius quick start](https://docs.radapp.io/quick-start/)
- [GitHub Copilot custom agents](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-custom-agents)
- [Radius containerImages demo](https://github.com/willdavsmith/radius-containerimagetype-demo)

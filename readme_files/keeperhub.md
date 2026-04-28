---
title: "AI Tools"
description: "AI-powered tools for building and managing KeeperHub workflows."
---

# AI Tools

AI-powered tools that help you build, configure, and manage blockchain automations faster.

- [Overview](/ai-tools/overview) -- How AI tools integrate with KeeperHub
- [Claude Code Plugin](/ai-tools/claude-code-plugin) -- Use Claude Code for workflow development
- [MCP Server](/ai-tools/mcp-server) -- KeeperHub MCP server for AI-assisted automation
- [Agentic Wallets](/ai-tools/agentic-wallet) -- Install an x402 wallet (KeeperHub agentic wallet, agentcash, or Coinbase wallet skills) so your agent can pay for KeeperHub workflows

---

title: "Overview"
description: "Use AI agents and developer tools to build and manage KeeperHub workflows programmatically."

---

# AI Tools

KeeperHub provides two integration surfaces for AI-assisted and programmatic workflow management:

| Tool                                               | What it does                                                       | Best for                                          |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| [Claude Code Plugin](/ai-tools/claude-code-plugin) | Skills and commands for building workflows from your terminal      | Developers using Claude Code as their IDE         |
| [MCP Server](/ai-tools/mcp-server)                 | Model Context Protocol server with 19 tools for full workflow CRUD | AI agents, custom integrations, remote automation |

Both connect to the same KeeperHub API and require an organization-scoped API key (prefix: `kh_`).

## Quick Start

**Claude Code users:** Install the plugin and run `/keeperhub:login` to get started. The plugin auto-installs the MCP server and configures authentication.

**AI agent builders:** Run the MCP server directly via Docker or Node.js and point your agent framework at it. See [MCP Server](/ai-tools/mcp-server) for setup.

## Getting Your API Key

1. Log in at [app.keeperhub.com](https://app.keeperhub.com)
2. Click your avatar, then "API Keys", then the "Organisation" tab
3. Click "New API Key" and name it (e.g., "Claude Code Plugin")
4. Copy the key immediately -- it is only shown once

The key must be organization-scoped (starts with `kh_`). User-scoped keys (`wfb_` prefix) are not supported.

---

title: "Claude Code Plugin"
description: "Build and manage KeeperHub workflows directly from Claude Code with skills, commands, and MCP tools."

---

# Claude Code Plugin

[GitHub](https://github.com/KeeperHub/claude-plugins/tree/main/plugins/keeperhub)

The KeeperHub plugin for Claude Code lets you create workflows, browse templates, debug executions, and explore plugins without leaving your terminal.

## Installation

There are two ways to connect Claude Code to KeeperHub:

### Option A: Remote MCP (no install needed)

Connect directly to KeeperHub's hosted MCP server. No CLI or plugin installation required.

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp
```

Then run `/mcp` inside Claude Code to authorize via browser. That's it.

### Option B: Plugin with local CLI

Install the plugin for skills, slash commands, and a local MCP server.

**1. Install the `kh` CLI**

```bash
brew install keeperhub/tap/kh
```

See [CLI installation options](https://github.com/KeeperHub/cli#install) for other platforms.

**2. Install the plugin**

```bash
/plugin marketplace add KeeperHub/claude-plugins
/plugin install keeperhub@keeperhub-plugins
/keeperhub:login
```

Restart Claude Code after setup for MCP tools to become available.

### Requirements

- KeeperHub account at [app.keeperhub.com](https://app.keeperhub.com)
- Option A: just a browser (for OAuth)
- Option B: the `kh` CLI ([install instructions](https://github.com/KeeperHub/cli#install))

## Commands

### `/keeperhub:login`

Setup guide for connecting to KeeperHub MCP. Walks you through running `/mcp` to authorize via browser, or setting up `KH_API_KEY` for headless/CI environments.

### `/keeperhub:status`

Check MCP connection status and authentication.

```
KeeperHub Status
----------------
MCP Server:   app.keeperhub.com/mcp (remote)
Connection:   Connected
Auth method:  OAuth
```

## Skills

Skills activate automatically based on what you ask Claude to do. No slash commands needed; just describe what you want.

### workflow-builder

**Activates when you say:** "create a workflow", "monitor my wallet", "set up automation", "when X happens do Y", "alert me when..."

Walks through building a workflow step by step:

1. Identifies the trigger (what starts it)
2. Discovers available actions via `list_action_schemas`
3. Adds actions one at a time with your input
4. Creates the workflow and offers to test it

**Example prompts:**

- "Create a workflow that checks my vault health every 15 minutes and sends a Telegram alert if collateral drops below 150%"
- "Monitor 0xABC... for large transfers and notify Discord"
- "Set up a weekly reward distribution to stakers"

### template-browser

**Activates when you say:** "show me templates", "find a workflow for...", "deploy a template", "what pre-built workflows exist"

Searches the template library, shows details, and deploys templates to your account with optional customization.

### execution-monitor

**Activates when you say:** "why did my workflow fail", "check execution status", "run my workflow", "show logs"

Triggers workflows, polls for completion, and debugs failures by analyzing execution logs. Identifies the failing step, explains the error, and offers to fix the workflow.

### plugin-explorer

**Activates when you say:** "what plugins are available", "how do I use web3", "show integrations", "what actions can I use"

Lists available plugins and their actions, shows configured integrations, and validates plugin configurations.

## Configuration

The plugin connects to KeeperHub's remote MCP server at `app.keeperhub.com/mcp`. Authentication is handled via OAuth (browser) when you run `/mcp`, or via the `KH_API_KEY` environment variable for headless environments.

| Variable     | Description                                                              |
| ------------ | ------------------------------------------------------------------------ |
| `KH_API_KEY` | API key for headless/CI environments (`kh_` prefix, organization-scoped) |

## Security

- OAuth tokens are managed by Claude Code (automatic refresh)
- API keys (`KH_API_KEY`) are only used in headless environments
- All communication is over HTTPS
- OAuth scopes restrict tool access (mcp:read, mcp:write, mcp:admin)

---

title: "MCP Server"
description: "Model Context Protocol server for AI agents to build and manage KeeperHub workflows programmatically."

---

# MCP Server

The KeeperHub MCP server exposes tools over the Model Context Protocol, enabling AI agents to create, execute, and monitor blockchain automation workflows.

## Connect to KeeperHub MCP

### Remote (recommended)

Connect directly to KeeperHub's hosted MCP server. No local process or CLI installation needed.

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp
```

Then run `/mcp` inside Claude Code to complete the OAuth authorization via browser. KeeperHub will ask you to approve access, and the token is stored automatically.

For headless or CI environments where browser auth is not available, pass an API key:

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer kh_your_key_here"
```

### Via Claude Code Plugin

Install the [Claude Code Plugin](/ai-tools/claude-code-plugin) for additional skills and slash commands on top of the MCP tools. The plugin connects to the same remote endpoint.

### Local via kh CLI (deprecated)

The [`kh` CLI](https://github.com/KeeperHub/cli) can run a local MCP server over stdio via `kh serve --mcp`. This is deprecated in favor of the remote endpoint above and will be removed in a future release.

## Authentication

The MCP endpoint supports two authentication methods:

**OAuth 2.1 (browser-based):** When you add the remote MCP server, Claude Code discovers the OAuth metadata at `/.well-known/oauth-authorization-server` and opens a browser for authorization. Tokens are managed automatically (1-hour access tokens, 30-day refresh tokens).

**API keys (headless):** Pass an organization API key (`kh_` prefix) as a Bearer token. Create one at [app.keeperhub.com](https://app.keeperhub.com) under Settings > API Keys > Organisation tab.

## Organization Scoping

Each MCP connection is scoped to a single organization. The org is determined by your authentication method:

- **OAuth:** The org active in your browser session when you approve the authorization request.
- **API key:** The org the key was created in (visible on the API Keys page).

All tools operate within this org -- listing workflows, creating workflows, executing, and viewing integrations. There is no way to access another org's resources from the same connection.

### Switching Organizations

To work with a different org, re-authenticate:

**OAuth (Claude Code):** Switch your active org at [app.keeperhub.com](https://app.keeperhub.com) using the org switcher, then reconnect the MCP server. In Claude Code, remove and re-add the server:

```bash
claude mcp remove keeperhub
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp
```

Complete the OAuth flow again -- the new active org will be captured.

**API key:** Create a separate API key in the target org and update the MCP server configuration with the new key.

### Working with Multiple Organizations

If you regularly work across multiple orgs, add a separate MCP server entry for each:

```json
{
  "mcpServers": {
    "keeperhub-acme": {
      "type": "http",
      "url": "https://app.keeperhub.com/mcp",
      "headers": { "Authorization": "Bearer kh_acme_key" }
    },
    "keeperhub-personal": {
      "type": "http",
      "url": "https://app.keeperhub.com/mcp",
      "headers": { "Authorization": "Bearer kh_personal_key" }
    }
  }
}
```

Each server entry has its own tool namespace, so the AI agent can distinguish which org to target based on the server name.

## Tools Reference

### Workflow Management

| Tool              | Description                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_workflows`  | List all workflows in the organization. Accepts `limit` and `offset` for pagination.                                                                     |
| `get_workflow`    | Get full workflow configuration by ID including nodes and edges.                                                                                         |
| `create_workflow` | Create a workflow with explicit nodes and edges. Call `list_action_schemas` first to get valid action types.                                             |
| `update_workflow` | Update a workflow's name, description, nodes, or edges.                                                                                                  |
| `delete_workflow` | Permanently delete a workflow and stop all its executions. Use `force: true` to delete workflows with execution history (cascades to all runs and logs). |

### Execution

| Tool                   | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `execute_workflow`     | Manually trigger a workflow. Returns an execution ID for status polling.   |
| `get_execution_status` | Check whether an execution is pending, running, completed, or failed.      |
| `get_execution_logs`   | Get detailed logs including transaction hashes, API responses, and errors. |

### AI Generation

| Tool                   | Description                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `ai_generate_workflow` | Generate a workflow from a natural language prompt. Optionally modifies an existing workflow. |

### Action Schemas

| Tool                  | Description                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `list_action_schemas` | List available action types and their configuration fields. Filter by category: `web3`, `discord`, `sendgrid`, `webhook`, `system`. |

### Plugins

| Tool                     | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `search_plugins`         | Search plugins by name or category (`web3`, `messaging`, `integration`, `notification`). |
| `get_plugin`             | Get full plugin documentation with optional examples and config field details.           |
| `validate_plugin_config` | Validate an action configuration against its schema. Returns errors and suggestions.     |

### Templates

| Tool               | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `search_templates` | Search pre-built workflow templates by query, category, or difficulty. |
| `get_template`     | Get template metadata and setup guide.                                 |
| `deploy_template`  | Deploy a template to your account with optional node customizations.   |

### Integrations

| Tool                     | Description                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `list_integrations`      | List configured integrations. Filter by type (`web3`, `discord`, `sendgrid`, etc.).    |
| `get_wallet_integration` | Get the wallet integration ID needed for write operations (transfers, contract calls). |

### Documentation

| Tool                  | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `tools_documentation` | Get documentation for any MCP tool. Use without arguments for a full tool list. |

## Resources

The server exposes two MCP resources:

| URI                          | Description                 |
| ---------------------------- | --------------------------- |
| `keeperhub://workflows`      | List of all workflows       |
| `keeperhub://workflows/{id}` | Full workflow configuration |

## Creating a Workflow

A typical workflow creation flow:

1. **Discover actions** -- call `list_action_schemas` with a category to see available action types and their required fields
2. **Build nodes** -- construct trigger and action nodes with the correct `actionType` values
3. **Connect nodes** -- define edges from trigger to actions in execution order
4. **Create** -- call `create_workflow` with nodes and edges (auto-layouts positions)
5. **Test** -- call `execute_workflow` and poll `get_execution_status`

### Node Structure

```json
{
  "id": "check-balance",
  "type": "action",
  "data": {
    "label": "Check Balance",
    "description": "Check wallet ETH balance",
    "type": "action",
    "config": {
      "actionType": "web3/check-balance",
      "network": "11155111",
      "address": "0x..."
    },
    "status": "idle"
  }
}
```

Trigger nodes use `type: "trigger"` with a `triggerType` in the config (`Manual`, `Schedule`, `Webhook`, `Event`).

### Edge Structure

Edges connect nodes and define execution flow:

```json
{
  "id": "edge-1",
  "source": "trigger-1",
  "target": "check-balance"
}
```

For **Condition nodes** and **For Each nodes**, edges require a `sourceHandle` field:

```json
{
  "id": "edge-2",
  "source": "condition-1",
  "target": "send-alert",
  "sourceHandle": "true"
}
```

| Source Node Type | sourceHandle Values   |
| ---------------- | --------------------- |
| Condition        | `"true"` or `"false"` |
| For Each         | `"loop"` or `"done"`  |
| Other nodes      | Omit field            |

### Condition Nodes

Condition nodes have dual output paths with `true` and `false` source handles. Connect downstream nodes to the appropriate handle to create if/else logic in a single Condition node.

Conditions support these operators: `==` (soft equals), `===` (equals), `!=` (soft not equals), `!==` (not equals), `>`, `>=`, `<`, `<=`, `contains`, `startsWith`, `endsWith`, `matchesRegex`, `isEmpty`, `isNotEmpty`, `exists`, `doesNotExist`.

Conditions reference previous node outputs using template syntax: `{{@nodeId:Label.field}}`.

## Web3 Action Reference

### Read Actions (no wallet required)

| Action                     | Required Fields                              |
| -------------------------- | -------------------------------------------- |
| `web3/check-balance`       | `network`, `address`                         |
| `web3/check-token-balance` | `network`, `address`, `tokenAddress`         |
| `web3/read-contract`       | `network`, `contractAddress`, `functionName` |

### Write Actions (require wallet integration)

| Action                | Required Fields                                              |
| --------------------- | ------------------------------------------------------------ |
| `web3/transfer-funds` | `network`, `toAddress`, `amount`, `walletId`                 |
| `web3/transfer-token` | `network`, `toAddress`, `tokenAddress`, `amount`, `walletId` |
| `web3/write-contract` | `network`, `contractAddress`, `functionName`, `walletId`     |

Get the `walletId` by calling `get_wallet_integration`.

The `network` field accepts chain IDs as strings: `"1"` (Ethereum mainnet), `"11155111"` (Sepolia), `"8453"` (Base), `"42161"` (Arbitrum), `"137"` (Polygon).

## Error Handling

All tools return errors in this format:

```json
{
  "content": [{ "type": "text", "text": "Error: <message>" }],
  "isError": true
}
```

| Code | Meaning                         |
| ---- | ------------------------------- |
| 401  | Invalid or missing API key      |
| 404  | Workflow or execution not found |
| 400  | Invalid parameters              |
| 500  | Server error                    |

---

title: "Agentic Wallets"
description: "Install an x402/MPP wallet in your AI agent to pay for KeeperHub workflows or any x402/MPP service. Covers the first-party KeeperHub agentic wallet plus the main third-party options."

---

# Agentic Wallets

KeeperHub paid workflows settle via [x402](https://docs.cdp.coinbase.com/x402) on Base USDC or MPP on Tempo USDC.e: each call carries a USDC payment, and the server returns a result only after the payment is verified. To call a paid workflow, your agent needs an x402/MPP wallet.

This page covers the first-party **KeeperHub agentic wallet** (skill + npm package, server-side Turnkey custody) and the main third-party alternatives. Every wallet listed works with KeeperHub and with any other x402/MPP-compliant service.

## KeeperHub agentic wallet

A skill + npm package from KeeperHub. Custody is server-side in a per-wallet [Turnkey sub-organisation](https://docs.turnkey.com/concepts/sub-organizations), so no private key lands on disk. A `PreToolUse` hook gates every signing call against a three-tier (auto / ask / block) policy sourced from `~/.keeperhub/safety.json`.

### Install

Two steps: register the skill + safety hook, then provision a wallet. Run the commands yourself, or have your agent do it for you.

**Manual:**

```bash
npx @keeperhub/wallet skill install
npx @keeperhub/wallet add
```

**Have your agent do it:** paste this prompt:

> Install the KeeperHub agentic wallet: run `npx @keeperhub/wallet skill install` to register the skill and safety hook, then `npx @keeperhub/wallet add` to provision a new wallet. Report the subOrgId and wallet address when done.

The install step writes the skill file into every detected agent skill directory (Claude Code, Cursor, Cline, Windsurf, OpenCode) and registers the `keeperhub-wallet-hook` `PreToolUse` safety hook in `~/.claude/settings.json`. The `add` step provisions a fresh Turnkey sub-organisation and writes `~/.keeperhub/wallet.json` (mode `0600`). The file contains only your sub-org identifier, your EVM wallet address, and an HMAC shared secret used to authenticate signing requests against KeeperHub — **no private key**. The signing key material is generated inside [Turnkey's secure enclave](https://docs.turnkey.com/concepts/overview#the-system-level-threat-model-we-solve) and never leaves it; nothing in `wallet.json` alone is enough to sign a transaction.

Restart your agent session once after this so it picks up the newly installed skill.

### First payment

The wallet handles payment; the agent still needs a way to discover and call KeeperHub workflows. That comes from the [KeeperHub MCP server](/ai-tools/mcp-server), which exposes the `search_workflows` and `call_workflow` meta-tools to your agent. You can install the MCP server on its own (see the [MCP server](/ai-tools/mcp-server) page) or bundled with the [KeeperHub Claude Code plugin](/ai-tools/claude-code-plugin), which wires both the MCP server and (soon) the wallet skill in one step.

With MCP + wallet both installed, ask your agent in plain language:

> Use KeeperHub to check the ETH balance of `0xC300B53616532FDB0116bcE916c9307377362B51`.

> Run the KeeperHub `mcp-test` workflow for `0xC300...`.

The agent discovers available workflows at runtime through the KeeperHub meta-tools (`search_workflows` + `call_workflow`) and picks the best match. When a paid workflow returns a `402`, the wallet intercepts the challenge, signs through the server-side proxy (x402 on Base USDC or MPP on Tempo USDC.e), and the call retries transparently. If both challenge types are offered it submits one MPP credential (cheaper, near-instant Tempo settlement). If the amount exceeds your `auto_approve_max_usd` the safety hook surfaces an inline permission prompt before any payment is authorised.

### Safety hooks

Every wallet signing call is gated by a `PreToolUse` hook that reads thresholds from `~/.keeperhub/safety.json` (never from the transaction payload):

| Tier  | Behaviour                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auto  | Amount at or below `auto_approve_max_usd` signs without prompting.                                                                                                |
| ask   | Amount above `auto_approve_max_usd` and at or below `block_threshold_usd` returns `{decision: "ask"}` so Claude Code surfaces an inline prompt in the agent chat. |
| block | Amount above `block_threshold_usd`, or a contract not in `allowlisted_contracts`, is denied without calling `/sign`.                                              |

The hook reads only the payment-challenge fields `amount`, `unit`, and the asset contract address from the tool payload. Forged fields like `trust-level hint` or `admin-override` are ignored by design.

### Server-side hard limits

Beyond the client-side hook, a set of Turnkey-enforced policies apply to every wallet and cannot be bypassed by editing `safety.json` or changing the agent's hook. They are created per sub-organisation at provision time and enforced by Turnkey itself on every signing activity:

- **Contract allowlist.** Signing is denied on any call whose target contract is not Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) or Tempo USDC.e (`0x20C000000000000000000000B9537D11c60E8b50`). On the EIP-712 (x402) signing path the same restriction is applied against the typed-data domain's verifying contract.
- **Per-transfer cap.** `transfer()` or `transferFrom()` of more than 100 USDC is denied. The same 100 USDC ceiling applies to EIP-3009 `TransferWithAuthorization` typed-data signing.
- **Approval cap.** `approve()` above 100 USDC is denied. Anything over the same 100 USDC per-transfer ceiling is rejected.
- **Chain allowlist.** EIP-712 signing is denied for any `domain.chainId` outside Base (8453), Tempo mainnet (4217), and Tempo testnet (4218).
- **Daily spend cap.** Aggregate signed payments per wallet are bounded at **200 USDC per UTC day** by default. Requests that would exceed the cap return `429 DAILY_CAP_EXCEEDED` with a `Retry-After` header counting down to the next UTC midnight. The cap protects against a compromised HMAC secret being used to drain the wallet faster than an operator can notice and rotate. If a legitimate workflow needs a higher cap, contact KeeperHub support.

These are defence-in-depth: even if an attacker bypassed the client-side hook entirely, Turnkey rejects the signature. They are also **not user-configurable today**. If you have a legitimate need to sign transfers above 100 USDC or to interact with contracts outside the USDC allowlist, contact KeeperHub support — a sub-organisation with a different policy set is possible but requires an operator action. Self-serve higher-cap configuration is on the roadmap.

### Default safety config

When `~/.keeperhub/safety.json` is absent the hook applies these defaults:

```json
{
  "auto_approve_max_usd": 5,
  "block_threshold_usd": 100,
  "allowlisted_contracts": [
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "0x20C000000000000000000000B9537D11c60E8b50"
  ]
}
```

The two allowlisted addresses are the only tokens the client-side hook will authorise out of the box:

- `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — **Base USDC**. Canonical Circle USDC contract on Base mainnet (chain id 8453). Used by x402 challenges from KeeperHub and any other x402-compliant service.
- `0x20C000000000000000000000B9537D11c60E8b50` — **Tempo USDC.e**. USDC bridge token on Tempo mainnet (chain id 4217). Used by MPP challenges from KeeperHub paid workflows that settle on Tempo.

`allowlisted_contracts` in `safety.json` is a client-side first-pass filter — the hook rejects signing calls whose target contract is not in this list. You can **narrow** it further (for example, remove Tempo USDC.e if your agent only pays on Base). You cannot **widen** it: adding a third contract here has no effect because the [server-side hard limits](#server-side-hard-limits) still restrict every signature to Base USDC + Tempo USDC.e. For access to other contracts, contact KeeperHub support so a sub-organisation with a different server-side allowlist can be provisioned.

## Alternatives

### agentcash

`agentcash` is a CLI + skill bundle from [agentcash.dev](https://agentcash.dev). It maintains a local USDC wallet and signs x402 payments on the agent's behalf.

```bash
npx agentcash add https://app.keeperhub.com
```

This walks KeeperHub's `/openapi.json`, generates a `keeperhub` skill file, and symlinks it into every detected agent skill directory. After install, agents can call `search_workflows` and `call_workflow` as first-class tools; payment is routed through the agentcash wallet automatically.

Supported agents (17 at time of writing): Claude Code, Cursor, Cline, Windsurf, Continue, Roo Code, Kilo Code, Goose, Trae, Junie, Crush, Kiro CLI, Qwen Code, OpenHands, Gemini CLI, Codex, GitHub Copilot.

> **Testing only. Do not custody real funds.**
> agentcash stores the wallet key as an **unencrypted plaintext file** at `~/.agentcash/wallet.json`. There is no passphrase, no keychain integration, and no seed-phrase backup: if the file is deleted, lost, or read by any process running as your user, the funds are gone or stolen. This is appropriate for development and automation experiments with small balances (a few dollars of USDC for test calls); it is not a production wallet.
>
> KeeperHub does not operate agentcash and is not responsible for funds stored in an agentcash wallet. Use it at your own risk and do not top it up beyond what you are willing to lose.

### Coinbase agentic wallet skills

Coinbase publishes a bundle of 9 general-purpose x402 skills that work with any x402-compliant service, KeeperHub included:

```bash
npx skills add coinbase/agentic-wallet-skills
```

This installs skills including `authenticate-wallet`, `fund`, `pay-for-service`, `search-for-service`, `send-usdc`, `trade`, `query-onchain-data`, and `x402`. The wallet is managed through Coinbase Developer Platform; payment flows route through the CDP infrastructure.

Full documentation and security risk ratings: https://skills.sh/coinbase/agentic-wallet-skills

## Comparison

| Feature                | KeeperHub Agentic Wallet                             | agentcash                                           | Coinbase agentic-wallet-skills                                     |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Key custody            | Server-side Turnkey enclave; agent holds HMAC secret | Plaintext JSON on disk (`~/.agentcash/wallet.json`) | Coinbase Developer Platform (CDP) managed or self-custody variants |
| Private key on disk    | Never                                                | Yes (unencrypted)                                   | Depends on variant                                                 |
| Payment protocols      | x402 (Base USDC) + MPP (Tempo USDC.e)                | x402                                                | x402 (Coinbase ecosystem)                                          |
| PreToolUse safety hook | Three-tier auto/ask/block built-in                   | Not bundled                                         | Not bundled                                                        |
| Onboarding             | Zero-registration, under 60 seconds                  | Zero-registration                                   | Requires CDP account for the managed variant                       |
| Install                | `npx @keeperhub/wallet skill install`                | `npx agentcash add https://app.keeperhub.com`       | `npx skills add coinbase/agentic-wallet-skills`                    |

## Choosing a wallet

All three wallets call any x402-compliant service, KeeperHub included. The choice comes down to custody and ecosystem fit rather than anything KeeperHub-specific.

The KeeperHub agentic wallet is a managed service: KeeperHub runs the Turnkey sub-organisation and proxies signing. You trust KeeperHub to honour the [server-side hard limits](#server-side-hard-limits) and the `PreToolUse` hook decision. In return you get no-plaintext-key storage, a three-tier safety hook out of the box, and zero-registration onboarding.

agentcash is fully self-custodial, with plaintext key material at rest. It fits development and automation experiments with small balances; it is not a production wallet for funds you care about.

Coinbase agentic wallet skills assume the CDP ecosystem for the managed variant. A good fit if you already run on CDP; otherwise it introduces Coinbase platform lock-in.

Nothing stops you installing multiple wallets side by side; they do not conflict.

## What KeeperHub exposes to the agent

Whichever wallet you install, the agent calls KeeperHub through two meta-tools (described in its OpenAPI at `/openapi.json`):

- `search_workflows` — find workflows by category, tag, or free text. Returns slug, description, inputSchema, and price for each match.
- `call_workflow` — execute a listed workflow by slug. For read workflows the call executes and returns the result; for write workflows it returns unsigned calldata `{to, data, value}` for the caller to submit.

The meta-tool pattern keeps the agent's tool list small regardless of how many workflows are listed: the agent discovers available workflows at runtime instead of registering one tool per workflow.

## Paying for calls

Paid workflows settle in USDC on Base (via x402) or USDC.e on Tempo (via MPP). Most workflows cost under `$0.05` per call. See [Paid Workflows](/workflows/paid-workflows) for the creator-side view of the same settlement.

## Known limitations

- Signing is supported on Base (8453), Tempo mainnet (4217), and Tempo testnet (4218) today. Solana, Arbitrum, Optimism and other chains are not yet supported.
- Ask-tier approvals are surfaced inline via the agent's permission prompt. A browser-based review flow for larger amounts is on the roadmap.
- Workflow discovery via the skill is scoped to KeeperHub's registry. The wallet auto-pays any x402 or MPP 402 challenge you direct it at, but discovering third-party x402 services from the agent is on the roadmap.

## FAQ

### Who controls my wallet?

KeeperHub does, today. Each wallet is a [Turnkey sub-organisation](https://docs.turnkey.com/concepts/sub-organizations) where KeeperHub holds the only root user — a server-side API key inside a Turnkey enclave. Your agent does not hold a private key. When your agent needs to pay, it sends a signed request to KeeperHub, KeeperHub checks it against the safety policy engine, and Turnkey produces the signature.

This is a custodial model. You are trusting KeeperHub to honour the policy limits on every signing call. In exchange you get zero-registration onboarding, no private keys on disk, and no seed phrase to back up.

### What stops KeeperHub signing whatever it wants?

A set of Turnkey policies, applied per sub-organisation at provision time and enforced by Turnkey itself (not by application code). Full list above under [Server-side hard limits](#server-side-hard-limits). Briefly: signing only against the Base USDC / Tempo USDC.e contracts, no `approve()` above 100 USDC, no `transfer()` or `transferFrom()` above 100 USDC, and EIP-712 signing restricted to allowlisted chain ids and verifying contracts.

If KeeperHub's operator key is compromised, the attacker is still bound by these policies. They cannot drain funds to an arbitrary address or approve an arbitrary contract to spend your balance.

### What happens if I lose `wallet.json`?

Today, the wallet is not recoverable. `wallet.json` holds the HMAC secret that authenticates your agent against KeeperHub; without it there is no way to re-authenticate to the same sub-org. Running `npx @keeperhub/wallet add` again creates a brand new sub-org with a brand new address. Any funds in the old wallet stay there but are unreachable.

Back up `wallet.json` the same way you would back up an SSH key. A passkey-backed recovery path is on the roadmap.

### Can I move the wallet to another machine?

Yes. `wallet.json` is the wallet from your agent's perspective. Copy it to another machine (under `~/.keeperhub/wallet.json`, mode `0600`) and that machine speaks for the same wallet. Treat it like any other long-lived credential.

### Does KeeperHub have access to my funds?

KeeperHub can produce signatures for your wallet, but only within the limits of the [server-side hard limits](#server-side-hard-limits). KeeperHub never sees a private key — the key material lives inside Turnkey's secure enclave, and Turnkey is the one that produces signatures after KeeperHub's API key passes the policy engine.

### Why don't I have a passkey or 2FA option?

Passkey-backed sub-orgs are a more secure option Turnkey supports natively, and it's on the roadmap as an opt-in enrolment. The default today is convenience-first — onboard in under a minute, no ceremony — because that's what unblocks trying an agent-paid workflow. Users who want a break-glass signing authority and a recovery path will get a `--with-passkey` provisioning mode in a future release.

### Can I change the safety thresholds or the allowed contracts?

You can edit `~/.keeperhub/safety.json` (mode `0644`) to raise or lower `auto_approve_max_usd` and `block_threshold_usd`, or to narrow `allowlisted_contracts` (for example, drop Tempo USDC.e if your agent only pays on Base). The hook picks up changes on its next invocation.

Raising thresholds raises your exposure. Widening the contract allowlist past the server-side default (Base USDC + Tempo USDC.e) has no effect on its own — the [server-side hard limits](#server-side-hard-limits) still block signatures against any other contract. If you need access to a different contract, contact KeeperHub support.

### How are signing decisions actually enforced?

Two layers, and they're independent:

1. **Client-side hook**, running inside your agent (Claude Code, etc.). Reads `~/.keeperhub/safety.json`, classifies the amount, and either allows, asks you inline, or denies the call before it ever hits the network. This is what keeps your agent from being manipulated into calling `/sign` for amounts you didn't authorise.
2. **Server-side Turnkey policies**, enforced inside Turnkey for every signing activity. See [Server-side hard limits](#server-side-hard-limits) for the full list. They are the hard floor — a misconfigured hook or a compromised agent still cannot sign outside them.

Either layer alone isn't enough. The hook stops an agent from asking for a bad signature; the policies stop any signature from being produced outside the rules.

### What's the difference between my wallet and my KeeperHub creator wallet?

Two different things:

- The **agentic wallet** is what your agent uses to pay for workflows. It's provisioned per agent install, custodial via Turnkey, not tied to a KeeperHub account.
- A **creator wallet** is what a workflow author sets up to receive payouts. It lives on your KeeperHub account, is managed through the dashboard, and is a separate Turnkey sub-org with a different setup.

Installing an agentic wallet does not touch or affect your creator wallet, and vice versa.

### Can I delete my wallet?

Not through the CLI today. If you've stopped using a wallet and want the sub-org cleaned up, get in touch via the KeeperHub support channel with your `subOrgId` (from `npx @keeperhub/wallet info`) and the operator team can remove it.

### What do I actually pay? Do I need ETH for gas?

No ETH, no gas out of your wallet for normal agentic wallet use.

- **x402 on Base.** You sign an EIP-3009 `TransferWithAuthorization` — a pre-signed authorisation that lets the x402 facilitator move USDC on your behalf. The facilitator submits the on-chain transaction and pays the gas. Your wallet only debits the USDC amount.
- **MPP on Tempo.** You sign a payment proof; Tempo settles the transfer through the MPP facilitator, which pays the network fees. Your wallet only debits the USDC.e amount.

So for a `$0.05` paid workflow, `$0.05` of USDC (or USDC.e) leaves your wallet — nothing else.

If in future you use the wallet to sign a direct on-chain transaction outside the agentic workflow pattern (e.g. a manual ERC-20 transfer), you'd need native gas for that chain the same way any wallet would.

## Links

- npm: [`@keeperhub/wallet`](https://www.npmjs.com/package/@keeperhub/wallet)
- Skills registry: [`keeperhub/agentic-wallet-skills`](https://skills.sh/keeperhub/agentic-wallet-skills)
- Source: [`KeeperHub/agentic-wallet`](https://github.com/KeeperHub/agentic-wallet).

---

title: "API Overview"
description: "KeeperHub REST API reference - authentication, endpoints, rate limits, and SDKs."

---

# API Overview

The KeeperHub API allows you to programmatically manage workflows, integrations, and executions.

## Base URL

```
https://app.keeperhub.com/api
```

## Authentication

API requests require authentication. Two methods are supported, but their accepted scope differs:

- **Session**: Browser-based authentication via Better Auth. Accepted on every endpoint.
- **API Key** (`kh_`): For programmatic access to organization-scoped endpoints (workflows, integrations, billing, organization management). Not accepted on user-account, wallet write, OAuth-account-bound, or per-user endpoints.

See [Authentication](/api/authentication) for the full scope.

## Response Format

All responses are returned as JSON with the following structure:

### Success Response

```json
{
  "data": { ... }
}
```

### Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Rate Limits

API requests are subject to rate limiting. Current limits:

- 100 requests per minute for authenticated users
- 10 requests per minute for unauthenticated requests

## Available Endpoints

| Resource                                  | Description                                         |
| ----------------------------------------- | --------------------------------------------------- |
| [Workflows](/api/workflows)               | Create, read, update, delete workflows              |
| [Executions](/api/executions)             | Monitor workflow execution status and logs          |
| [Direct Execution](/api/direct-execution) | Execute blockchain transactions without workflows   |
| [Analytics](/api/analytics)               | Workflow performance metrics and gas usage tracking |
| [Integrations](/api/integrations)         | Manage notification and service integrations        |
| [Projects](/api/projects)                 | Organize workflows into projects                    |
| [Tags](/api/tags)                         | Label and categorize workflows                      |
| [Chains](/api/chains)                     | List supported blockchain networks                  |
| [User](/api/user)                         | User profile, preferences, and address book         |
| [Organizations](/api/organizations)       | Organization membership management                  |
| [API Keys](/api/api-keys)                 | Manage API keys for programmatic access             |

## SDKs

Official SDKs are planned for future release. In the meantime, you can interact with the API directly using any HTTP client or library such as `fetch`, `axios`, or `requests`.

---
title: "CLI"
description: "KeeperHub command-line interface for managing workflows, executing blockchain actions, and integrating with CI/CD pipelines."
---

# CLI

The KeeperHub CLI (`kh`) lets you manage workflows, execute blockchain actions, and monitor runs from the terminal. It is designed for scripting, CI/CD pipelines, and AI-assisted workflows via MCP.

## Install

**Homebrew (macOS/Linux):**
```
brew install keeperhub/tap/kh
```

**Go install:**
```
go install github.com/keeperhub/cli/cmd/kh@latest
```

**Binary download:** Download from [GitHub Releases](https://github.com/keeperhub/cli/releases) and add to your PATH.

## Authenticate

```
kh auth login
```

For CI/CD environments, set the `KH_API_KEY` environment variable instead.

## What's in this section

- [Quickstart](./cli/quickstart) -- install, authenticate, and run your first commands
- [Concepts](./cli/concepts) -- authentication model, output formats, configuration, MCP mode
- [Commands](./cli/commands) -- full reference for every `kh` command


# shortcut-helper

Automates Shortcut story grooming and implementation planning using Claude.

## Features

**Groomer** — Polls for ungroomed stories in the current iteration assigned to you. For each one, explores your codebase and posts clarifying questions as a comment (or notes that none are needed).

**Planner** — Polls for stories labelled `Ready-for-Claude` that have already been groomed. For each one, explores the codebase and posts a concrete implementation plan as a comment, then removes the `Ready-for-Claude` label.

## How it works

1. Polls Shortcut on a configurable interval
2. Spawns a Claude session with access to your codebase and the Shortcut MCP
3. Posts results as comments directly on the story

## Setup

```bash
pnpm install
```

Copy `.env.example` to `.env` and fill in the values:

```bash
SHORTCUT_API_TOKEN=       # your Shortcut API token
SHORTCUT_OWNER_MEMBER_ID= # your Shortcut member ID
CODEBASE_PATH=            # path to your repo (default: ~/Work/gemini)
GROOMER_MODEL=            # Claude model to use (default: claude-sonnet-4-6)
POLL_INTERVAL_MINUTES=    # how often to poll (default: 3)
ENABLE_GROOMER=           # set to "true" to enable grooming (default: false)
ENABLE_PLANNER=           # set to "true" to enable planning (default: false)
```

## Usage

```bash
pnpm start
```

Stop with `Ctrl+C`.

# shortcut-groomer

Automatically grooms [Shortcut](https://shortcut.com) stories in the current iteration using Claude. For each ungroomed story assigned to you, it explores your codebase and posts clarifying questions as a comment.

## How it works

1. Polls Shortcut on a configurable interval
2. Finds stories in the current iteration assigned to you that haven't been groomed yet
3. Spawns a Claude session with access to your codebase and the Shortcut MCP
4. Posts a comment with clarifying questions (or notes that none are needed)

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
```

## Usage

```bash
pnpm start
```

Stop with `Ctrl+C`.

# Agent Assistant for Mattermost

Agent Assistant is a Mattermost plugin that presents every normal root post in a channel as a searchable conversation in the right-hand sidebar (RHS), including posts that do not have replies yet. Users can create, rename, pin, search, sort, and follow team conversations without losing the native Mattermost thread history.

The plugin does **not** contain an AI model, agent workflow, gateway, bot token, or provider credential. An administrator configures one team and a preferred default channel; each user can then select any public or private channel they belong to in that team. The preferred channel is used only when the user has joined it, otherwise the plugin selects their first accessible channel. When a user includes the configured bot mention, the existing bot/gateway handles that post and writes its replies back to the same Mattermost thread.

## Repository map

```text
plugin.json                    Plugin identity, version, bundle paths, and admin settings
server/
  api.go                       Authenticated configuration endpoint used by the web app
  configuration.go             Loads and normalizes Mattermost plugin settings
  main.go                      Mattermost server-plugin entry point
  plugin.go                    Plugin lifecycle and router initialization
webapp/src/
  api/agent_channel.ts         Mattermost REST calls and post/conversation mapping
  components/rhs_panel/        Conversation library and chat UI
  components/app_bar_badge/    Unread-count badge on the app-bar icon
  types/conversation.ts        UI domain types
  utils/conversations.ts       Filtering and sorting helpers
assets/                        Files packaged with the server bundle
public/                        Files served at /plugins/{plugin-id}/public/
```

## How the integration works

```text
RHS channel selector
  -> one public/private channel available to the signed-in user
RHS composer
  -> Mattermost post in the selected channel/thread
  -> configured @bot mention (only when the user adds it)
  -> existing Mattermost gateway / agent service
  -> bot replies in the same Mattermost thread
  -> Mattermost websocket event refreshes the RHS
```

Mattermost remains the source of truth. Conversation messages are posts and replies in the selected channel. The library loads channel posts in pages and fetches a complete thread only when it is opened, avoiding one thread request per item during startup. Mattermost system events and deleted posts are excluded. Custom conversation titles are stored in the root post's `com_designveloper_agent_conversation` property. Each browser stores its selected channel and pinned conversation IDs in `localStorage`; these preferences are not shared between users.

## Prerequisites

- A Mattermost server that supports plugins and plugin uploads
- Go version declared in `go.mod`
- Node.js version declared in `.nvmrc`
- npm and GNU Make
- An existing Mattermost bot connected to the desired agent service
- At least one public or private Mattermost channel that the bot/gateway and intended users can access

Install the JavaScript dependencies after cloning:

```bash
nvm install
nvm use
cd webapp && npm ci && cd ..
```

## Configure a new server

After uploading and enabling the plugin, open **System Console > Plugins > Agent Assistant** and set all three values:

| Setting | Enter | Example only |
| --- | --- | --- |
| Mattermost team name | URL-safe team segment | `your-team-name` |
| Default Mattermost channel name | Preferred URL-safe channel; users who have not joined it receive an accessible fallback | `agent-conversations` |
| Agent bot username | Username without `@` | `your_agent_bot` |

The values are deliberately blank in `plugin.json`. They are deployment configuration, not source-code constants. Never put a Mattermost access token, LLM key, gateway secret, webhook credential, or password in these fields or commit one to this repository.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete deployment checklist.

## Build the upload bundle

```bash
make dist
```

The uploadable artifact is written to `dist/` as a `.tar.gz` file. The exact filename includes the plugin ID and version. Building never uploads the plugin automatically.

Run checks before sharing a build:

```bash
go test ./server/...
cd webapp
npm run lint
npm run check-types
npm test -- --runInBand
```

## Install the bundle

In Mattermost, go to **System Console > Plugins > Plugin Management**, choose **Upload Plugin**, and select the generated `.tar.gz`. Enable Agent Assistant, then complete its settings.

An administrator with `mmctl` access can alternatively run:

```bash
mmctl plugin add --force ./dist/<generated-plugin-bundle>.tar.gz
mmctl plugin enable com.designveloper.agent-assistant
```

## Before publishing this repository

1. Choose the permanent repository URL.
2. Replace the placeholder module path on the first line of `go.mod` with that URL without `https://` or `.git`.
3. Review the plugin ID. Keep `com.designveloper.agent-assistant` stable after release; changing it creates a separate plugin identity.
4. Run the credential scan and tests in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
5. Commit source files only. Generated `dist/`, `server/dist/`, `webapp/dist/`, `node_modules/`, `.env`, and local credentials must remain untracked.

## Documentation

- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Deployment and server migration](docs/DEPLOYMENT.md)
- [Maintainer workflow](docs/DEVELOPMENT.md)

## License

See [LICENSE](LICENSE).

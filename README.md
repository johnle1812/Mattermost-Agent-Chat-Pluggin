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

## Clone, build, and install

The following instructions use Ubuntu, preferably through WSL on Windows. Keeping the repository inside the Ubuntu filesystem, such as `~/mattermost-agent-plugin`, avoids many Windows/WSL permission and executable-path problems. Docker is not required just to build the plugin.

### Required tools

- Git
- GNU Make
- Go 1.25 or newer, based on `go.mod`
- Node.js 24.13.1, based on `.nvmrc`
- npm
- NVM, recommended for installing the repository's Node.js version
- A Mattermost server that supports plugins and plugin uploads
- An existing Mattermost bot connected to the desired agent service

### 1. Install basic Ubuntu tools

Open Ubuntu and run:

```bash
sudo apt update
sudo apt install -y git make curl ca-certificates
```

Verify them:

```bash
git --version
make --version
curl --version
```

Install Go using the [official Go installation instructions](https://go.dev/doc/install) if `go version` is missing or older than the version required by `go.mod`.

Install NVM using the [official NVM instructions](https://github.com/nvm-sh/nvm#installing-and-updating) if this command prints nothing:

```bash
command -v nvm
```

After installing NVM, reopen Ubuntu or load it into the current shell:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

### 2. Clone the repository

Using HTTPS:

```bash
cd ~
git clone https://github.com/johnle1812/Mattermost-Agent-Chat-Pluggin.git mattermost-agent-plugin
cd ~/mattermost-agent-plugin
```

If GitHub SSH authentication is already configured, use this instead of the HTTPS clone command:

```bash
git clone git@github.com:johnle1812/Mattermost-Agent-Chat-Pluggin.git mattermost-agent-plugin
```

Confirm the repository:

```bash
pwd
git remote -v
git status
```

### 3. Install Node.js and project dependencies

From the repository root:

```bash
cd ~/mattermost-agent-plugin
nvm install
nvm use
node --version
npm --version
```

Install the exact frontend dependency versions from `package-lock.json`:

```bash
cd ~/mattermost-agent-plugin/webapp
npm ci
cd ~/mattermost-agent-plugin
```

Go downloads backend dependencies automatically during a test or build. To download them in advance, run:

```bash
go mod download
```

### 4. Run validation checks

Run the backend tests from the repository root:

```bash
cd ~/mattermost-agent-plugin
go test ./server/...
```

Run the frontend checks:

```bash
cd ~/mattermost-agent-plugin/webapp
npm run check-types
npm run lint
npm test -- --runInBand
cd ~/mattermost-agent-plugin
```

All checks should finish successfully before distributing a bundle.

### 5. Build the uploadable `.tar.gz`

From the repository root, run:

```bash
cd ~/mattermost-agent-plugin
make dist
```

`make dist` performs the following operations:

1. Reads the plugin ID and version from `plugin.json`.
2. Generates the Go and TypeScript manifest files.
3. Builds the configured server binaries.
4. Builds the production React/TypeScript web application.
5. Copies the manifest, server, webapp, icons, and public assets into `dist/`.
6. Creates the uploadable `.tar.gz` archive.

The final output includes a line similar to:

```text
plugin built at: dist/com.designveloper.agent-assistant-0.3.1.tar.gz
```

Building does not connect to or upload anything to a Mattermost server.

### 6. Find and verify the bundle

List the generated bundle:

```bash
ls -lh dist/*.tar.gz
```

Inspect its contents without extracting it:

```bash
tar -tzf dist/com.designveloper.agent-assistant-0.3.1.tar.gz
```

The archive should contain entries such as:

```text
com.designveloper.agent-assistant/plugin.json
com.designveloper.agent-assistant/server/dist/plugin-linux-amd64
com.designveloper.agent-assistant/webapp/dist/main.js
com.designveloper.agent-assistant/assets/
com.designveloper.agent-assistant/public/
```

Do not extract the archive or place it inside a ZIP before uploading it to Mattermost.

On Windows, copy the bundle from Ubuntu to Downloads with:

```bash
cp ~/mattermost-agent-plugin/dist/com.designveloper.agent-assistant-0.3.1.tar.gz "/mnt/c/Users/your-windows-username/Downloads/"
```

Alternatively, open this location in Windows File Explorer and copy the file:

```text
\\wsl$\Ubuntu\home\your-ubuntu-username\mattermost-agent-plugin\dist
```

### 7. Upload the plugin to Mattermost

Sign in as a Mattermost system administrator and open:

```text
System Console > Plugins > Plugin Management
```

Then:

1. Select **Upload Plugin**.
2. Choose the generated `.tar.gz` file.
3. Replace the existing plugin if Mattermost asks.
4. Enable **Agent Assistant**.

An administrator with `mmctl` access can alternatively install and enable it with:

```bash
mmctl plugin add --force ./dist/com.designveloper.agent-assistant-0.3.1.tar.gz
mmctl plugin enable com.designveloper.agent-assistant
```

### 8. Configure Agent Assistant after uploading

Open:

```text
System Console > Plugins > Agent Assistant
```

Configure all three fields:

| Setting | Value to enter | How to find it | Example |
| --- | --- | --- | --- |
| Mattermost team name | The team's URL-safe name, not its display name or ID | In `https://mattermost.example.com/my-team/channels/town-square`, use `my-team`. | `my-team` |
| Default Mattermost channel name | The preferred channel's URL-safe name, not its display name or ID | In a URL ending in `/channels/agent-conversations`, use `agent-conversations`. | `agent-conversations` |
| Agent bot username | The existing bot username without `@` | Open the bot's profile or copy the username shown in a mention. | `your_agent_bot` |

Select **Save** after entering the values. Never enter a Mattermost access token, LLM key, webhook secret, JWT, or password in these fields.

The default channel is only the initial preference. Users can select any public or private channel they have joined in the configured team. A user who has not joined the default channel starts in their first accessible channel. A user who does not belong to the configured team receives a setup error.

Before testing, confirm:

1. The bot account exists and its username matches the plugin setting exactly.
2. The bot and intended users belong to each supported channel.
3. The external Mattermost gateway or Hermes integration monitors those channels.
4. A manual `@your_agent_bot` mention in a normal channel message produces a response.

The plugin does not store a bot token or call Hermes directly. It creates ordinary Mattermost posts and replies, while the external gateway detects the mention and posts the bot's response back into the same thread.

### 9. Verify the installation

1. Hard-refresh Mattermost with `Ctrl+Shift+R` if an older interface is cached.
2. Select the **Agent Assistant** icon in the right app bar.
3. Confirm the channel selector lists channels the user has joined in the configured team.
4. Confirm that existing channel root posts appear as conversations.
5. Create a conversation and send a message without mentioning the bot; it should remain a normal team message.
6. Select **Ask Agent** or type the configured bot mention and confirm that the bot replies in the same thread.
7. Use a second user to verify shared conversations and unread indicators.

### Rebuild after source changes

If dependencies have not changed:

```bash
cd ~/mattermost-agent-plugin
nvm use
make dist
```

If `package.json` or `package-lock.json` changed:

```bash
cd ~/mattermost-agent-plugin/webapp
npm ci
cd ~/mattermost-agent-plugin
make dist
```

### Update an existing clone before rebuilding

If another maintainer has pushed changes to the remote repository, update the local clone before creating a new bundle:

```bash
cd ~/mattermost-agent-plugin
git status
git pull --ff-only
nvm use
cd webapp
npm ci
cd ..
make dist
```

Do not run `git pull` over uncommitted local work without first reviewing `git status` and deciding whether to commit, stash, or preserve those changes.

### Common build problems

- **`go: command not found`**: install Go and reopen Ubuntu so the updated `PATH` is loaded.
- **Wrong `npm` is used**: run `nvm use` and verify that `which npm` points inside the Ubuntu NVM directory, not `/mnt/c/Program Files/nodejs/`.
- **`make: command not found`**: run `sudo apt install -y make`.
- **`fatal: No names found, cannot describe anything`**: if the build continues and prints `plugin built at: ...`, the archive was still created; the warning means the repository has no matching Git version tag.
- **Mattermost rejects the upload**: `make dist` only builds the file. Ask a system administrator to enable plugin uploads or install it through `mmctl`.
- **Mattermost shows the old UI**: upload the newest archive, replace or re-enable the plugin if needed, and hard-refresh with `Ctrl+Shift+R`.

### Short command checklist

For an already configured Ubuntu environment, the normal clone-to-bundle workflow is:

```bash
cd ~
git clone https://github.com/johnle1812/Mattermost-Agent-Chat-Pluggin.git mattermost-agent-plugin
cd ~/mattermost-agent-plugin
nvm install
nvm use
cd webapp
npm ci
npm run check-types
npm run lint
npm test -- --runInBand
cd ..
go test ./server/...
make dist
ls -lh dist/*.tar.gz
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

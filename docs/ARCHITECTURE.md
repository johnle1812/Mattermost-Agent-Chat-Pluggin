# Architecture

## Components

### Mattermost web app

The React/TypeScript web app owns the visible experience:

- registers the right-hand sidebar and app-bar icon;
- resolves the configured team, channel, and bot through Mattermost APIs;
- reads channel root posts and their replies;
- maps Mattermost posts to conversation and message view models;
- creates posts, replies, and root-post metadata updates;
- listens for Mattermost websocket post events and refreshes the UI;
- derives native unread reply counts for the current user.

### Mattermost server plugin

The Go server component is intentionally small. It loads the three administrator settings and exposes them to authenticated Mattermost users through `GET /plugins/{plugin-id}/api/v1/config`. It never exposes or stores bot credentials.

### Bot and agent service

The bot integration is external to this repository. The plugin sends normal Mattermost posts. A separately deployed Mattermost gateway observes eligible posts, invokes the agent, and writes replies as the bot account. This keeps the plugin independent of a specific Hermes, n8n, or model deployment.

## Data ownership

| Data | Storage | Scope |
| --- | --- | --- |
| Messages and replies | Mattermost posts | Shared with channel members |
| Conversation title and owner | Root-post props | Shared with channel members |
| Read/unread state | Mattermost thread state | Per user |
| Pinned conversations | Browser `localStorage` | Per browser/user session |
| Agent credentials and memory | External gateway/agent stack | Outside this plugin |

## Important identifiers

The plugin ID and post-property keys are stable protocol identifiers. Renaming CSS classes is harmless, but changing any of these values requires a data-migration and upgrade plan:

- `com.designveloper.agent-assistant`
- `com_designveloper_agent_conversation`
- browser storage keys derived from the plugin ID

## Security boundary

The configuration API requires a valid Mattermost user session. It returns only team, channel, and bot usernames. Authorization for reading or posting messages remains enforced by Mattermost channel membership and permissions. Agent/provider credentials belong in the external gateway's secret store, not in the browser bundle or plugin settings.

# Architecture

## Components

### Mattermost web app

The React/TypeScript web app owns the visible experience:

- registers the right-hand sidebar and app-bar icon;
- resolves the configured team, default channel, and bot through Mattermost APIs;
- lists the public and private channels available to the signed-in user;
- selects the configured default only when the user belongs to it, otherwise choosing the first accessible channel;
- lists every normal, non-deleted root post from the user's selected channel, including roots with no replies;
- loads channel summaries in pages and fetches the complete reply thread and participant list only when opened;
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
| Selected channel and pinned conversations | Browser `localStorage` | Per browser/user session |
| Agent credentials and memory | External gateway/agent stack | Outside this plugin |

## Important identifiers

The plugin ID and post-property keys are stable protocol identifiers. Renaming CSS classes is harmless, but changing any of these values requires a data-migration and upgrade plan:

- `com.designveloper.agent-assistant`
- `com_designveloper_agent_conversation`
- browser storage keys derived from the plugin ID

## Security boundary

The configuration API requires a valid Mattermost user session. It returns only the team, default channel, and bot usernames. The web app obtains the user's channel list directly from Mattermost. Authorization for reading or posting messages remains enforced by Mattermost channel membership and permissions. Agent/provider credentials belong in the external gateway's secret store, not in the browser bundle or plugin settings.

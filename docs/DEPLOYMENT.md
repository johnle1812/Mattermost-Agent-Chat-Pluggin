# Deployment and server migration

## Values that change per Mattermost server

These are the only server coordinates the plugin requires:

- **Team name**: the URL-safe team name, not the display name or team ID.
- **Default channel name**: the preferred URL-safe channel, not the display name or channel ID. Users who have not joined it fall back to their first accessible channel.
- **Bot username**: the Mattermost username without `@`, not a token or user ID.

They are entered after installation in **System Console > Plugins > Agent Assistant**. Do not edit source code for each environment.

## Values managed outside this repository

- Mattermost bot access token
- gateway service token or JWT secret
- LLM/API key
- model/provider configuration
- proxy, webhook, or upstream-service credentials

Those values must be configured in the bot gateway or agent stack used by the target server. Agent Assistant neither needs nor accepts them.

## New-server checklist

1. Create or choose a default Mattermost channel for shared conversations.
2. Add the bot and intended users to every channel that should support the agent.
3. Confirm the external gateway reacts when a user manually mentions the bot in each supported channel.
4. Build this repository with `make dist`.
5. Upload and enable the generated `.tar.gz` as a Mattermost system administrator.
6. Set team name, default channel name, and bot username in the plugin settings.
7. Open the RHS, switch channels, and verify that each channel's existing threads appear.
8. Create a conversation, mention the bot, and confirm its reply remains in the same thread.
9. Test unread counts using a second user.

## Troubleshooting

### “Agent Assistant is not configured”

One or more required plugin settings are blank. Complete all three fields and save.

### The bot does not reply

First test a direct `@bot_username` mention in the selected Mattermost channel. If that fails, ensure the bot is a channel member and the external gateway monitors that channel. If direct channel mentions work, verify the plugin's bot username and team name match exactly.

### The RHS cannot load conversations

Confirm the user belongs to the configured team and selected channel, the plugin is enabled, and the configured names are URL-safe names rather than display names.

### A new plugin appears instead of upgrading

The bundle's `plugin.json` ID changed. Mattermost uses the plugin ID as identity; keep the existing ID for upgrades.

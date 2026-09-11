import manifest from 'manifest';

import type {Post} from '@mattermost/types/posts';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import type {Conversation, Message} from '../types/conversation';

export const AGENT_POST_CHANGED_EVENT = `${manifest.id}.post-changed`;
export const AGENT_UNREAD_CHANGED_EVENT = `${manifest.id}.unread-changed`;
export const AGENT_CHANNEL_CHANGED_EVENT = `${manifest.id}.channel-changed`;

const CONVERSATION_PROP = 'com_designveloper_agent_conversation';
const STREAM_STATUS_PROP = 'com_designveloper_agent_stream_status';
const STREAM_PROGRESS_PROP = 'com_designveloper_agent_progress';
const PINNED_STORAGE_KEY = `${manifest.id}.pinned-conversations`;
const LEGACY_PINNED_STORAGE_KEY = 'com.designveloper.seo-assistant.pinned-conversations';
const PLUGIN_API_BASE = `/plugins/${manifest.id}/api/v1`;
const POSTS_PER_PAGE = 50;
const SELECTED_CHANNEL_STORAGE_PREFIX = `${manifest.id}.selected-channel`;

type ConversationMetadata = {
    title?: string;
    owner_id?: string;
};

export type AgentChannelContext = {
    botUsername: string;
    botDisplayName: string;
    botUserId: string;
    channelId: string;
    currentUserId: string;
    teamId: string;
    teamName: string;
    channelName: string;
    channelDisplayName: string;
    channelType: 'O' | 'P';
    channels: AgentChannelOption[];
};

export type AgentChannelOption = {
    id: string;
    name: string;
    displayName: string;
    type: 'O' | 'P';
};

export type AgentMentionUser = {
    displayName: string;
    id: string;
    isBot: boolean;
    username: string;
};

export type AgentConversationPage = {
    conversations: Conversation[];
    hasMore: boolean;
};

type AgentConnectionConfig = {
    bot_username: string;
    channel_name: string;
    team_name: string;
};

function metadataFor(post: Post): ConversationMetadata | null {
    const value = post.props?.[CONVERSATION_PROP];
    return value && typeof value === 'object' ? value as ConversationMetadata : null;
}

function displayName(profile: UserProfile | undefined, currentUserId: string): string {
    if (!profile) {
        return 'Unknown user';
    }
    if (profile.id === currentUserId) {
        return 'You';
    }

    return profile.nickname || `${profile.first_name} ${profile.last_name}`.trim() || profile.username;
}

function stripBotMention(message: string, botUsername: string): string {
    return message.replace(new RegExp(`(^|\\s)@${botUsername}\\b`, 'gi'), ' ').trim();
}

function isConversationRoot(post: Post): boolean {
    // Mattermost's ordinary user and bot posts have an empty type. System posts
    // (join/leave messages, header changes, and similar events) use a named type
    // and should not become conversations in the assistant library.
    return !post.root_id && !post.delete_at && Boolean(metadataFor(post) || post.type === '');
}

function titleFromRoot(root: Post, botUsername: string, owner: string): string {
    const firstMeaningfulLine = stripBotMention(root.message, botUsername).
        split(/\r?\n/).
        map((line) => line.replace(/^\s*(?:[-*>#]+|\d+[.)])\s*/, '').replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim()).
        find(Boolean);

    if (!firstMeaningfulLine) {
        return `Thread by ${owner}`;
    }
    if (firstMeaningfulLine.length <= 80) {
        return firstMeaningfulLine;
    }
    return `${firstMeaningfulLine.slice(0, 77).trimEnd()}…`;
}

function pinnedConversationIds(): Set<string> {
    try {
        const current = JSON.parse(window.localStorage.getItem(PINNED_STORAGE_KEY) || '[]');
        const legacy = JSON.parse(window.localStorage.getItem(LEGACY_PINNED_STORAGE_KEY) || '[]');
        const stored = [
            ...(Array.isArray(current) ? current : []),
            ...(Array.isArray(legacy) ? legacy : []),
        ];
        return new Set(stored.filter((value) => typeof value === 'string'));
    } catch {
        return new Set();
    }
}

export function setConversationPinned(conversationId: string, pinned: boolean): void {
    const pinnedIds = pinnedConversationIds();
    if (pinned) {
        pinnedIds.add(conversationId);
    } else {
        pinnedIds.delete(conversationId);
    }
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(Array.from(pinnedIds)));
}

export async function resolveAgentChannel(): Promise<AgentChannelContext> {
    Client4.setUrl(window.location.origin);

    const configResponse = await fetch(
        `${PLUGIN_API_BASE}/config`,
        Client4.getOptions({method: 'GET'}),
    );
    if (!configResponse.ok) {
        throw new Error(`Unable to load Agent Assistant configuration (${configResponse.status}).`);
    }
    const config = await configResponse.json() as AgentConnectionConfig;

    const [team, bot, currentUser] = await Promise.all([
        Client4.getTeamByName(config.team_name),
        Client4.getUserByUsername(config.bot_username),
        Client4.getMe(),
    ]);

    const myChannels = await Client4.getMyChannels(team.id, false);
    const channels = myChannels.
        filter((channel) => !channel.delete_at && (channel.type === 'O' || channel.type === 'P')).
        map((channel): AgentChannelOption => ({
            id: channel.id,
            name: channel.name,
            displayName: channel.display_name,
            type: channel.type as 'O' | 'P',
        })).
        sort((left, right) => left.displayName.localeCompare(right.displayName));

    const storageKey = `${SELECTED_CHANNEL_STORAGE_PREFIX}.${currentUser.id}.${team.id}`;
    const storedChannelId = window.localStorage.getItem(storageKey);
    const selectedChannel = channels.find((channel) => channel.id === storedChannelId) ??
        channels.find((channel) => channel.name === config.channel_name) ?? channels[0];

    if (!selectedChannel) {
        throw new Error(`You have not joined any channels in the ${team.display_name} team.`);
    }

    window.localStorage.setItem(storageKey, selectedChannel.id);

    return {
        botUsername: config.bot_username,
        botDisplayName: displayName(bot, currentUser.id),
        botUserId: bot.id,
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        channelDisplayName: selectedChannel.displayName,
        channelType: selectedChannel.type,
        channels,
        currentUserId: currentUser.id,
        teamId: team.id,
        teamName: team.name,
    };
}

export function contextForAgentChannel(context: AgentChannelContext, channelId: string): AgentChannelContext {
    const channel = context.channels.find((option) => option.id === channelId);
    if (!channel) {
        return context;
    }

    return {
        ...context,
        channelId: channel.id,
        channelName: channel.name,
        channelDisplayName: channel.displayName,
        channelType: channel.type,
    };
}

export function selectAgentChannel(context: AgentChannelContext, channelId: string): void {
    const nextContext = contextForAgentChannel(context, channelId);
    if (nextContext.channelId === context.channelId) {
        return;
    }

    const storageKey = `${SELECTED_CHANNEL_STORAGE_PREFIX}.${context.currentUserId}.${context.teamId}`;
    window.localStorage.setItem(storageKey, nextContext.channelId);
    window.dispatchEvent(new CustomEvent<string>(AGENT_CHANNEL_CHANGED_EVENT, {
        detail: nextContext.channelId,
    }));
}

export async function loadAgentMentionUsers(context: AgentChannelContext): Promise<AgentMentionUser[]> {
    const pageSize = 200;
    const profiles: UserProfile[] = [];

    const loadPage = async (page: number): Promise<void> => {
        const pageProfiles = await Client4.getProfilesInChannel(context.channelId, page, pageSize);
        profiles.push(...pageProfiles);
        if (pageProfiles.length === pageSize) {
            await loadPage(page + 1);
        }
    };

    await loadPage(0);
    const users = profiles.filter((profile) => !profile.delete_at).map((profile) => {
        const profileName = profile.nickname || `${profile.first_name} ${profile.last_name}`.trim() || profile.username;
        return {
            displayName: profile.id === context.currentUserId ? `${profileName} (you)` : profileName,
            id: profile.id,
            isBot: profile.is_bot,
            username: profile.username,
        };
    });
    if (!users.some((user) => user.id === context.botUserId)) {
        users.unshift({
            displayName: context.botDisplayName,
            id: context.botUserId,
            isBot: true,
            username: context.botUsername,
        });
    }
    return users;
}

export async function loadAgentUserProfile(userId: string): Promise<UserProfile> {
    return Client4.getUser(userId);
}

export function publishAgentUnreadCount(count: number): void {
    window.dispatchEvent(new CustomEvent<number>(AGENT_UNREAD_CHANGED_EVENT, {
        detail: Math.max(0, count),
    }));
}

export async function loadAgentUnreadCount(
    context: AgentChannelContext,
    channelIds: string[] = [context.channelId],
): Promise<number> {
    const pageSize = 100;
    let unreadCount = 0;
    const includedChannelIds = new Set(channelIds);

    const loadPage = async (after = ''): Promise<void> => {
        const userThreads = await Client4.getUserThreads(context.currentUserId, context.teamId, {
            after,
            extended: true,
            perPage: pageSize,
            unread: true,
        });
        userThreads.threads.forEach((thread) => {
            if (includedChannelIds.has(thread.post.channel_id)) {
                unreadCount += thread.unread_replies;
            }
        });

        if (userThreads.threads.length === pageSize) {
            const nextAfter = userThreads.threads[userThreads.threads.length - 1].id;
            if (nextAfter && nextAfter !== after) {
                await loadPage(nextAfter);
            }
        }
    };

    await loadPage();
    return unreadCount;
}

async function unreadRepliesByRoot(
    context: AgentChannelContext,
    channelIds: string[] = [context.channelId],
): Promise<Map<string, number>> {
    const pageSize = 100;
    const includedChannelIds = new Set(channelIds);
    const unreadByRoot = new Map<string, number>();

    const loadPage = async (after = ''): Promise<void> => {
        const userThreads = await Client4.getUserThreads(context.currentUserId, context.teamId, {
            after,
            extended: true,
            perPage: pageSize,
            unread: true,
        });
        userThreads.threads.forEach((thread) => {
            if (includedChannelIds.has(thread.post.channel_id)) {
                unreadByRoot.set(thread.id, thread.unread_replies);
            }
        });

        if (userThreads.threads.length === pageSize) {
            const nextAfter = userThreads.threads[userThreads.threads.length - 1].id;
            if (nextAfter && nextAfter !== after) {
                await loadPage(nextAfter);
            }
        }
    };

    await loadPage();
    return unreadByRoot;
}

function messageFromPost(
    post: Post,
    profiles: Record<string, UserProfile>,
    context: AgentChannelContext,
): Message {
    const isAssistant = post.user_id === context.botUserId;
    const progress = post.props?.[STREAM_PROGRESS_PROP];
    const progressSteps = Array.isArray(progress) ? progress.filter((step): step is string => typeof step === 'string') : undefined;
    let content = post.message;
    if (isAssistant) {
        content = progressSteps ? '' : post.message;
    }
    return {
        id: post.id,
        role: isAssistant ? 'assistant' : 'user',
        author: displayName(profiles[post.user_id], context.currentUserId),
        userId: post.user_id,
        content,
        createdAt: new Date(post.create_at).toISOString(),
        thinking: progressSteps,
        streaming: isAssistant && post.props?.[STREAM_STATUS_PROP] === 'streaming',
    };
}

async function conversationFromRoot(root: Post, context: AgentChannelContext): Promise<Conversation> {
    const [thread, userThread] = await Promise.all([
        Client4.getPostThread(root.id, true),
        Client4.getUserThread(context.currentUserId, context.teamId, root.id).catch(() => null),
    ]);
    const allPosts = Object.values(thread.posts);
    const userIds = Array.from(new Set(allPosts.map((post) => post.user_id).filter(Boolean)));
    const profileList = userIds.length > 0 ? await Client4.getProfilesByIds(userIds) : [];
    const profiles = Object.fromEntries(profileList.map((profile) => [profile.id, profile]));
    const pinnedIds = pinnedConversationIds();
    const orderedPosts = thread.order.
        map((postId) => thread.posts[postId]).
        filter((post): post is Post => Boolean(post)).
        sort((left, right) => left.create_at - right.create_at);
    const metadata = metadataFor(root);
    const messages = orderedPosts.map((post) => messageFromPost(post, profiles, context));
    const lastPost = orderedPosts[orderedPosts.length - 1] || root;
    const owner = displayName(profiles[root.user_id], context.currentUserId);
    const participantIds = Array.from(new Set(orderedPosts.
        map((post) => post.user_id).
        filter((userId) => Boolean(userId) && userId !== context.botUserId)));
    const participants = participantIds.map((userId) => ({
        id: userId,
        name: displayName(profiles[userId], context.currentUserId),
    }));

    return {
        id: root.id,
        rootPostId: root.id,
        channelId: root.channel_id,
        title: metadata?.title || titleFromRoot(root, context.botUsername, owner),
        owner,
        ownerId: metadata?.owner_id || root.user_id,
        participants,
        unreadCount: userThread?.unread_replies ?? 0,
        pinned: pinnedIds.has(root.id),
        updatedAt: new Date(lastPost.update_at || lastPost.create_at).toISOString(),
        messages,
        threadLoaded: true,
    };
}

function conversationSummaryFromRoot(
    root: Post,
    profiles: Record<string, UserProfile>,
    unreadByRoot: Map<string, number>,
    context: AgentChannelContext,
): Conversation {
    const metadata = metadataFor(root);
    const owner = displayName(profiles[root.user_id], context.currentUserId);
    const participants = root.user_id === context.botUserId ? [] : [{
        id: root.user_id,
        name: owner,
    }];

    return {
        id: root.id,
        rootPostId: root.id,
        channelId: root.channel_id,
        title: metadata?.title || titleFromRoot(root, context.botUsername, owner),
        owner,
        ownerId: metadata?.owner_id || root.user_id,
        participants,
        unreadCount: unreadByRoot.get(root.id) ?? 0,
        pinned: pinnedConversationIds().has(root.id),
        updatedAt: new Date(root.last_reply_at || root.update_at || root.create_at).toISOString(),
        messages: [messageFromPost(root, profiles, context)],
        threadLoaded: (root.reply_count ?? 0) === 0,
    };
}

export async function markAgentConversationRead(
    context: AgentChannelContext,
    rootPostId: string,
): Promise<void> {
    await Client4.updateThreadReadForUser(
        context.currentUserId,
        context.teamId,
        rootPostId,
        Date.now(),
    );
}

export async function loadAgentConversation(
    context: AgentChannelContext,
    rootPostId: string,
): Promise<Conversation | null> {
    const root = await Client4.getPost(rootPostId);
    if (root.channel_id !== context.channelId || !isConversationRoot(root)) {
        return null;
    }
    return conversationFromRoot(root, context);
}

export async function loadAgentConversations(
    context: AgentChannelContext,
    page = 0,
): Promise<AgentConversationPage> {
    const postList = await Client4.getPosts(context.channelId, page, POSTS_PER_PAGE, false);
    const roots = postList.order.
        map((postId) => postList.posts[postId]).
        filter((post): post is Post => Boolean(post && isConversationRoot(post)));
    const userIds = Array.from(new Set(roots.map((root) => root.user_id).filter(Boolean)));
    const [profileList, unreadByRoot] = await Promise.all([
        userIds.length > 0 ? Client4.getProfilesByIds(userIds) : Promise.resolve([]),
        unreadRepliesByRoot(context),
    ]);
    const profiles = Object.fromEntries(profileList.map((profile) => [profile.id, profile]));

    return {
        conversations: roots.map((root) => conversationSummaryFromRoot(root, profiles, unreadByRoot, context)),
        hasMore: postList.order.length === POSTS_PER_PAGE,
    };
}

export async function createAgentConversation(
    context: AgentChannelContext,
    title: string,
    message: string,
): Promise<Post> {
    return Client4.createPost({
        channel_id: context.channelId,
        message,
        props: {
            [CONVERSATION_PROP]: {
                owner_id: context.currentUserId,
                title,
            },
        },
    });
}

export async function replyToAgentConversation(
    context: AgentChannelContext,
    rootPostId: string,
    message: string,
): Promise<Post> {
    return Client4.createPost({
        channel_id: context.channelId,
        root_id: rootPostId,
        message,
    });
}

export async function renameAgentConversation(
    rootPostId: string,
    ownerId: string,
    title: string,
): Promise<void> {
    const root = await Client4.getPost(rootPostId);
    await Client4.patchPost({
        id: rootPostId,
        props: {
            ...(root.props || {}),
            [CONVERSATION_PROP]: {
                owner_id: ownerId,
                title,
            },
        },
    });
}

import manifest from 'manifest';

import type {Post} from '@mattermost/types/posts';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import type {Conversation, Message} from '../types/conversation';

export const AGENT_POST_CHANGED_EVENT = `${manifest.id}.post-changed`;
export const AGENT_UNREAD_CHANGED_EVENT = `${manifest.id}.unread-changed`;

const CONVERSATION_PROP = 'com_designveloper_agent_conversation';
const STREAM_STATUS_PROP = 'com_designveloper_agent_stream_status';
const STREAM_PROGRESS_PROP = 'com_designveloper_agent_progress';
const PINNED_STORAGE_KEY = `${manifest.id}.pinned-conversations`;
const LEGACY_PINNED_STORAGE_KEY = 'com.designveloper.seo-assistant.pinned-conversations';
const PLUGIN_API_BASE = `/plugins/${manifest.id}/api/v1`;
const POSTS_PER_PAGE = 200;

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
};

export type AgentMentionUser = {
    displayName: string;
    id: string;
    isBot: boolean;
    username: string;
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
    return !post.root_id && Boolean(metadataFor(post) || (post.reply_count ?? 0) > 0);
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

    const [channel, bot, currentUser] = await Promise.all([
        Client4.getChannelByNameAndTeamName(config.team_name, config.channel_name),
        Client4.getUserByUsername(config.bot_username),
        Client4.getMe(),
    ]);

    return {
        botUsername: config.bot_username,
        botDisplayName: displayName(bot, currentUser.id),
        botUserId: bot.id,
        channelId: channel.id,
        currentUserId: currentUser.id,
        teamId: channel.team_id,
        teamName: config.team_name,
    };
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

export function publishAgentUnreadCount(count: number): void {
    window.dispatchEvent(new CustomEvent<number>(AGENT_UNREAD_CHANGED_EVENT, {
        detail: Math.max(0, count),
    }));
}

export async function loadAgentUnreadCount(context: AgentChannelContext): Promise<number> {
    const pageSize = 100;
    let unreadCount = 0;

    const loadPage = async (after = ''): Promise<void> => {
        const userThreads = await Client4.getUserThreads(context.currentUserId, context.teamId, {
            after,
            extended: true,
            perPage: pageSize,
            unread: true,
        });
        userThreads.threads.forEach((thread) => {
            if (thread.post.channel_id === context.channelId) {
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

export async function loadAgentConversations(context: AgentChannelContext): Promise<Conversation[]> {
    const rootById = new Map<string, Post>();
    const loadPage = async (page: number): Promise<void> => {
        const postList = await Client4.getPosts(context.channelId, page, POSTS_PER_PAGE, false);
        postList.order.
            map((postId) => postList.posts[postId]).
            filter((post): post is Post => Boolean(post && isConversationRoot(post))).
            forEach((post) => rootById.set(post.id, post));
        if (postList.order.length === POSTS_PER_PAGE) {
            await loadPage(page + 1);
        }
    };

    await loadPage(0);

    const roots = Array.from(rootById.values());

    return Promise.all(roots.map((root) => conversationFromRoot(root, context)));
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

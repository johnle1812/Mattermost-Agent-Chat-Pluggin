import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import type {UserProfile} from '@mattermost/types/users';

import StreamingMessageText from './streaming_message_text';

import {
    AGENT_CHANNEL_CHANGED_EVENT,
    AGENT_POST_CHANGED_EVENT,
    AGENT_TYPING_EVENT,
    contextForAgentChannel,
    createAgentConversation,
    loadAgentConversation,
    loadAgentConversations,
    loadAgentMentionUsers,
    loadAgentUserProfile,
    markAgentConversationRead,
    publishAgentUnreadCount,
    renameAgentConversation,
    replyToAgentConversation,
    resolveAgentChannel,
    selectAgentChannel,
    setConversationPinned,
} from '../../api/agent_channel';
import type {AgentChannelContext, AgentMentionUser} from '../../api/agent_channel';
import type {Conversation, ConversationSort, Message} from '../../types/conversation';
import {filterAndSortConversations} from '../../utils/conversations';
import {
    conversationPreview,
    CURRENT_USER_LABEL,
    formatMessageTime,
    formatRelativeTime,
    initialsFor,
    makeClientId,
    mentionSearchAtCursor,
    messageMentionsBot,
    profileImageURL,
} from '../../utils/display';
import type {MentionSearch} from '../../utils/display';
import type {AgentAssistantLocation} from '../agent_assistant_modal/events';
import {
    CLOSE_AGENT_ASSISTANT_MODAL_EVENT,
    openAgentAssistantModal,
} from '../agent_assistant_modal/events';

import './rhs_panel.scss';

type View = 'library' | 'chat';

type ContextMenuState = {
    conversationId: string;
    left: number;
    top: number;
};

type ProfilePopoverState = {
    left: number;
    loading: boolean;
    profile: UserProfile | null;
    top: number;
    user: AgentMentionUser;
};

const REFRESH_INTERVAL_MS = 4000;
const BOTTOM_FOLLOW_DISTANCE_PX = 72;
const SINGLE_CLICK_DELAY_MS = 240;
const MAX_VISIBLE_PARTICIPANTS = 3;
const AGENT_TYPING_EXPIRY_MS = 8000;

function mergeConversationSummaries(current: Conversation[], incoming: Conversation[]): Conversation[] {
    const incomingIds = new Set(incoming.map((conversation) => conversation.id));
    const currentById = new Map(current.map((conversation) => [conversation.id, conversation]));
    const mergedIncoming = incoming.map((summary) => {
        const existing = currentById.get(summary.id);
        if (!existing?.threadLoaded) {
            return summary;
        }

        return {
            ...summary,
            messages: existing.messages,
            participants: existing.participants,
            threadLoaded: true,
        };
    });

    return [
        ...current.filter((conversation) => !conversation.rootPostId),
        ...mergedIncoming,
        ...current.filter((conversation) => conversation.rootPostId && !incomingIds.has(conversation.id)),
    ];
}

type RHSPanelProps = {
    initialConversationId?: string | null;
    initialDraft?: string;
    initialView?: View;
    layout?: 'rhs' | 'modal';
    onLocationChange?: (location: AgentAssistantLocation) => void;
    onNavigateToConversation: (permalink: string) => void;
};

const RHSPanel = ({
    initialConversationId = null,
    initialDraft = '',
    initialView = 'library',
    layout = 'rhs',
    onLocationChange,
    onNavigateToConversation,
}: RHSPanelProps) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [agentContext, setAgentContext] = useState<AgentChannelContext | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextConversationPage, setNextConversationPage] = useState(1);
    const [hasMoreConversations, setHasMoreConversations] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState<View>(initialView);
    const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
    const [search, setSearch] = useState('');
    const [owner, setOwner] = useState('All');
    const [sort, setSort] = useState<ConversationSort>('updated');
    const [draft, setDraft] = useState(initialDraft);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [expandedThinkingIds, setExpandedThinkingIds] = useState<string[]>([]);
    const [awaitingConversationIds, setAwaitingConversationIds] = useState<string[]>([]);
    const [typingMessageIds, setTypingMessageIds] = useState<string[]>([]);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [profilePopover, setProfilePopover] = useState<ProfilePopoverState | null>(null);
    const [libraryRenameId, setLibraryRenameId] = useState<string | null>(null);
    const [libraryTitleDraft, setLibraryTitleDraft] = useState('');
    const [mentionUsers, setMentionUsers] = useState<AgentMentionUser[]>([]);
    const [mentionUsersLoading, setMentionUsersLoading] = useState(false);
    const [mentionUsersError, setMentionUsersError] = useState(false);
    const [mentionSearch, setMentionSearch] = useState<MentionSearch | null>(null);
    const [activeMentionIndex, setActiveMentionIndex] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const messageListRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const followBottomRef = useRef(true);
    const conversationClickTimerRef = useRef<number | undefined>();
    const modalLocationRef = useRef<AgentAssistantLocation>({
        conversationId: initialConversationId,
        draft: initialDraft,
        view: initialView,
    });

    modalLocationRef.current = {conversationId: selectedId, draft, view};

    useEffect(() => {
        onLocationChange?.({conversationId: selectedId, draft, view});
    }, [draft, onLocationChange, selectedId, view]);

    useEffect(() => {
        if (layout !== 'rhs') {
            return undefined;
        }

        const restoreLocation = (event: Event) => {
            const location = (event as CustomEvent<AgentAssistantLocation>).detail;
            if (!location) {
                return;
            }
            setSelectedId(location.conversationId);
            setDraft(location.draft);
            setView(location.conversationId ? location.view : 'library');
        };

        window.addEventListener(CLOSE_AGENT_ASSISTANT_MODAL_EVENT, restoreLocation);
        return () => window.removeEventListener(CLOSE_AGENT_ASSISTANT_MODAL_EVENT, restoreLocation);
    }, [layout]);

    useEffect(() => {
        if (layout !== 'rhs') {
            return undefined;
        }

        const sidebar = panelRef.current?.closest<HTMLElement>('#sidebar-right');
        if (!sidebar) {
            return undefined;
        }

        const widthHolder = sidebar.previousElementSibling;
        sidebar.classList.add('agent-assistant-rhs');
        if (widthHolder?.classList.contains('sidebar--right--width-holder')) {
            widthHolder.classList.add('agent-assistant-rhs-width-holder');
        }

        const openModalFromNativeExpand = (event: MouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target?.closest('.sidebar--right__expand')) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            openAgentAssistantModal(modalLocationRef.current);
        };

        sidebar.addEventListener('click', openModalFromNativeExpand, true);
        return () => {
            sidebar.removeEventListener('click', openModalFromNativeExpand, true);
            sidebar.classList.remove('agent-assistant-rhs');
            widthHolder?.classList.remove('agent-assistant-rhs-width-holder');
        };
    }, [layout]);

    useEffect(() => {
        let cancelled = false;

        const start = async () => {
            try {
                const context = await resolveAgentChannel();
                if (cancelled) {
                    return;
                }
                setAgentContext(context);
            } catch (setupError) {
                if (!cancelled) {
                    setLoading(false);
                    setError(setupError instanceof Error ? setupError.message : 'Unable to connect to the agent channel.');
                }
            }
        };

        start().catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!agentContext) {
            return undefined;
        }

        let cancelled = false;
        let initialRefresh = true;
        const refresh = async () => {
            try {
                const page = await loadAgentConversations(agentContext, 0);
                if (!cancelled) {
                    setConversations((current) => mergeConversationSummaries(current, page.conversations));
                    if (initialRefresh) {
                        setHasMoreConversations(page.hasMore);
                        initialRefresh = false;
                    }
                    setError('');
                }
            } catch (refreshError) {
                if (!cancelled) {
                    setError(refreshError instanceof Error ? refreshError.message : 'Unable to load agent conversations.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        setLoading(true);
        setNextConversationPage(1);
        setHasMoreConversations(false);
        refresh().catch(() => undefined);
        const refreshTimer = window.setInterval(() => refresh().catch(() => undefined), REFRESH_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
        };
    }, [agentContext]);

    useEffect(() => {
        if (!agentContext) {
            return undefined;
        }

        const changeChannel = (event: Event) => {
            const channelId = (event as CustomEvent<string>).detail;
            if (!channelId || channelId === agentContext.channelId) {
                return;
            }

            const nextContext = contextForAgentChannel(agentContext, channelId);
            if (nextContext.channelId === agentContext.channelId) {
                return;
            }

            setConversations([]);
            setSelectedId(null);
            setView('library');
            setDraft('');
            setSearch('');
            setOwner('All');
            setContextMenu(null);
            setProfilePopover(null);
            setAwaitingConversationIds([]);
            setTypingMessageIds([]);
            setLoadingConversationId(null);
            setLoadingMore(false);
            setNextConversationPage(1);
            setHasMoreConversations(false);
            setAgentContext(nextContext);
        };

        window.addEventListener(AGENT_CHANNEL_CHANGED_EVENT, changeChannel);
        return () => window.removeEventListener(AGENT_CHANNEL_CHANGED_EVENT, changeChannel);
    }, [agentContext]);

    useEffect(() => {
        if (!agentContext) {
            return undefined;
        }

        let cancelled = false;
        setMentionUsersLoading(true);
        setMentionUsersError(false);
        loadAgentMentionUsers(agentContext).then((users) => {
            if (!cancelled) {
                setMentionUsers(users);
            }
        }).catch(() => {
            if (!cancelled) {
                setMentionUsers([{
                    displayName: agentContext.botDisplayName,
                    id: agentContext.botUserId,
                    isBot: true,
                    username: agentContext.botUsername,
                }]);
                setMentionUsersError(true);
            }
        }).finally(() => {
            if (!cancelled) {
                setMentionUsersLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [agentContext]);

    useEffect(() => {
        if (!agentContext) {
            return undefined;
        }

        let cancelled = false;
        let refreshTimer: number | undefined;
        const typingExpiryTimers = new Map<string, number>();
        const handlePostChange = (event: Event) => {
            const post = (event as CustomEvent<{channel_id: string; id: string; root_id?: string; user_id: string; props?: Record<string, unknown>}>).detail;
            if (!post || post.channel_id !== agentContext.channelId) {
                return;
            }

            const rootPostId = post.root_id || post.id;
            if (post.user_id === agentContext.botUserId) {
                const typingExpiryTimer = typingExpiryTimers.get(rootPostId);
                if (typingExpiryTimer) {
                    window.clearTimeout(typingExpiryTimer);
                    typingExpiryTimers.delete(rootPostId);
                }
                setAwaitingConversationIds((current) => current.filter((id) => id !== rootPostId));
                setTypingMessageIds((current) => (current.includes(post.id) ? current : [...current, post.id]));
            }
            if (refreshTimer) {
                window.clearTimeout(refreshTimer);
            }
            refreshTimer = window.setTimeout(() => {
                loadAgentConversation(agentContext, rootPostId).then((conversation) => {
                    if (cancelled || !conversation) {
                        return;
                    }
                    setConversations((current) => {
                        const exists = current.some((item) => item.id === conversation.id);
                        return exists ? current.map((item) => (item.id === conversation.id ? conversation : item)) : [conversation, ...current];
                    });
                }).catch(() => undefined);
            }, 80);
        };

        const handleAgentTyping = (event: Event) => {
            const typing = (event as CustomEvent<{channel_id: string; parent_id?: string; user_id: string}>).detail;
            const rootPostId = typing?.parent_id;
            if (
                !rootPostId ||
                typing.channel_id !== agentContext.channelId ||
                typing.user_id !== agentContext.botUserId
            ) {
                return;
            }

            setAwaitingConversationIds((current) => (
                current.includes(rootPostId) ? current : [...current, rootPostId]
            ));
            const currentTimer = typingExpiryTimers.get(rootPostId);
            if (currentTimer) {
                window.clearTimeout(currentTimer);
            }
            typingExpiryTimers.set(rootPostId, window.setTimeout(() => {
                typingExpiryTimers.delete(rootPostId);
                setAwaitingConversationIds((current) => current.filter((id) => id !== rootPostId));
            }, AGENT_TYPING_EXPIRY_MS));
        };

        window.addEventListener(AGENT_POST_CHANGED_EVENT, handlePostChange);
        window.addEventListener(AGENT_TYPING_EVENT, handleAgentTyping);
        return () => {
            cancelled = true;
            if (refreshTimer) {
                window.clearTimeout(refreshTimer);
            }
            typingExpiryTimers.forEach((timer) => window.clearTimeout(timer));
            window.removeEventListener(AGENT_POST_CHANGED_EVENT, handlePostChange);
            window.removeEventListener(AGENT_TYPING_EVENT, handleAgentTyping);
        };
    }, [agentContext]);

    useEffect(() => {
        const closeMenu = () => {
            setContextMenu(null);
            setProfilePopover(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMenu();
                setLibraryRenameId(null);
            }
        };

        document.addEventListener('click', closeMenu);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            if (conversationClickTimerRef.current) {
                window.clearTimeout(conversationClickTimerRef.current);
            }
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    const owners = useMemo(() => [
        'All',
        ...Array.from(new Set(conversations.map((conversation) => conversation.owner))),
    ], [conversations]);

    const visibleConversations = useMemo(() => filterAndSortConversations(conversations, {
        search,
        owner,
        sort,
    }), [conversations, owner, search, sort]);

    const pinnedConversations = visibleConversations.filter((conversation) => conversation.pinned);
    const recentConversations = visibleConversations.filter((conversation) => !conversation.pinned);
    const totalUnreadCount = conversations.reduce((total, conversation) => total + (conversation.unreadCount ?? 0), 0);
    const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;
    const menuConversation = conversations.find((conversation) => conversation.id === contextMenu?.conversationId) ?? null;
    const libraryRenameConversation = conversations.find((conversation) => conversation.id === libraryRenameId) ?? null;
    const lastSelectedMessage = selectedConversation?.messages[selectedConversation.messages.length - 1];
    const selectedConversationIsAwaiting = Boolean(selectedConversation && awaitingConversationIds.includes(selectedConversation.id));
    const draftMentionsAgent = Boolean(agentContext && messageMentionsBot(draft, agentContext.botUsername));
    const mentionSuggestions = useMemo(() => {
        if (!mentionSearch) {
            return [];
        }
        const query = mentionSearch.query;
        return mentionUsers.
            filter((user) => !query || user.username.toLocaleLowerCase().includes(query) || user.displayName.toLocaleLowerCase().includes(query)).
            sort((left, right) => {
                const score = (user: AgentMentionUser) => {
                    const username = user.username.toLocaleLowerCase();
                    const name = user.displayName.toLocaleLowerCase();
                    if (username === query) {
                        return 0;
                    }
                    if (username.startsWith(query)) {
                        return 1;
                    }
                    if (name.startsWith(query)) {
                        return 2;
                    }
                    return 3;
                };
                return score(left) - score(right) || left.username.localeCompare(right.username);
            }).
            slice(0, 8);
    }, [mentionSearch, mentionUsers]);

    useEffect(() => {
        publishAgentUnreadCount(totalUnreadCount);
    }, [totalUnreadCount]);

    const scrollToBottomIfFollowing = useCallback(() => {
        const messageList = messageListRef.current;
        if (followBottomRef.current && messageList) {
            messageList.scrollTop = messageList.scrollHeight;
        }
    }, []);

    const finishTypingMessage = useCallback((messageId: string) => {
        setTypingMessageIds((current) => current.filter((id) => id !== messageId));
    }, []);

    useEffect(() => {
        if (view !== 'chat') {
            return undefined;
        }

        const frame = window.requestAnimationFrame(scrollToBottomIfFollowing);
        return () => window.cancelAnimationFrame(frame);
    }, [lastSelectedMessage?.content, lastSelectedMessage?.id, scrollToBottomIfFollowing, selectedConversationIsAwaiting, selectedId, view]);

    const updateConversation = (conversationId: string, update: (conversation: Conversation) => Conversation) => {
        setConversations((current) => current.map((conversation) => (
            conversation.id === conversationId ? update(conversation) : conversation
        )));
    };

    useEffect(() => {
        if (
            view !== 'chat' ||
            !agentContext ||
            !selectedConversation?.rootPostId ||
            !selectedConversation.unreadCount
        ) {
            return;
        }

        const conversationId = selectedConversation.id;
        markAgentConversationRead(agentContext, selectedConversation.rootPostId).catch(() => undefined);
        setConversations((current) => current.map((conversation) => (
            conversation.id === conversationId ? {...conversation, unreadCount: 0} : conversation
        )));
    }, [agentContext, selectedConversation?.id, selectedConversation?.rootPostId, selectedConversation?.unreadCount, view]);

    const openConversation = (conversationId: string) => {
        followBottomRef.current = true;
        setSelectedId(conversationId);
        setView('chat');
        setEditingTitle(false);
        setContextMenu(null);

        const conversation = conversations.find((item) => item.id === conversationId);
        if (!agentContext || !conversation?.rootPostId || conversation.threadLoaded) {
            return;
        }

        setLoadingConversationId(conversationId);
        loadAgentConversation(agentContext, conversation.rootPostId).then((loadedConversation) => {
            if (loadedConversation) {
                updateConversation(conversationId, () => loadedConversation);
            }
        }).catch((loadError) => {
            setError(loadError instanceof Error ? loadError.message : 'Unable to load the complete conversation.');
        }).finally(() => {
            setLoadingConversationId((current) => (current === conversationId ? null : current));
        });
    };

    const loadMoreConversations = async () => {
        if (!agentContext || loadingMore || !hasMoreConversations) {
            return;
        }

        setLoadingMore(true);
        try {
            const page = await loadAgentConversations(agentContext, nextConversationPage);
            setConversations((current) => mergeConversationSummaries(current, page.conversations));
            setNextConversationPage((current) => current + 1);
            setHasMoreConversations(page.hasMore);
            setError('');
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Unable to load more conversations.');
        } finally {
            setLoadingMore(false);
        }
    };

    const showLibrary = () => {
        setView('library');
        setSelectedId(null);
        setEditingTitle(false);
        setContextMenu(null);
    };

    const beginRename = (conversation: Conversation) => {
        openConversation(conversation.id);
        setTitleDraft(conversation.title);
        setEditingTitle(true);
    };

    const beginLibraryRename = (conversation: Conversation) => {
        if (conversationClickTimerRef.current) {
            window.clearTimeout(conversationClickTimerRef.current);
            conversationClickTimerRef.current = undefined;
        }
        setContextMenu(null);
        setLibraryRenameId(conversation.id);
        setLibraryTitleDraft(conversation.title);
    };

    const closeLibraryRename = () => {
        setLibraryRenameId(null);
        setLibraryTitleDraft('');
    };

    const scheduleConversationOpen = (conversation: Conversation) => {
        if (conversationClickTimerRef.current) {
            return;
        }
        conversationClickTimerRef.current = window.setTimeout(() => {
            conversationClickTimerRef.current = undefined;
            openConversation(conversation.id);
        }, SINGLE_CLICK_DELAY_MS);
    };

    const renameFromDoubleClick = (event: React.MouseEvent, conversation: Conversation) => {
        event.preventDefault();
        if (conversationClickTimerRef.current) {
            window.clearTimeout(conversationClickTimerRef.current);
            conversationClickTimerRef.current = undefined;
        }
        beginLibraryRename(conversation);
    };

    const createConversation = () => {
        followBottomRef.current = true;
        const now = new Date().toISOString();
        const conversation: Conversation = {
            id: makeClientId('conversation'),
            title: 'New agent conversation',
            owner: CURRENT_USER_LABEL,
            ownerId: agentContext?.currentUserId,
            pinned: false,
            updatedAt: now,
            messages: [],
            threadLoaded: true,
        };

        setConversations((current) => [conversation, ...current]);
        setSelectedId(conversation.id);
        setView('chat');
        setTitleDraft(conversation.title);
        setEditingTitle(true);
        setContextMenu(null);
    };

    const saveTitle = async () => {
        if (!selectedConversation) {
            return;
        }

        const nextTitle = titleDraft.trim();
        if (nextTitle) {
            if (selectedConversation.rootPostId && selectedConversation.ownerId !== agentContext?.currentUserId) {
                setError('Only the conversation creator can rename this shared conversation.');
                setEditingTitle(false);
                return;
            }

            try {
                if (selectedConversation.rootPostId && selectedConversation.ownerId) {
                    await renameAgentConversation(selectedConversation.rootPostId, selectedConversation.ownerId, nextTitle);
                }
                updateConversation(selectedConversation.id, (conversation) => ({...conversation, title: nextTitle}));
                setError('');
            } catch (renameError) {
                setError(renameError instanceof Error ? renameError.message : 'Unable to rename the conversation.');
            }
        }
        setEditingTitle(false);
    };

    const saveLibraryTitle = async () => {
        if (!libraryRenameConversation) {
            return;
        }

        const nextTitle = libraryTitleDraft.trim();
        if (!nextTitle) {
            return;
        }
        if (libraryRenameConversation.rootPostId && libraryRenameConversation.ownerId !== agentContext?.currentUserId) {
            setError('Only the conversation creator can rename this shared conversation.');
            closeLibraryRename();
            return;
        }

        try {
            if (libraryRenameConversation.rootPostId && libraryRenameConversation.ownerId) {
                await renameAgentConversation(
                    libraryRenameConversation.rootPostId,
                    libraryRenameConversation.ownerId,
                    nextTitle,
                );
            }
            updateConversation(libraryRenameConversation.id, (conversation) => ({...conversation, title: nextTitle}));
            setError('');
            closeLibraryRename();
        } catch (renameError) {
            setError(renameError instanceof Error ? renameError.message : 'Unable to rename the conversation.');
        }
    };

    const togglePin = (conversationId: string) => {
        updateConversation(conversationId, (conversation) => {
            const pinned = !conversation.pinned;
            setConversationPinned(conversationId, pinned);
            return {...conversation, pinned};
        });
        setContextMenu(null);
    };

    const viewConversationInChannel = (conversation: Conversation) => {
        setContextMenu(null);
        if (!conversation.rootPostId || !agentContext) {
            setError('Send the first message before opening this conversation in Mattermost.');
            return;
        }

        const permalink = `/${encodeURIComponent(agentContext.teamName)}/pl/${encodeURIComponent(conversation.rootPostId)}`;
        onNavigateToConversation(permalink);
    };

    const toggleThinking = (messageId: string) => {
        setExpandedThinkingIds((current) => (
            current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId]
        ));
    };

    const openContextMenu = (event: React.MouseEvent, conversation: Conversation) => {
        event.preventDefault();
        event.stopPropagation();

        const panelBounds = panelRef.current?.getBoundingClientRect();
        if (!panelBounds) {
            return;
        }

        const menuWidth = 210;
        const menuHeight = 134;
        setContextMenu({
            conversationId: conversation.id,
            left: Math.max(8, Math.min(event.clientX - panelBounds.left, panelBounds.width - menuWidth - 8)),
            top: Math.max(8, Math.min(event.clientY - panelBounds.top, panelBounds.height - menuHeight - 8)),
        });
    };

    const openMentionProfile = (event: React.MouseEvent<HTMLButtonElement>, user: AgentMentionUser) => {
        event.preventDefault();
        event.stopPropagation();

        const panelBounds = panelRef.current?.getBoundingClientRect();
        const triggerBounds = event.currentTarget.getBoundingClientRect();
        if (!panelBounds) {
            return;
        }

        const popoverWidth = Math.min(300, panelBounds.width - 16);
        const popoverHeight = 210;
        const left = Math.max(8, Math.min(triggerBounds.left - panelBounds.left, panelBounds.width - popoverWidth - 8));
        const preferredTop = (triggerBounds.bottom - panelBounds.top) + 6;
        const top = Math.max(8, Math.min(preferredTop, panelBounds.height - popoverHeight - 8));
        setProfilePopover({left, loading: true, profile: null, top, user});

        loadAgentUserProfile(user.id).then((profile) => {
            setProfilePopover((current) => (current?.user.id === user.id ? {
                ...current,
                loading: false,
                profile,
            } : current));
        }).catch(() => {
            setProfilePopover((current) => (current?.user.id === user.id ? {
                ...current,
                loading: false,
            } : current));
        });
    };

    const addAgentMention = () => {
        if (!agentContext) {
            return;
        }
        setDraft((current) => (
            messageMentionsBot(current, agentContext.botUsername) ? current : `@${agentContext.botUsername}${current ? ` ${current}` : ' '}`
        ));
        setMentionSearch(null);
        window.requestAnimationFrame(() => composerRef.current?.focus());
    };

    const updateMentionSearch = (value: string, cursor: number | null) => {
        const nextSearch = mentionSearchAtCursor(value, cursor ?? value.length);
        setMentionSearch(nextSearch);
        setActiveMentionIndex(0);
    };

    const selectMention = (user: AgentMentionUser) => {
        if (!mentionSearch) {
            return;
        }
        const before = draft.slice(0, mentionSearch.start);
        const after = draft.slice(mentionSearch.end);
        const trailingSpace = after.startsWith(' ') ? '' : ' ';
        const insertedMention = `@${user.username}${trailingSpace}`;
        const nextDraft = `${before}${insertedMention}${after}`;
        const nextCursor = before.length + insertedMention.length;
        setDraft(nextDraft);
        setMentionSearch(null);
        window.requestAnimationFrame(() => {
            composerRef.current?.focus();
            composerRef.current?.setSelectionRange(nextCursor, nextCursor);
        });
    };

    const sendMessage = async () => {
        if (!selectedConversation || !draft.trim() || !agentContext || sending) {
            return;
        }

        const conversationId = selectedConversation.id;
        const content = draft.trim();
        const expectsAgentResponse = messageMentionsBot(content, agentContext.botUsername);
        const now = new Date().toISOString();
        const userMessage: Message = {
            id: makeClientId('user-message'),
            role: 'user',
            author: CURRENT_USER_LABEL,
            userId: agentContext.currentUserId,
            content,
            createdAt: now,
        };

        followBottomRef.current = true;
        if (expectsAgentResponse) {
            setAwaitingConversationIds((current) => (current.includes(conversationId) ? current : [...current, conversationId]));
        }
        updateConversation(conversationId, (conversation) => ({
            ...conversation,
            updatedAt: now,
            messages: [...conversation.messages, userMessage],
        }));
        setDraft('');
        setSending(true);
        setError('');
        let messageWasPosted = false;

        try {
            if (selectedConversation.rootPostId) {
                const post = await replyToAgentConversation(agentContext, selectedConversation.rootPostId, content);
                messageWasPosted = true;
                updateConversation(conversationId, (conversation) => ({
                    ...conversation,
                    messages: conversation.messages.map((message) => (message.id === userMessage.id ? {
                        ...message,
                        id: post.id,
                    } : message)),
                }));
            } else {
                const rootPost = await createAgentConversation(agentContext, selectedConversation.title, content);
                messageWasPosted = true;
                if (selectedConversation.pinned) {
                    setConversationPinned(conversationId, false);
                    setConversationPinned(rootPost.id, true);
                }
                setConversations((current) => current.map((conversation) => (conversation.id === conversationId ? {
                    ...conversation,
                    id: rootPost.id,
                    rootPostId: rootPost.id,
                    channelId: rootPost.channel_id,
                    ownerId: rootPost.user_id,
                    threadLoaded: true,
                    messages: conversation.messages.map((message) => (message.id === userMessage.id ? {
                        ...message,
                        id: rootPost.id,
                    } : message)),
                } : conversation)));
                if (expectsAgentResponse) {
                    setAwaitingConversationIds((current) => current.map((id) => (id === conversationId ? rootPost.id : id)));
                }
                setSelectedId(rootPost.id);
            }
        } catch (sendError) {
            if (expectsAgentResponse) {
                setAwaitingConversationIds((current) => current.filter((id) => id !== conversationId));
            }
            setError(sendError instanceof Error ? sendError.message : 'Unable to send the message to Mattermost.');
            if (!messageWasPosted) {
                setDraft(content);
                updateConversation(conversationId, (conversation) => ({
                    ...conversation,
                    messages: conversation.messages.filter((message) => message.id !== userMessage.id),
                }));
            }
        } finally {
            setSending(false);
        }
    };

    const renderConversation = (conversation: Conversation) => {
        const participants = conversation.participants ?? [];
        const visibleParticipants = participants.slice(0, MAX_VISIBLE_PARTICIPANTS);
        const hiddenParticipantCount = Math.max(0, participants.length - visibleParticipants.length);
        const participantNames = participants.map((participant) => participant.name).join(', ');

        return (
            <article
                className='seo-assistant__conversation'
                key={conversation.id}
                onContextMenu={(event) => openContextMenu(event, conversation)}
            >
                <button
                    aria-label={`Open ${conversation.title}, created by ${conversation.owner}`}
                    className='seo-assistant__conversation-main'
                    onClick={() => scheduleConversationOpen(conversation)}
                    onDoubleClick={(event) => renameFromDoubleClick(event, conversation)}
                    type='button'
                >
                    <span className={`seo-assistant__conversation-avatar${conversation.owner === CURRENT_USER_LABEL ? ' seo-assistant__conversation-avatar--you' : ''}`}>
                        <span>{initialsFor(conversation.owner)}</span>
                        {conversation.ownerId && (
                            <img
                                alt=''
                                onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                }}
                                src={profileImageURL(conversation.ownerId)}
                            />
                        )}
                        {conversation.pinned && <i className='icon-pin-outline seo-assistant__pinned-icon'/>}
                    </span>
                    <span className='seo-assistant__conversation-copy'>
                        <strong>{conversation.title}</strong>
                        <span className='seo-assistant__conversation-owner'>{`Created by ${conversation.owner}`}</span>
                        {participants.length > 0 && (
                            <span
                                className='seo-assistant__participants'
                                title={`Participants: ${participantNames}`}
                            >
                                <span className='seo-assistant__participant-avatars'>
                                    {visibleParticipants.map((participant) => (
                                        <span
                                            className='seo-assistant__participant-avatar'
                                            key={participant.id}
                                        >
                                            <span>{initialsFor(participant.name)}</span>
                                            <img
                                                alt=''
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none';
                                                }}
                                                src={profileImageURL(participant.id)}
                                            />
                                        </span>
                                    ))}
                                    {hiddenParticipantCount > 0 && <span className='seo-assistant__participant-overflow'>{`+${hiddenParticipantCount}`}</span>}
                                </span>
                                <span className='seo-assistant__participant-label'>{`${participants.length} participant${participants.length === 1 ? '' : 's'}`}</span>
                            </span>
                        )}
                        <span className='seo-assistant__conversation-preview'>{conversationPreview(conversation)}</span>
                    </span>
                    <span className='seo-assistant__conversation-status'>
                        <span className='seo-assistant__conversation-time'>{formatRelativeTime(conversation.updatedAt)}</span>
                        {Boolean(conversation.unreadCount) && (
                            <span
                                aria-label={`${conversation.unreadCount} unread replies`}
                                className='seo-assistant__unread-badge'
                            >
                                {(conversation.unreadCount ?? 0) > 99 ? '99+' : conversation.unreadCount}
                            </span>
                        )}
                    </span>
                </button>
                <button
                    aria-label={`More actions for ${conversation.title}`}
                    className='icon-dots-vertical seo-assistant__more-button'
                    onClick={(event) => openContextMenu(event, conversation)}
                    title='Conversation actions'
                    type='button'
                />
            </article>
        );
    };

    return (
        <div
            className={`seo-assistant seo-assistant--${layout} seo-assistant--view-${view}`}
            ref={panelRef}
        >
            {error && (
                <div
                    className='seo-assistant__connection-error'
                    role='status'
                >
                    <i className='icon-alert-outline'/>
                    <span>{error}</span>
                    <button
                        aria-label='Dismiss error'
                        className='icon-close'
                        onClick={() => setError('')}
                        type='button'
                    />
                </div>
            )}
            <div className='seo-assistant__workspace'>
                {(view === 'library' || layout === 'modal') && (
                    <section
                        aria-label='Agent conversations'
                        className='seo-assistant__library'
                    >
                        <div className='seo-assistant__library-toolbar'>
                            <div className='seo-assistant__library-summary'>
                                <strong>{'Chats'}</strong>
                                <div className='seo-assistant__summary-actions'>
                                    {totalUnreadCount > 0 && (
                                        <span>{`${totalUnreadCount > 999 ? '999+' : totalUnreadCount} unread ${totalUnreadCount === 1 ? 'reply' : 'replies'}`}</span>
                                    )}
                                </div>
                            </div>
                            <label className='seo-assistant__channel-picker'>
                                <i className={agentContext?.channelType === 'P' ? 'icon-lock-outline' : 'icon-globe'}/>
                                <select
                                    aria-label='Choose a Mattermost channel'
                                    disabled={!agentContext || agentContext.channels.length < 2}
                                    onChange={(event) => {
                                        if (agentContext) {
                                            selectAgentChannel(agentContext, event.target.value);
                                        }
                                    }}
                                    value={agentContext?.channelId ?? ''}
                                >
                                    {!agentContext && <option value=''>{'Loading channels…'}</option>}
                                    {agentContext?.channels.map((channel) => (
                                        <option
                                            key={channel.id}
                                            value={channel.id}
                                        >
                                            {`${channel.type === 'P' ? 'Private · ' : ''}#${channel.displayName}`}
                                        </option>
                                    ))}
                                </select>
                                <i className='icon-chevron-down'/>
                            </label>
                            <button
                                className='seo-assistant__new-button'
                                disabled={!agentContext}
                                onClick={createConversation}
                                type='button'
                            >
                                <i className='icon-plus'/>
                                {'New chat'}
                            </button>
                            <label className='seo-assistant__search'>
                                <i className='icon-magnify'/>
                                <input
                                    aria-label='Search conversations'
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder='Search conversations'
                                    type='search'
                                    value={search}
                                />
                            </label>
                            <div className='seo-assistant__filters'>
                                <label className='seo-assistant__filter'>
                                    <i className='icon-filter-variant'/>
                                    <select
                                        aria-label='Filter by creator'
                                        onChange={(event) => setOwner(event.target.value)}
                                        value={owner}
                                    >
                                        {owners.map((ownerName) => (
                                            <option
                                                key={ownerName}
                                                value={ownerName}
                                            >
                                                {ownerName === 'All' ? 'All users' : ownerName}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className='seo-assistant__filter'>
                                    <i className='icon-sort-ascending'/>
                                    <select
                                        aria-label='Sort conversations'
                                        onChange={(event) => setSort(event.target.value as ConversationSort)}
                                        value={sort}
                                    >
                                        <option value='updated'>{'Recently updated'}</option>
                                        <option value='title'>{'Title'}</option>
                                    </select>
                                </label>
                            </div>
                        </div>

                        <div className='seo-assistant__conversation-list'>
                            {pinnedConversations.length > 0 && (
                                <>
                                    <div className='seo-assistant__group-title'>{'Pinned'}</div>
                                    {pinnedConversations.map(renderConversation)}
                                </>
                            )}
                            {recentConversations.length > 0 && (
                                <>
                                    <div className='seo-assistant__group-title'>{'Recent'}</div>
                                    {recentConversations.map(renderConversation)}
                                </>
                            )}
                            {loading && (
                                <div className='seo-assistant__empty-list'>
                                    <strong>{'Loading shared conversations…'}</strong>
                                    <span>{'Connecting to the Mattermost agent channel.'}</span>
                                </div>
                            )}
                            {!loading && visibleConversations.length === 0 && (
                                <div className='seo-assistant__empty-list'>
                                    <strong>{'No conversations found'}</strong>
                                    <span>{conversations.length === 0 ? 'Create the first shared agent conversation.' : 'Try another search or filter.'}</span>
                                </div>
                            )}
                            {!loading && hasMoreConversations && (
                                <button
                                    className='seo-assistant__load-more'
                                    disabled={loadingMore}
                                    onClick={() => loadMoreConversations().catch(() => undefined)}
                                    type='button'
                                >
                                    {loadingMore ? 'Loading more…' : 'Load more conversations'}
                                </button>
                            )}
                        </div>
                    </section>
                )}

                {(view === 'chat' || layout === 'modal') && selectedConversation && (
                    <section
                        aria-label='Agent chat'
                        className='seo-assistant__chat'
                    >
                        <div className='seo-assistant__chat-nav'>
                            <button
                                className={`seo-assistant__back-button${layout === 'modal' ? ' seo-assistant__back-button--modal' : ''}`}
                                onClick={showLibrary}
                                type='button'
                            >
                                <i className='icon-arrow-left'/>
                                {'Conversations'}
                            </button>
                            {editingTitle ? (
                                <form
                                    className='seo-assistant__rename-form'
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        saveTitle().catch(() => undefined);
                                    }}
                                >
                                    <input
                                        aria-label='Conversation name'
                                        autoFocus={true}
                                        maxLength={80}
                                        onChange={(event) => setTitleDraft(event.target.value)}
                                        onFocus={(event) => event.currentTarget.select()}
                                        value={titleDraft}
                                    />
                                    <button type='submit'>{'Save'}</button>
                                    <button
                                        onClick={() => setEditingTitle(false)}
                                        type='button'
                                    >
                                        {'Cancel'}
                                    </button>
                                </form>
                            ) : (
                                <>
                                    <div className='seo-assistant__chat-title'>
                                        <h3>{selectedConversation.title}</h3>
                                        <small>{`#${agentContext?.channelDisplayName ?? 'channel'} · Created by ${selectedConversation.owner} · Shared with team`}</small>
                                    </div>
                                    <button
                                        aria-label='Rename conversation'
                                        className='icon-pencil-outline seo-assistant__rename-button'
                                        onClick={() => beginRename(selectedConversation)}
                                        title='Rename conversation'
                                        type='button'
                                    />
                                </>
                            )}
                        </div>

                        <div
                            className='seo-assistant__messages'
                            onScroll={(event) => {
                                const messageList = event.currentTarget;
                                const distanceFromBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
                                followBottomRef.current = distanceFromBottom <= BOTTOM_FOLLOW_DISTANCE_PX;
                            }}
                            ref={messageListRef}
                        >
                            {loadingConversationId === selectedConversation.id && (
                                <div
                                    aria-live='polite'
                                    className='seo-assistant__thread-loading'
                                    role='status'
                                >
                                    <i className='icon-refresh spin'/>
                                    <span>{'Loading replies and participants…'}</span>
                                </div>
                            )}
                            {selectedConversation.messages.length === 0 && (
                                <div className='seo-assistant__empty-chat'>
                                    <div className='seo-assistant__bot-mark'>{'✦'}</div>
                                    <strong>{'Start a new agent conversation'}</strong>
                                    <span>{'Your messages and the bot replies will be shared in the configured Mattermost channel.'}</span>
                                </div>
                            )}
                            {selectedConversation.messages.map((message) => (
                                <div
                                    className={`seo-assistant__message seo-assistant__message--${message.role}`}
                                    key={message.id}
                                >
                                    <div className='seo-assistant__avatar'>
                                        <span>{initialsFor(message.author ?? (message.role === 'assistant' ? agentContext?.botDisplayName ?? 'Agent Assistant' : selectedConversation.owner))}</span>
                                        {message.userId && (
                                            <img
                                                alt=''
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none';
                                                }}
                                                src={profileImageURL(message.userId)}
                                            />
                                        )}
                                    </div>
                                    <div className='seo-assistant__message-body'>
                                        <div className='seo-assistant__message-meta'>
                                            <strong>{message.author ?? (message.role === 'assistant' ? agentContext?.botDisplayName ?? 'Agent Assistant' : selectedConversation.owner)}</strong>
                                            {message.role === 'assistant' && <span className='seo-assistant__bot-badge'>{'BOT'}</span>}
                                            <span>{formatMessageTime(message.createdAt)}</span>
                                        </div>
                                        {message.thinking && (
                                            <div className='seo-assistant__thinking'>
                                                <button
                                                    aria-expanded={expandedThinkingIds.includes(message.id)}
                                                    onClick={() => toggleThinking(message.id)}
                                                    type='button'
                                                >
                                                    <span>{expandedThinkingIds.includes(message.id) ? '⌄' : '›'}</span>
                                                    {`Activity · ${message.thinking.length} updates`}
                                                </button>
                                                {expandedThinkingIds.includes(message.id) && (
                                                    <ol>
                                                        {message.thinking.map((step) => <li key={step}>{step}</li>)}
                                                    </ol>
                                                )}
                                            </div>
                                        )}
                                        {(message.content || message.streaming) && (
                                            <StreamingMessageText
                                                animate={typingMessageIds.includes(message.id)}
                                                content={message.content}
                                                currentUserId={agentContext?.currentUserId}
                                                mentionUsers={mentionUsers}
                                                messageId={message.id}
                                                onComplete={finishTypingMessage}
                                                onMentionClick={openMentionProfile}
                                                onProgress={scrollToBottomIfFollowing}
                                                streaming={Boolean(message.streaming)}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                            {selectedConversationIsAwaiting && (
                                <div
                                    aria-live='polite'
                                    className='seo-assistant__message seo-assistant__message--assistant seo-assistant__message--thinking'
                                    role='status'
                                >
                                    <div className='seo-assistant__avatar'>
                                        <span>{initialsFor(agentContext?.botDisplayName ?? 'Agent Assistant')}</span>
                                        {agentContext?.botUserId && (
                                            <img
                                                alt=''
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none';
                                                }}
                                                src={profileImageURL(agentContext.botUserId)}
                                            />
                                        )}
                                    </div>
                                    <div className='seo-assistant__message-body'>
                                        <div className='seo-assistant__message-meta'>
                                            <strong>{agentContext?.botDisplayName ?? 'Agent Assistant'}</strong>
                                            <span className='seo-assistant__bot-badge'>{'BOT'}</span>
                                            <span>{'now'}</span>
                                        </div>
                                        <div className='seo-assistant__thinking-indicator'>
                                            <span>{'Thinking'}</span>
                                            <span
                                                aria-hidden='true'
                                                className='seo-assistant__thinking-dots'
                                            >
                                                <i/>
                                                <i/>
                                                <i/>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <form
                            className='seo-assistant__composer'
                            onSubmit={(event) => {
                                event.preventDefault();
                                sendMessage().catch(() => undefined);
                            }}
                        >
                            {mentionSearch && (
                                <div
                                    aria-label='Mention a channel member'
                                    className='seo-assistant__mention-menu'
                                    role='listbox'
                                >
                                    <div className='seo-assistant__mention-menu-label'>{'Channel members'}</div>
                                    {mentionUsersLoading && <div className='seo-assistant__mention-menu-state'>{'Loading members…'}</div>}
                                    {!mentionUsersLoading && mentionUsersError && (
                                        <div className='seo-assistant__mention-menu-state seo-assistant__mention-menu-state--warning'>
                                            {'The member directory is unavailable. You can still mention the agent.'}
                                        </div>
                                    )}
                                    {!mentionUsersLoading && !mentionUsersError && mentionSuggestions.length === 0 && (
                                        <div className='seo-assistant__mention-menu-state'>{'No matching channel members'}</div>
                                    )}
                                    {mentionSuggestions.map((user, index) => (
                                        <button
                                            aria-selected={index === activeMentionIndex}
                                            className={index === activeMentionIndex ? 'seo-assistant__mention-option seo-assistant__mention-option--active' : 'seo-assistant__mention-option'}
                                            key={user.id}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                selectMention(user);
                                            }}
                                            role='option'
                                            type='button'
                                        >
                                            <span className='seo-assistant__mention-avatar'>
                                                <span>{initialsFor(user.displayName)}</span>
                                                <img
                                                    alt=''
                                                    onError={(event) => {
                                                        event.currentTarget.style.display = 'none';
                                                    }}
                                                    src={profileImageURL(user.id)}
                                                />
                                            </span>
                                            <span className='seo-assistant__mention-copy'>
                                                <strong>{user.displayName}</strong>
                                                <span>{`@${user.username}`}</span>
                                            </span>
                                            {user.isBot && <span className='seo-assistant__mention-bot-badge'>{'BOT'}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button
                                aria-label={`Mention @${agentContext?.botUsername ?? 'agent'}`}
                                className={`seo-assistant__ask-agent-button${draftMentionsAgent ? ' seo-assistant__ask-agent-button--active' : ''}`}
                                disabled={sending || !agentContext}
                                onClick={addAgentMention}
                                title={draftMentionsAgent ? 'Agent is mentioned' : `Ask @${agentContext?.botUsername ?? 'agent'}`}
                                type='button'
                            >
                                <span aria-hidden='true'>{'@'}</span>
                                <span>{'Agent'}</span>
                            </button>
                            <textarea
                                aria-label='Message the team or mention Agent Assistant'
                                disabled={sending || !agentContext}
                                onBlur={() => window.setTimeout(() => setMentionSearch(null), 100)}
                                onChange={(event) => {
                                    setDraft(event.target.value);
                                    updateMentionSearch(event.target.value, event.target.selectionStart);
                                }}
                                onClick={(event) => updateMentionSearch(event.currentTarget.value, event.currentTarget.selectionStart)}
                                onKeyDown={(event) => {
                                    if (mentionSearch && mentionSuggestions.length > 0) {
                                        if (event.key === 'ArrowDown') {
                                            event.preventDefault();
                                            setActiveMentionIndex((current) => (current + 1) % mentionSuggestions.length);
                                            return;
                                        }
                                        if (event.key === 'ArrowUp') {
                                            event.preventDefault();
                                            setActiveMentionIndex((current) => ((current - 1) + mentionSuggestions.length) % mentionSuggestions.length);
                                            return;
                                        }
                                        if (event.key === 'Enter' || event.key === 'Tab') {
                                            event.preventDefault();
                                            selectMention(mentionSuggestions[activeMentionIndex] ?? mentionSuggestions[0]);
                                            return;
                                        }
                                    }
                                    if (event.key === 'Escape' && mentionSearch) {
                                        event.preventDefault();
                                        setMentionSearch(null);
                                        return;
                                    }
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        sendMessage().catch(() => undefined);
                                    }
                                }}
                                onSelect={(event) => updateMentionSearch(event.currentTarget.value, event.currentTarget.selectionStart)}
                                placeholder={sending ? 'Sending to Mattermost…' : `Message team or mention @${agentContext?.botUsername ?? 'agent'}…`}
                                ref={composerRef}
                                rows={1}
                                value={draft}
                            />
                            <button
                                aria-label='Send message'
                                className='icon-send seo-assistant__send-button'
                                disabled={!draft.trim() || sending || !agentContext}
                                type='submit'
                            />
                        </form>
                    </section>
                )}

                {layout === 'modal' && !selectedConversation && (
                    <section className='seo-assistant__modal-empty-chat'>
                        <div className='seo-assistant__bot-mark'>{'✦'}</div>
                        <strong>{'Choose a conversation'}</strong>
                        <span>{'Select an existing team chat or create a new one.'}</span>
                    </section>
                )}
            </div>

            {profilePopover && (
                <aside
                    aria-label={`Profile for ${profilePopover.user.displayName}`}
                    className='seo-assistant__profile-popover'
                    onClick={(event) => event.stopPropagation()}
                    style={{left: profilePopover.left, top: profilePopover.top}}
                >
                    <button
                        aria-label='Close profile'
                        className='icon-close seo-assistant__profile-close'
                        onClick={() => setProfilePopover(null)}
                        type='button'
                    />
                    <div className='seo-assistant__profile-header'>
                        <span className='seo-assistant__profile-avatar'>
                            <span>{initialsFor(profilePopover.user.displayName)}</span>
                            <img
                                alt=''
                                onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                }}
                                src={profileImageURL(profilePopover.user.id)}
                            />
                        </span>
                        <span className='seo-assistant__profile-heading'>
                            <strong>{profilePopover.user.displayName}</strong>
                            <span>{`@${profilePopover.user.username}`}</span>
                        </span>
                        {profilePopover.user.isBot && <span className='seo-assistant__bot-badge'>{'BOT'}</span>}
                    </div>
                    {profilePopover.loading ? (
                        <div className='seo-assistant__profile-loading'>{'Loading profile…'}</div>
                    ) : (
                        <div className='seo-assistant__profile-details'>
                            {profilePopover.profile?.position && (
                                <div>
                                    <i className='icon-briefcase-outline'/>
                                    <span>{profilePopover.profile.position}</span>
                                </div>
                            )}
                            {profilePopover.profile?.email && (
                                <div>
                                    <i className='icon-email-outline'/>
                                    <span>{profilePopover.profile.email}</span>
                                </div>
                            )}
                            {profilePopover.user.isBot && profilePopover.profile?.bot_description && (
                                <div>
                                    <i className='icon-robot-outline'/>
                                    <span>{profilePopover.profile.bot_description}</span>
                                </div>
                            )}
                            {!profilePopover.profile?.position && !profilePopover.profile?.email && !profilePopover.profile?.bot_description && (
                                <span className='seo-assistant__profile-empty'>{'No additional profile information is available.'}</span>
                            )}
                        </div>
                    )}
                </aside>
            )}

            {contextMenu && menuConversation && (
                <div
                    className='seo-assistant__context-menu'
                    onClick={(event) => event.stopPropagation()}
                    style={{left: contextMenu.left, top: contextMenu.top}}
                >
                    <button
                        onClick={() => beginLibraryRename(menuConversation)}
                        type='button'
                    >
                        <i className='icon-pencil-outline'/>
                        {'Rename conversation'}
                    </button>
                    <button
                        onClick={() => togglePin(menuConversation.id)}
                        type='button'
                    >
                        <i className='icon-pin-outline'/>
                        {menuConversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
                    </button>
                    <button
                        disabled={!menuConversation.rootPostId}
                        onClick={() => viewConversationInChannel(menuConversation)}
                        title={menuConversation.rootPostId ? 'Open the original Mattermost thread' : 'Send the first message to create this thread'}
                        type='button'
                    >
                        <i className='icon-open-in-new'/>
                        {'View in channel'}
                    </button>
                </div>
            )}

            {libraryRenameConversation && (
                <div
                    className='seo-assistant__rename-dialog-backdrop'
                    onMouseDown={closeLibraryRename}
                >
                    <div
                        aria-labelledby='seo-assistant-rename-title'
                        aria-modal='true'
                        className='seo-assistant__rename-dialog'
                        onMouseDown={(event) => event.stopPropagation()}
                        role='dialog'
                    >
                        <div className='seo-assistant__rename-dialog-header'>
                            <div>
                                <h3 id='seo-assistant-rename-title'>{'Rename conversation'}</h3>
                                <span>{'Choose a clear name your team can find later.'}</span>
                            </div>
                            <button
                                aria-label='Close rename dialog'
                                className='icon-close'
                                onClick={closeLibraryRename}
                                type='button'
                            />
                        </div>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                saveLibraryTitle().catch(() => undefined);
                            }}
                        >
                            <label htmlFor='seo-assistant-library-title'>{'Conversation name'}</label>
                            <input
                                autoFocus={true}
                                id='seo-assistant-library-title'
                                maxLength={80}
                                onChange={(event) => setLibraryTitleDraft(event.target.value)}
                                onFocus={(event) => event.currentTarget.select()}
                                value={libraryTitleDraft}
                            />
                            <div className='seo-assistant__rename-dialog-actions'>
                                <button
                                    className='seo-assistant__dialog-cancel'
                                    onClick={closeLibraryRename}
                                    type='button'
                                >
                                    {'Cancel'}
                                </button>
                                <button
                                    className='seo-assistant__dialog-save'
                                    disabled={!libraryTitleDraft.trim()}
                                    type='submit'
                                >
                                    {'Save name'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RHSPanel;

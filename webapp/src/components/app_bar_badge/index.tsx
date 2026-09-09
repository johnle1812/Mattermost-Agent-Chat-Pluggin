import manifest from 'manifest';
import {useEffect, useState} from 'react';

import type {Post} from '@mattermost/types/posts';

import {
    AGENT_POST_CHANGED_EVENT,
    AGENT_UNREAD_CHANGED_EVENT,
    loadAgentUnreadCount,
    resolveAgentChannel,
} from '../../api/agent_channel';
import type {AgentChannelContext} from '../../api/agent_channel';

import './app_bar_badge.scss';

const APP_BAR_ICON_ID = `app-bar-icon-${manifest.id}`;
const REFRESH_INTERVAL_MS = 15000;
const POST_REFRESH_DELAY_MS = 250;

const AppBarUnreadBadge = () => {
    const [target, setTarget] = useState<HTMLElement | null>(() => document.getElementById(APP_BAR_ICON_ID));
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        const findTarget = () => setTarget(document.getElementById(APP_BAR_ICON_ID));
        findTarget();

        const observer = new MutationObserver(findTarget);
        observer.observe(document.body, {childList: true, subtree: true});
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!target || unreadCount < 1) {
            return undefined;
        }

        const badge = document.createElement('div');
        badge.className = 'seo-assistant-app-bar-badge';
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        badge.setAttribute('aria-label', `${unreadCount} unread Agent Assistant replies`);
        badge.title = `${unreadCount} unread ${unreadCount === 1 ? 'reply' : 'replies'}`;
        target.appendChild(badge);

        return () => badge.remove();
    }, [target, unreadCount]);

    useEffect(() => {
        let cancelled = false;
        let context: AgentChannelContext | null = null;
        let pollingTimer: number | undefined;
        let postRefreshTimer: number | undefined;

        const refresh = async () => {
            if (!context) {
                return;
            }
            try {
                const count = await loadAgentUnreadCount(context);
                if (!cancelled) {
                    setUnreadCount(count);
                }
            } catch {
                // Keep the last known badge value during temporary API failures.
            }
        };

        const handlePostChange = (event: Event) => {
            const post = (event as CustomEvent<Post>).detail;
            if (!context || post?.channel_id !== context.channelId) {
                return;
            }
            if (postRefreshTimer) {
                window.clearTimeout(postRefreshTimer);
            }
            postRefreshTimer = window.setTimeout(() => refresh().catch(() => undefined), POST_REFRESH_DELAY_MS);
        };

        const handleUnreadChange = (event: Event) => {
            const count = (event as CustomEvent<number>).detail;
            if (Number.isFinite(count)) {
                setUnreadCount(Math.max(0, count));
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refresh().catch(() => undefined);
            }
        };

        const start = async () => {
            try {
                context = await resolveAgentChannel();
                await refresh();
                if (!cancelled) {
                    pollingTimer = window.setInterval(() => refresh().catch(() => undefined), REFRESH_INTERVAL_MS);
                }
            } catch {
                // The RHS still reports configuration errors when the user opens it.
            }
        };

        window.addEventListener(AGENT_POST_CHANGED_EVENT, handlePostChange);
        window.addEventListener(AGENT_UNREAD_CHANGED_EVENT, handleUnreadChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        start().catch(() => undefined);

        return () => {
            cancelled = true;
            if (pollingTimer) {
                window.clearInterval(pollingTimer);
            }
            if (postRefreshTimer) {
                window.clearTimeout(postRefreshTimer);
            }
            window.removeEventListener(AGENT_POST_CHANGED_EVENT, handlePostChange);
            window.removeEventListener(AGENT_UNREAD_CHANGED_EVENT, handleUnreadChange);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return null;
};

export default AppBarUnreadBadge;

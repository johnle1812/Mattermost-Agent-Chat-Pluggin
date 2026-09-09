import type {Conversation} from '../types/conversation';

export const CURRENT_USER_LABEL = 'You';

export type MentionSearch = {
    end: number;
    query: string;
    start: number;
};

export function makeClientId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatRelativeTime(value: string): string {
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));

    if (elapsedMinutes < 1) {
        return 'Just now';
    }
    if (elapsedMinutes < 60) {
        return `${elapsedMinutes} min ago`;
    }
    if (elapsedMinutes < 1440) {
        return `${Math.floor(elapsedMinutes / 60)} hr ago`;
    }

    const elapsedDays = Math.floor(elapsedMinutes / 1440);
    return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
}

export function formatMessageTime(value: string): string {
    return new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'}).format(new Date(value));
}

export function initialsFor(name: string): string {
    if (name === CURRENT_USER_LABEL) {
        return 'Y';
    }

    return name.split(/\s+/).
        filter(Boolean).
        map((part) => part[0]).
        slice(-2).
        join('').
        toLocaleUpperCase();
}

export function conversationPreview(conversation: Conversation): string {
    return conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1].content : 'Start a new conversation';
}

export function profileImageURL(userId?: string): string {
    return userId ? `/api/v4/users/${userId}/image` : '';
}

export function messageMentionsBot(message: string, botUsername: string): boolean {
    const escapedUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)@${escapedUsername}\\b`, 'i').test(message);
}

export function mentionSearchAtCursor(value: string, cursor: number): MentionSearch | null {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) {
        return null;
    }

    return {
        end: cursor,
        query: match[2].toLocaleLowerCase(),
        start: cursor - match[2].length - 1,
    };
}

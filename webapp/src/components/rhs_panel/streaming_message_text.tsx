import React, {useEffect, useState} from 'react';

import type {AgentMentionUser} from '../../api/agent_channel';

const TYPEWRITER_TICK_MS = 18;

type Props = {
    animate: boolean;
    content: string;
    messageId: string;
    onComplete: (messageId: string) => void;
    onProgress: () => void;
    mentionUsers: AgentMentionUser[];
    currentUserId?: string;
    onMentionClick: (event: React.MouseEvent<HTMLButtonElement>, user: AgentMentionUser) => void;
    streaming: boolean;
};

const MENTION_PATTERN = /(^|[^a-z0-9._-])@([a-z0-9._-]+)/gi;

function renderMentionedText(
    content: string,
    mentionUsers: AgentMentionUser[],
    currentUserId: string | undefined,
    onMentionClick: Props['onMentionClick'],
): React.ReactNode[] {
    const usersByUsername = new Map(mentionUsers.map((user) => [user.username.toLocaleLowerCase(), user]));
    const parts: React.ReactNode[] = [];
    let textStart = 0;
    let match: RegExpExecArray | null;

    MENTION_PATTERN.lastIndex = 0;
    while ((match = MENTION_PATTERN.exec(content)) !== null) {
        const prefix = match[1];
        const username = match[2];
        const mentionStart = match.index + prefix.length;
        let resolvedUsername = username;
        let user = usersByUsername.get(resolvedUsername.toLocaleLowerCase());
        while (!user && (/[._-]$/).test(resolvedUsername)) {
            resolvedUsername = resolvedUsername.slice(0, -1);
            user = usersByUsername.get(resolvedUsername.toLocaleLowerCase());
        }
        if (!user) {
            continue;
        }
        const resolvedUser = user;

        if (mentionStart > textStart) {
            parts.push(content.slice(textStart, mentionStart));
        }
        parts.push(
            <button
                aria-label={`View profile for ${resolvedUser.displayName}`}
                className={`seo-assistant__mention-link${resolvedUser.id === currentUserId ? ' seo-assistant__mention-link--current-user' : ''}`}
                key={`${mentionStart}-${resolvedUser.id}`}
                onClick={(event) => onMentionClick(event, resolvedUser)}
                title={`View @${resolvedUser.username}`}
                type='button'
            >
                {`@${resolvedUsername}`}
            </button>,
        );
        textStart = mentionStart + resolvedUsername.length + 1;
    }

    if (textStart < content.length) {
        parts.push(content.slice(textStart));
    }
    return parts;
}

/**
 * Reveals a newly received message gradually and keeps the cursor visible while
 * Mattermost is still editing the backing post.
 */
const StreamingMessageText = ({
    animate,
    content,
    currentUserId,
    mentionUsers,
    messageId,
    onComplete,
    onMentionClick,
    streaming,
    onProgress,
}: Props) => {
    const [visibleLength, setVisibleLength] = useState(animate ? 0 : content.length);
    const visibleContent = content.slice(0, visibleLength);
    const typing = animate && visibleLength < content.length;

    useEffect(() => {
        if (!animate) {
            setVisibleLength(content.length);
            return undefined;
        }
        if (visibleLength > content.length) {
            setVisibleLength(content.length);
            return undefined;
        }
        if (visibleLength >= content.length) {
            onComplete(messageId);
            return undefined;
        }

        const charactersPerTick = Math.max(1, Math.ceil(content.length / 140));
        const timer = window.setTimeout(() => {
            setVisibleLength((current) => Math.min(content.length, current + charactersPerTick));
        }, TYPEWRITER_TICK_MS);
        return () => window.clearTimeout(timer);
    }, [animate, content, messageId, onComplete, visibleLength]);

    useEffect(() => {
        onProgress();
    }, [onProgress, visibleContent]);

    return (
        <p aria-live={streaming || typing ? 'polite' : undefined}>
            {renderMentionedText(visibleContent, mentionUsers, currentUserId, onMentionClick)}
            {(streaming || typing) && <span className='seo-assistant__stream-cursor'/>}
        </p>
    );
};

export default StreamingMessageText;

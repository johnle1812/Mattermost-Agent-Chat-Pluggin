import React, {useEffect, useState} from 'react';

const TYPEWRITER_TICK_MS = 18;

type Props = {
    animate: boolean;
    content: string;
    messageId: string;
    onComplete: (messageId: string) => void;
    onProgress: () => void;
    streaming: boolean;
};

/**
 * Reveals a newly received message gradually and keeps the cursor visible while
 * Mattermost is still editing the backing post.
 */
const StreamingMessageText = ({animate, content, messageId, onComplete, streaming, onProgress}: Props) => {
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
            {visibleContent}
            {(streaming || typing) && <span className='seo-assistant__stream-cursor'/>}
        </p>
    );
};

export default StreamingMessageText;

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useHistory} from 'react-router-dom';

import {
    notifyAgentAssistantModalClosed,
    OPEN_AGENT_ASSISTANT_MODAL_EVENT,
} from './events';
import type {AgentAssistantLocation} from './events';

import RHSPanel from '../rhs_panel';

import './modal.scss';

const DEFAULT_LOCATION: AgentAssistantLocation = {
    conversationId: null,
    draft: '',
    view: 'library',
};

/**
 * A root-level host that stays mounted with Mattermost and renders only when an
 * RHS instance requests the focused, large-screen experience.
 */
const AgentAssistantModal = () => {
    const history = useHistory();
    const [location, setLocation] = useState<AgentAssistantLocation | null>(null);
    const latestLocation = useRef<AgentAssistantLocation>(DEFAULT_LOCATION);

    const close = useCallback(() => {
        notifyAgentAssistantModalClosed(latestLocation.current);
        setLocation(null);
    }, []);

    useEffect(() => {
        const open = (event: Event) => {
            const requestedLocation = (event as CustomEvent<AgentAssistantLocation>).detail ?? DEFAULT_LOCATION;
            latestLocation.current = requestedLocation;
            setLocation(requestedLocation);
        };

        window.addEventListener(OPEN_AGENT_ASSISTANT_MODAL_EVENT, open);
        return () => window.removeEventListener(OPEN_AGENT_ASSISTANT_MODAL_EVENT, open);
    }, []);

    useEffect(() => {
        if (!location) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
            }
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [close, location]);

    if (!location) {
        return null;
    }

    return (
        <div
            className='agent-assistant-modal__backdrop'
            onMouseDown={close}
        >
            <section
                aria-label='Agent Assistant expanded view'
                aria-modal='true'
                className='agent-assistant-modal'
                onMouseDown={(event) => event.stopPropagation()}
                role='dialog'
            >
                <header className='agent-assistant-modal__header'>
                    <div>
                        <span className='agent-assistant-modal__mark'>{'✦'}</span>
                        <strong>{'Agent Assistant'}</strong>
                    </div>
                    <button
                        aria-label='Return to right sidebar'
                        className='agent-assistant-modal__close icon-arrow-collapse'
                        onClick={close}
                        title='Return to right sidebar'
                        type='button'
                    />
                    <button
                        aria-label='Close expanded Agent Assistant'
                        className='agent-assistant-modal__close icon-close'
                        onClick={close}
                        title='Close expanded view'
                        type='button'
                    />
                </header>
                <div className='agent-assistant-modal__content'>
                    <RHSPanel
                        initialConversationId={location.conversationId}
                        initialDraft={location.draft}
                        initialView={location.view}
                        layout='modal'
                        onLocationChange={(nextLocation) => {
                            latestLocation.current = nextLocation;
                        }}
                        onNavigateToConversation={(permalink) => {
                            close();
                            history.push(permalink);
                        }}
                    />
                </div>
            </section>
        </div>
    );
};

export default AgentAssistantModal;

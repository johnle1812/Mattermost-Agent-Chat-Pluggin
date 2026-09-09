import manifest from 'manifest';

export type AgentAssistantLocation = {
    conversationId: string | null;
    draft: string;
    view: 'library' | 'chat';
};

export const OPEN_AGENT_ASSISTANT_MODAL_EVENT = `${manifest.id}.open-modal`;
export const CLOSE_AGENT_ASSISTANT_MODAL_EVENT = `${manifest.id}.close-modal`;

export function openAgentAssistantModal(location: AgentAssistantLocation): void {
    window.dispatchEvent(new CustomEvent<AgentAssistantLocation>(OPEN_AGENT_ASSISTANT_MODAL_EVENT, {
        detail: location,
    }));
}

export function notifyAgentAssistantModalClosed(location: AgentAssistantLocation): void {
    window.dispatchEvent(new CustomEvent<AgentAssistantLocation>(CLOSE_AGENT_ASSISTANT_MODAL_EVENT, {
        detail: location,
    }));
}

export type MessageRole = 'user' | 'assistant';

export type Message = {
    id: string;
    role: MessageRole;
    author?: string;
    userId?: string;
    content: string;
    createdAt: string;
    thinking?: string[];
    streaming?: boolean;
};

export type ConversationParticipant = {
    id: string;
    name: string;
};

export type Conversation = {
    id: string;
    rootPostId?: string;
    channelId?: string;
    title: string;
    owner: string;
    ownerId?: string;
    participants?: ConversationParticipant[];
    unreadCount?: number;
    pinned: boolean;
    updatedAt: string;
    messages: Message[];
};

export type ConversationSort = 'updated' | 'title';

import type {Conversation, ConversationSort} from '../types/conversation';

type FilterOptions = {
    search: string;
    owner: string;
    sort: ConversationSort;
};

export function filterAndSortConversations(
    conversations: Conversation[],
    options: FilterOptions,
): Conversation[] {
    const normalizedSearch = options.search.trim().toLocaleLowerCase();

    return conversations.
        filter((conversation) => {
            const matchesSearch = normalizedSearch.length === 0 ||
                conversation.title.toLocaleLowerCase().includes(normalizedSearch) ||
                conversation.owner.toLocaleLowerCase().includes(normalizedSearch) ||
                conversation.messages.some((message) => message.content.toLocaleLowerCase().includes(normalizedSearch));
            const matchesOwner = options.owner === 'All' || conversation.owner === options.owner;

            return matchesSearch && matchesOwner;
        }).
        sort((left, right) => {
            if (left.pinned !== right.pinned) {
                return left.pinned ? -1 : 1;
            }

            if (options.sort === 'title') {
                return left.title.localeCompare(right.title);
            }

            return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        });
}

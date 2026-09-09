import {filterAndSortConversations} from './conversations';

import {mockConversations} from '../mock/conversations';

describe('filterAndSortConversations', () => {
    test('keeps pinned conversations first and sorts remaining conversations by update time', () => {
        const result = filterAndSortConversations(mockConversations, {
            search: '',
            owner: 'All',
            sort: 'updated',
        });

        expect(result.map((conversation) => conversation.id)).toEqual([
            'q3-plan',
            'logistics-cluster',
            'competitor-keywords',
            'landing-refresh',
            'linkedin-review',
            'regional-localization',
            'blog-summary',
            'technical-audit',
        ]);
    });

    test('filters conversations by owner and case-insensitive search text', () => {
        const result = filterAndSortConversations(mockConversations, {
            search: 'technical',
            owner: 'You',
            sort: 'updated',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('technical-audit');
    });
});

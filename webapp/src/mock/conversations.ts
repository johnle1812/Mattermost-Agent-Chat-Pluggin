import type {Conversation} from '../types/conversation';

export const currentDemoUser = 'You';

export const mockConversations: Conversation[] = [
    {
        id: 'q3-plan',
        title: 'Q3 content plan',
        owner: currentDemoUser,
        pinned: true,
        updatedAt: '2026-08-17T17:41:00.000Z',
        messages: [
            {
                id: 'q3-question',
                role: 'user',
                author: currentDemoUser,
                content: 'We are planning our Q3 SEO content. What topics should we prioritize based on search trends and competitor gaps?',
                createdAt: '2026-08-17T17:38:00.000Z',
            },
            {
                id: 'q3-answer',
                role: 'assistant',
                content: 'Prioritize high-intent comparison pages, practical AI workflow guides, and refreshed pillar content for your strongest product categories. I would begin with the competitor gaps that already overlap your domain authority.',
                createdAt: '2026-08-17T17:41:00.000Z',
                thinking: ['Reviewed current content themes', 'Compared competitor coverage', 'Grouped opportunities by search intent', 'Prioritized topics by business relevance'],
            },
        ],
    },
    {
        id: 'logistics-cluster',
        title: 'Logistics keyword cluster',
        owner: 'Nguyễn Đình Sơn',
        pinned: true,
        updatedAt: '2026-08-17T17:18:00.000Z',
        messages: [
            {
                id: 'logistics-question',
                role: 'user',
                author: 'Nguyễn Đình Sơn',
                content: 'Build a keyword cluster for logistics automation and group it by search intent.',
                createdAt: '2026-08-17T17:12:00.000Z',
            },
            {
                id: 'logistics-answer',
                role: 'assistant',
                content: 'I organized the cluster into awareness, solution research, comparison, and implementation topics. Warehouse automation and last-mile optimization have the strongest overlap with current content.',
                createdAt: '2026-08-17T17:18:00.000Z',
                thinking: ['Collected the shared seed terms', 'Removed overlapping keywords', 'Grouped terms by intent', 'Prioritized clusters for the content team'],
            },
        ],
    },
    {
        id: 'competitor-keywords',
        title: 'Competitor keyword analysis',
        owner: currentDemoUser,
        pinned: true,
        updatedAt: '2026-08-16T18:30:00.000Z',
        messages: [
            {id: 'competitor-question', role: 'user', author: currentDemoUser, content: 'Find the strongest keyword gaps in our competitor content.', createdAt: '2026-08-16T17:30:00.000Z'},
            {id: 'competitor-answer', role: 'assistant', content: 'The clearest gaps are implementation guides, alternative pages, and industry-specific use cases. I grouped the opportunities by estimated intent and content effort.', createdAt: '2026-08-16T18:30:00.000Z'},
        ],
    },
    {
        id: 'landing-refresh',
        title: 'Organic landing page refresh',
        owner: 'Nguyễn Thị Hương',
        pinned: false,
        updatedAt: '2026-08-17T14:40:00.000Z',
        messages: [
            {id: 'landing-question', role: 'user', author: 'Nguyễn Thị Hương', content: 'Which landing pages should our team refresh first this sprint?', createdAt: '2026-08-17T13:40:00.000Z'},
            {id: 'landing-answer', role: 'assistant', content: 'Start with the three pages that recently slipped from positions 4–8 to page two. They already have authority, so improving intent coverage and internal links should produce the fastest recovery.', createdAt: '2026-08-17T14:40:00.000Z'},
        ],
    },
    {
        id: 'linkedin-review',
        title: 'LinkedIn campaign review',
        owner: 'Phạm Bá Đạt',
        pinned: false,
        updatedAt: '2026-08-16T14:10:00.000Z',
        messages: [
            {id: 'linkedin-question', role: 'user', author: 'Phạm Bá Đạt', content: 'Review the team’s LinkedIn campaign and suggest the next three content angles.', createdAt: '2026-08-16T12:10:00.000Z'},
            {id: 'linkedin-answer', role: 'assistant', content: 'The strongest engagement came from operational lessons and concrete benchmarks. Continue with a customer workflow breakdown, an industry benchmark post, and a short myth-versus-reality series.', createdAt: '2026-08-16T14:10:00.000Z'},
        ],
    },
    {
        id: 'regional-localization',
        title: 'Regional content localization',
        owner: 'Nguyễn Thị Hương',
        pinned: false,
        updatedAt: '2026-08-15T15:00:00.000Z',
        messages: [
            {id: 'localization-question', role: 'user', author: 'Nguyễn Thị Hương', content: 'Create a shared checklist for localizing our regional SEO pages.', createdAt: '2026-08-15T14:45:00.000Z'},
            {id: 'localization-answer', role: 'assistant', content: 'The checklist covers local keyword validation, market-specific examples, metadata, internal links, legal review, and native-language quality assurance.', createdAt: '2026-08-15T15:00:00.000Z'},
        ],
    },
    {
        id: 'blog-summary',
        title: 'Blog performance summary',
        owner: currentDemoUser,
        pinned: false,
        updatedAt: '2026-08-14T16:00:00.000Z',
        messages: [
            {id: 'blog-question', role: 'user', author: currentDemoUser, content: 'Summarize this month’s blog performance.', createdAt: '2026-08-14T15:55:00.000Z'},
            {id: 'blog-answer', role: 'assistant', content: 'Organic sessions increased, while three older articles lost rankings. Refreshing those pages is the fastest near-term opportunity.', createdAt: '2026-08-14T16:00:00.000Z'},
        ],
    },
    {
        id: 'technical-audit',
        title: 'Technical SEO audit',
        owner: currentDemoUser,
        pinned: false,
        updatedAt: '2026-08-11T16:00:00.000Z',
        messages: [],
    },
];

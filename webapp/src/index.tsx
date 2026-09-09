// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import manifest from 'manifest';
import React from 'react';
import {useDispatch} from 'react-redux';
import {useHistory} from 'react-router-dom';
import type {Store, UnknownAction} from 'redux';

import type {Post} from '@mattermost/types/posts';
import type {GlobalState} from '@mattermost/types/store';

import type {PluginComponent, PluginRegistry} from 'types/mattermost-webapp';

import {AGENT_POST_CHANGED_EVENT} from './api/agent_channel';
import AgentAssistantModal from './components/agent_assistant_modal';
import AppBarUnreadBadge from './components/app_bar_badge';
import RHSPanel from './components/rhs_panel';

let hideRHSPluginAction: UnknownAction | null = null;

const AgentAssistantRHS = () => {
    const dispatch = useDispatch();
    const history = useHistory();

    return (
        <RHSPanel
            onNavigateToConversation={(permalink) => {
                if (hideRHSPluginAction) {
                    dispatch(hideRHSPluginAction);
                }
                history.push(permalink);
            }}
        />
    );
};

export default class Plugin {
    // The RHS uses the signed-in user's Mattermost session for channel posts.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        const forwardPostChange = (rawPost: string) => {
            try {
                const post = JSON.parse(rawPost) as Post;
                window.dispatchEvent(new CustomEvent<Post>(AGENT_POST_CHANGED_EVENT, {detail: post}));
            } catch {
                // Ignore malformed websocket payloads from unrelated server versions.
            }
        };

        registry.registerWebSocketEventHandler<{post: string}>('posted', (message) => {
            forwardPostChange(message.data.post);
        });
        registry.registerWebSocketEventHandler<{post: string}>('post_edited', (message) => {
            forwardPostChange(message.data.post);
        });

        registry.registerGlobalComponent(AppBarUnreadBadge);
        registry.registerRootComponent(AgentAssistantModal);

        const appBarRegistration = registry.registerAppBarComponent(
            `/plugins/${manifest.id}/public/agent-assistant-icon.svg`,
            undefined,
            'Agent Assistant',
            null,
            AgentAssistantRHS as unknown as PluginComponent,
            'Agent Assistant',
        );
        hideRHSPluginAction = appBarRegistration.component.hideRHSPlugin;
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());

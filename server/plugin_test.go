package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAgentConnectionConfig(t *testing.T) {
	plugin := &Plugin{
		configuration: &configuration{
			TeamName:    "example-team",
			ChannelName: "agent-conversations",
			BotUsername: "example_agent_bot",
		},
	}
	plugin.router = plugin.initRouter()

	request := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	request.Header.Set("Mattermost-User-ID", "test-user-id")
	recorder := httptest.NewRecorder()
	plugin.ServeHTTP(nil, recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response map[string]string
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&response))
	require.Equal(t, "example-team", response["team_name"])
	require.Equal(t, "agent-conversations", response["channel_name"])
	require.Equal(t, "example_agent_bot", response["bot_username"])
}

func TestAgentConnectionConfigRequiresAuthentication(t *testing.T) {
	plugin := &Plugin{configuration: &configuration{}}
	plugin.router = plugin.initRouter()

	request := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	recorder := httptest.NewRecorder()
	plugin.ServeHTTP(nil, recorder, request)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
}

func TestAgentConnectionConfigRequiresSettings(t *testing.T) {
	plugin := &Plugin{configuration: &configuration{}}
	plugin.router = plugin.initRouter()

	request := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	request.Header.Set("Mattermost-User-ID", "test-user-id")
	recorder := httptest.NewRecorder()
	plugin.ServeHTTP(nil, recorder, request)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
}

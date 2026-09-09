package main

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// initRouter initializes the HTTP router for the plugin.
func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()

	apiRouter := router.PathPrefix("/api/v1").Subrouter()
	apiRouter.Use(p.MattermostAuthorizationRequired)

	apiRouter.HandleFunc("/config", p.AgentConnectionConfig).Methods(http.MethodGet)

	return router
}

// AgentConnectionConfig exposes only the non-secret Mattermost coordinates
// needed by the webapp. Hermes credentials and network details stay outside
// the plugin because messages flow through ordinary Mattermost posts.
func (p *Plugin) AgentConnectionConfig(w http.ResponseWriter, _ *http.Request) {
	configuration := p.getConfiguration()
	if !configuration.isComplete() {
		http.Error(w, "Agent Assistant is not configured. Set the team, channel, and bot username in System Console > Plugins > Agent Assistant.", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{
		"bot_username": configuration.BotUsername,
		"team_name":    configuration.TeamName,
		"channel_name": configuration.ChannelName,
	}); err != nil {
		p.API.LogError("Failed to encode Agent connection configuration", "error", err)
	}
}

// ServeHTTP forwards requests under /plugins/{plugin-id} to the plugin router.
func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

func (p *Plugin) MattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("Mattermost-User-ID")
		if userID == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

package config

import "os"

type AISettings struct {
	BaseURL          string `json:"baseUrl"`
	ModelName        string `json:"modelName"`
	APIKeyConfigured bool   `json:"apiKeyConfigured"`
	APIKeySource     string `json:"apiKeySource"`
	StorageMode      string `json:"storageMode"`
}

func LoadAISettings() AISettings {
	apiKeyConfigured := os.Getenv("LLM_API_KEY") != ""

	return AISettings{
		BaseURL:          getenv("LLM_BASE_URL", ""),
		ModelName:        getenv("LLM_MODEL_NAME", ""),
		APIKeyConfigured: apiKeyConfigured,
		APIKeySource:     apiKeySource(apiKeyConfigured),
		StorageMode:      "Restricted local config file with env fallback until keychain integration lands",
	}
}

func getenv(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func apiKeySource(configured bool) string {
	if configured {
		return "Environment variable detected"
	}

	return "Waiting for secure local config or env injection"
}

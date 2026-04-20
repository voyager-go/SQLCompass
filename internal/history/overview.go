package history

type Overview struct {
	Features     []string `json:"features"`
	Retention    string   `json:"retention"`
	SmartActions []string `json:"smartActions"`
}

func DefaultOverview() Overview {
	return Overview{
		Features: []string{
			"SQL formatting",
			"Saved query history",
			"Recent tab restore",
			"Favorite statements",
			"Result grid filters",
		},
		Retention: "Store recent query and command history locally with searchable metadata and connection-level filtering.",
		SmartActions: []string{
			"Copy selected rows as INSERT statements",
			"Copy selected rows as UPDATE statements",
			"Replay recent queries against the active connection",
			"Pin frequently used statements to a quick-access shelf",
		},
	}
}

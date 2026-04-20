package impexp

type Overview struct {
	ImportFormats []string `json:"importFormats"`
	ExportFormats []string `json:"exportFormats"`
	Scenarios     []string `json:"scenarios"`
	Safeguards    []string `json:"safeguards"`
}

func DefaultOverview() Overview {
	return Overview{
		ImportFormats: []string{
			"SQL",
			"CSV",
			"Excel",
			"JSON",
		},
		ExportFormats: []string{
			"SQL",
			"CSV",
			"Excel",
			"JSON",
		},
		Scenarios: []string{
			"Export schema only, data only, or schema plus data",
			"Import CSV or Excel into a chosen table with column mapping",
			"Export result grids directly from the query studio",
			"Run full-database transfer jobs with previewable job summaries",
		},
		Safeguards: []string{
			"Preview target mappings before writing imported data.",
			"Require confirmation when import jobs can overwrite existing rows.",
			"Stream large exports to avoid freezing the desktop UI.",
		},
	}
}

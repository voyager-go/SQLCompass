package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"sqltool/internal/appmeta"
	"sqltool/internal/store"
	"sqltool/internal/workspace"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx        context.Context
	overview   appmeta.ProductOverview
	workspace  *workspace.Service
	serviceErr error
}

func NewApp() *App {
	app := &App{
		overview: appmeta.DefaultProductOverview(),
	}

	stateStore, err := store.NewStore()
	if err != nil {
		app.serviceErr = err
		return app
	}

	app.workspace = workspace.NewService(stateStore)
	return app
}

func (a *App) requireWorkspace() (*workspace.Service, error) {
	if a.serviceErr != nil {
		return nil, a.serviceErr
	}

	if a.workspace == nil {
		return nil, errors.New("workspace service is unavailable")
	}

	return a.workspace, nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) GetBootstrapData() appmeta.ProductOverview {
	return a.overview
}

func (a *App) GetWorkspaceState() (workspace.WorkspaceState, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.WorkspaceState{}, err
	}

	return service.GetWorkspaceState()
}

func (a *App) SaveConnection(input workspace.ConnectionInput) (workspace.ConnectionProfile, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.ConnectionProfile{}, err
	}

	return service.SaveConnection(input)
}

func (a *App) DeleteConnection(id string) error {
	service, err := a.requireWorkspace()
	if err != nil {
		return err
	}

	return service.DeleteConnection(id)
}

func (a *App) TestConnection(input workspace.ConnectionInput) (workspace.ConnectionTestResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.ConnectionTestResult{}, err
	}

	return service.TestConnection(input)
}

func (a *App) SaveAISettings(input workspace.AISettingsInput) (workspace.AISettingsView, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.AISettingsView{}, err
	}

	return service.SaveAISettings(input)
}

func (a *App) ClearAIAPIKey() (workspace.AISettingsView, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.AISettingsView{}, err
	}

	return service.ClearAIAPIKey()
}

func (a *App) GetExplorerTree(input workspace.ExplorerRequest) (workspace.ExplorerTree, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.ExplorerTree{}, err
	}

	return service.GetExplorerTree(input)
}

func (a *App) GetTableDetail(input workspace.TableDetailRequest) (workspace.TableDetail, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.TableDetail{}, err
	}

	return service.GetTableDetail(input)
}

func (a *App) ExecuteQuery(input workspace.QueryRequest) (workspace.QueryResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.QueryResult{}, err
	}

	return service.ExecuteQuery(input)
}

func (a *App) PreviewTableData(input workspace.TablePreviewRequest) (workspace.QueryResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.QueryResult{}, err
	}

	return service.PreviewTableData(input)
}

func (a *App) GetQueryHistory(connectionID string) ([]workspace.HistoryItem, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return nil, err
	}

	return service.GetQueryHistory(connectionID)
}

func (a *App) RenameTable(input workspace.RenameTableInput) (workspace.RenameTableResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.RenameTableResult{}, err
	}

	return service.RenameTable(input)
}

func (a *App) GetFieldDictionarySuggestion(input workspace.FieldDictionaryRequest) (workspace.FieldDictionarySuggestion, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.FieldDictionarySuggestion{}, err
	}

	return service.GetFieldDictionarySuggestion(input)
}

func (a *App) GenerateFieldComment(input workspace.AIFieldCommentRequest) (workspace.AIFieldCommentResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.AIFieldCommentResult{}, err
	}

	return service.GenerateFieldComment(input)
}

func (a *App) OptimizeSQL(input workspace.SQLOptimizeRequest) (workspace.SQLOptimizeResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.SQLOptimizeResult{}, err
	}

	return service.OptimizeSQL(input)
}

func (a *App) BeautifySQL(input workspace.SQLOptimizeRequest) (workspace.SQLOptimizeResult, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.SQLOptimizeResult{}, err
	}

	return service.BeautifySQL(input)
}

func (a *App) AnalyzeSQL(statement string) (workspace.SQLAnalysis, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.SQLAnalysis{}, err
	}

	return service.AnalyzeSQL(statement), nil
}

func (a *App) ChatWithDatabase(input workspace.ChatDatabaseRequest) (workspace.ChatDatabaseResponse, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.ChatDatabaseResponse{}, err
	}

	return service.ChatWithDatabase(input)
}

func (a *App) RepairChatSQL(input workspace.ChatRepairRequest) (workspace.ChatDatabaseResponse, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.ChatDatabaseResponse{}, err
	}

	return service.RepairChatSQL(input)
}

func (a *App) SummarizeChatResult(input workspace.ChatResultSummaryRequest) (workspace.ChatResultSummary, error) {
	service, err := a.requireWorkspace()
	if err != nil {
		return workspace.ChatResultSummary{}, err
	}

	return service.SummarizeChatResult(input)
}

func (a *App) ExportTextFile(input workspace.ExportFileRequest) (workspace.ExportFileResult, error) {
	if a.ctx == nil {
		return workspace.ExportFileResult{}, errors.New("desktop context is unavailable")
	}

	filename := sanitizeExportFilename(input.SuggestedName, input.Kind)
	selectedPath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:                chooseExportTitle(input.Title),
		DefaultDirectory:     defaultExportDirectory(),
		DefaultFilename:      filename,
		CanCreateDirectories: true,
		Filters:              exportFilters(input.Kind),
	})
	if err != nil {
		return workspace.ExportFileResult{}, err
	}

	if strings.TrimSpace(selectedPath) == "" {
		return workspace.ExportFileResult{Saved: false}, nil
	}

	if err := os.WriteFile(selectedPath, []byte(input.Content), 0o644); err != nil {
		return workspace.ExportFileResult{}, err
	}

	return workspace.ExportFileResult{
		Path:  selectedPath,
		Saved: true,
	}, nil
}

func chooseExportTitle(title string) string {
	if strings.TrimSpace(title) != "" {
		return strings.TrimSpace(title)
	}

	return "导出文件"
}

func sanitizeExportFilename(name string, kind string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = "sqltool-export"
	}

	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "\n", "", "\r", "", "\t", " ")
	trimmed = replacer.Replace(trimmed)
	if filepath.Ext(trimmed) == "" {
		trimmed += exportExtension(kind)
	}

	return trimmed
}

func exportExtension(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "sql":
		return ".sql"
	case "csv":
		return ".csv"
	case "xls":
		return ".xls"
	case "txt":
		return ".txt"
	default:
		return ".txt"
	}
}

func exportFilters(kind string) []wailsruntime.FileFilter {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "sql":
		return []wailsruntime.FileFilter{
			{DisplayName: "SQL 文件", Pattern: "*.sql"},
			{DisplayName: "文本文件", Pattern: "*.txt"},
		}
	case "csv":
		return []wailsruntime.FileFilter{
			{DisplayName: "CSV 文件", Pattern: "*.csv"},
			{DisplayName: "文本文件", Pattern: "*.txt"},
		}
	case "xls":
		return []wailsruntime.FileFilter{
			{DisplayName: "Excel 文件", Pattern: "*.xls"},
			{DisplayName: "HTML 文件", Pattern: "*.html"},
		}
	default:
		return []wailsruntime.FileFilter{
			{DisplayName: "文本文件", Pattern: "*.txt"},
			{DisplayName: "所有文件", Pattern: "*.*"},
		}
	}
}

func defaultExportDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	downloads := filepath.Join(home, "Downloads")
	if info, statErr := os.Stat(downloads); statErr == nil && info.IsDir() {
		return downloads
	}

	return home
}

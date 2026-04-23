package workspace

import (
	"context"
	"database/sql"
	"sync"
	"time"
)

type poolEntry struct {
	db       *sql.DB
	lastUsed time.Time
	openedAt time.Time
}

// ConnectionPool caches open database connections for reuse.
type ConnectionPool struct {
	mu       sync.Mutex
	entries  map[string]*poolEntry // key: connectionID + "/" + database
	maxIdle  time.Duration
	maxOpen  time.Duration
}

// NewConnectionPool creates a new connection pool.
func NewConnectionPool() *ConnectionPool {
	return &ConnectionPool{
		entries: make(map[string]*poolEntry),
		maxIdle: 5 * time.Minute,  // Close after 5 min idle
		maxOpen: 30 * time.Minute, // Close after 30 min total
	}
}

func poolKey(connectionID string, database string) string {
	return connectionID + "/" + database
}

// Get retrieves or opens a database connection.
func (p *ConnectionPool) Get(connectionID string, database string, opener func() (*sql.DB, error)) (*sql.DB, error) {
	key := poolKey(connectionID, database)

	p.mu.Lock()
	entry, exists := p.entries[key]
	p.mu.Unlock()

	if exists {
		// Check if connection is still alive
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		err := entry.db.PingContext(ctx)
		cancel()

		if err == nil {
			entry.lastUsed = time.Now()
			return entry.db, nil
		}
		// Connection is dead, remove it
		entry.db.Close()
		p.mu.Lock()
		delete(p.entries, key)
		p.mu.Unlock()
	}

	// Open a new connection
	db, err := opener()
	if err != nil {
		return nil, err
	}

	// Configure pool settings
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(30 * time.Minute)

	entry = &poolEntry{
		db:       db,
		lastUsed: time.Now(),
		openedAt: time.Now(),
	}

	p.mu.Lock()
	// Close existing entry if another goroutine created one
	if existing, ok := p.entries[key]; ok {
		existing.db.Close()
	}
	p.entries[key] = entry
	p.mu.Unlock()

	return db, nil
}

// Remove closes and removes a cached connection.
func (p *ConnectionPool) Remove(connectionID string, database string) {
	key := poolKey(connectionID, database)

	p.mu.Lock()
	entry, exists := p.entries[key]
	if exists {
		delete(p.entries, key)
	}
	p.mu.Unlock()

	if exists {
		entry.db.Close()
	}
}

// CloseAll closes all cached connections.
func (p *ConnectionPool) CloseAll() {
	p.mu.Lock()
	entries := p.entries
	p.entries = make(map[string]*poolEntry)
	p.mu.Unlock()

	for _, entry := range entries {
		entry.db.Close()
	}
}

// Cleanup removes expired connections.
func (p *ConnectionPool) Cleanup() {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	for key, entry := range p.entries {
		idle := now.Sub(entry.lastUsed)
		age := now.Sub(entry.openedAt)
		if idle > p.maxIdle || age > p.maxOpen {
			entry.db.Close()
			delete(p.entries, key)
		}
	}
}

// StartCleanup starts a background goroutine that periodically cleans up expired connections.
func (p *ConnectionPool) StartCleanup(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				p.CloseAll()
				return
			case <-ticker.C:
				p.Cleanup()
			}
		}
	}()
}

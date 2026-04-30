package workspace

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type sqlPoolEntry struct {
	db       *sql.DB
	lastUsed time.Time
	openedAt time.Time
}

type redisPoolEntry struct {
	client   *redis.Client
	lastUsed time.Time
	openedAt time.Time
}

type mongoPoolEntry struct {
	client   *mongo.Client
	lastUsed time.Time
	openedAt time.Time
}

// ConnectionPool caches open database, Redis, and MongoDB connections for reuse.
type ConnectionPool struct {
	mu           sync.Mutex
	sqlEntries   map[string]*sqlPoolEntry   // key: connectionID + "/" + database
	redisEntries map[string]*redisPoolEntry // key: connectionID
	mongoEntries map[string]*mongoPoolEntry // key: connectionID
	maxIdle      time.Duration
	maxOpen      time.Duration
}

// NewConnectionPool creates a new connection pool.
func NewConnectionPool() *ConnectionPool {
	return &ConnectionPool{
		sqlEntries:   make(map[string]*sqlPoolEntry),
		redisEntries: make(map[string]*redisPoolEntry),
		mongoEntries: make(map[string]*mongoPoolEntry),
		maxIdle:      ConnMaxIdle,
		maxOpen:      ConnMaxAge,
	}
}

func poolKey(connectionID string, database string) string {
	return connectionID + "/" + database
}

// Get retrieves or opens a SQL database connection.
func (p *ConnectionPool) Get(connectionID string, database string, opener func() (*sql.DB, error)) (*sql.DB, error) {
	key := poolKey(connectionID, database)

	p.mu.Lock()
	entry, exists := p.sqlEntries[key]
	if exists {
		// Validate connection under lock to prevent use-after-close races.
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutPoolPing)
		err := entry.db.PingContext(ctx)
		cancel()

		if err == nil {
			entry.lastUsed = time.Now()
			db := entry.db
			p.mu.Unlock()
			return db, nil
		}
		// Connection is dead, remove it.
		entry.db.Close()
		delete(p.sqlEntries, key)
	}
	p.mu.Unlock()

	// Open a new connection outside the lock.
	db, err := opener()
	if err != nil {
		return nil, err
	}

	// Only set ConnMaxLifetime here. MaxOpenConns/MaxIdleConns are
	// set by each engine's opener (SQLite needs 1, others use PoolMaxOpenConns).
	db.SetConnMaxLifetime(ConnMaxLifetime)

	newEntry := &sqlPoolEntry{
		db:       db,
		lastUsed: time.Now(),
		openedAt: time.Now(),
	}

	p.mu.Lock()
	// Another goroutine may have created one while we were opening.
	if existing, ok := p.sqlEntries[key]; ok {
		p.mu.Unlock()
		db.Close()
		return existing.db, nil
	}
	p.sqlEntries[key] = newEntry
	p.mu.Unlock()

	return db, nil
}

// GetRedis retrieves or opens a Redis client.
func (p *ConnectionPool) GetRedis(connectionID string, opener func() (*redis.Client, error)) (*redis.Client, error) {
	key := "redis:" + connectionID

	p.mu.Lock()
	entry, exists := p.redisEntries[key]
	if exists {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutPoolPing)
		_, err := entry.client.Ping(ctx).Result()
		cancel()

		if err == nil {
			entry.lastUsed = time.Now()
			client := entry.client
			p.mu.Unlock()
			return client, nil
		}
		_ = entry.client.Close()
		delete(p.redisEntries, key)
	}
	p.mu.Unlock()

	client, err := opener()
	if err != nil {
		return nil, err
	}

	newEntry := &redisPoolEntry{
		client:   client,
		lastUsed: time.Now(),
		openedAt: time.Now(),
	}

	p.mu.Lock()
	if existing, ok := p.redisEntries[key]; ok {
		p.mu.Unlock()
		_ = client.Close()
		return existing.client, nil
	}
	p.redisEntries[key] = newEntry
	p.mu.Unlock()

	return client, nil
}

// GetMongo retrieves or opens a MongoDB client.
func (p *ConnectionPool) GetMongo(connectionID string, opener func() (*mongo.Client, error)) (*mongo.Client, error) {
	key := "mongo:" + connectionID

	p.mu.Lock()
	entry, exists := p.mongoEntries[key]
	if exists {
		ctx, cancel := context.WithTimeout(context.Background(), TimeoutPoolPing)
		err := entry.client.Ping(ctx, nil)
		cancel()

		if err == nil {
			entry.lastUsed = time.Now()
			client := entry.client
			p.mu.Unlock()
			return client, nil
		}
		_ = entry.client.Disconnect(context.Background())
		delete(p.mongoEntries, key)
	}
	p.mu.Unlock()

	client, err := opener()
	if err != nil {
		return nil, err
	}

	newEntry := &mongoPoolEntry{
		client:   client,
		lastUsed: time.Now(),
		openedAt: time.Now(),
	}

	p.mu.Lock()
	if existing, ok := p.mongoEntries[key]; ok {
		p.mu.Unlock()
		_ = client.Disconnect(context.Background())
		return existing.client, nil
	}
	p.mongoEntries[key] = newEntry
	p.mu.Unlock()

	return client, nil
}

// Remove closes and removes a cached SQL connection.
func (p *ConnectionPool) Remove(connectionID string, database string) {
	key := poolKey(connectionID, database)

	p.mu.Lock()
	entry, exists := p.sqlEntries[key]
	if exists {
		delete(p.sqlEntries, key)
	}
	p.mu.Unlock()

	if exists {
		entry.db.Close()
	}
}

// CloseByConnectionID closes all pooled connections for a given connection ID.
func (p *ConnectionPool) CloseByConnectionID(connectionID string) int {
	prefix := connectionID + "/"

	p.mu.Lock()
	var closedCount int

	// SQL entries
	var sqlToClose []*sqlPoolEntry
	for key := range p.sqlEntries {
		if strings.HasPrefix(key, prefix) {
			if entry, ok := p.sqlEntries[key]; ok {
				sqlToClose = append(sqlToClose, entry)
			}
			delete(p.sqlEntries, key)
		}
	}

	// Redis entries
	var redisToClose []*redisPoolEntry
	redisKey := "redis:" + connectionID
	if entry, ok := p.redisEntries[redisKey]; ok {
		redisToClose = append(redisToClose, entry)
		delete(p.redisEntries, redisKey)
	}

	// Mongo entries
	var mongoToClose []*mongoPoolEntry
	mongoKey := "mongo:" + connectionID
	if entry, ok := p.mongoEntries[mongoKey]; ok {
		mongoToClose = append(mongoToClose, entry)
		delete(p.mongoEntries, mongoKey)
	}

	p.mu.Unlock()

	for _, entry := range sqlToClose {
		entry.db.Close()
		closedCount++
	}
	for _, entry := range redisToClose {
		_ = entry.client.Close()
		closedCount++
	}
	for _, entry := range mongoToClose {
		_ = entry.client.Disconnect(context.Background())
		closedCount++
	}

	return closedCount
}

// CloseAll closes all cached connections.
func (p *ConnectionPool) CloseAll() {
	p.mu.Lock()
	sqlEntries := p.sqlEntries
	redisEntries := p.redisEntries
	mongoEntries := p.mongoEntries
	p.sqlEntries = make(map[string]*sqlPoolEntry)
	p.redisEntries = make(map[string]*redisPoolEntry)
	p.mongoEntries = make(map[string]*mongoPoolEntry)
	p.mu.Unlock()

	for _, entry := range sqlEntries {
		entry.db.Close()
	}
	for _, entry := range redisEntries {
		_ = entry.client.Close()
	}
	for _, entry := range mongoEntries {
		_ = entry.client.Disconnect(context.Background())
	}
}

// CloseAllWithCount closes all cached connections and returns the count.
func (p *ConnectionPool) CloseAllWithCount() int {
	p.mu.Lock()
	sqlEntries := p.sqlEntries
	redisEntries := p.redisEntries
	mongoEntries := p.mongoEntries
	count := len(sqlEntries) + len(redisEntries) + len(mongoEntries)
	p.sqlEntries = make(map[string]*sqlPoolEntry)
	p.redisEntries = make(map[string]*redisPoolEntry)
	p.mongoEntries = make(map[string]*mongoPoolEntry)
	p.mu.Unlock()

	for _, entry := range sqlEntries {
		entry.db.Close()
	}
	for _, entry := range redisEntries {
		_ = entry.client.Close()
	}
	for _, entry := range mongoEntries {
		_ = entry.client.Disconnect(context.Background())
	}
	return count
}

// Cleanup removes expired connections and returns how many were closed.
func (p *ConnectionPool) Cleanup() int {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	var closed int

	for key, entry := range p.sqlEntries {
		idle := now.Sub(entry.lastUsed)
		age := now.Sub(entry.openedAt)
		if idle > p.maxIdle || age > p.maxOpen {
			entry.db.Close()
			delete(p.sqlEntries, key)
			closed++
		}
	}

	for key, entry := range p.redisEntries {
		idle := now.Sub(entry.lastUsed)
		age := now.Sub(entry.openedAt)
		if idle > p.maxIdle || age > p.maxOpen {
			_ = entry.client.Close()
			delete(p.redisEntries, key)
			closed++
		}
	}

	for key, entry := range p.mongoEntries {
		idle := now.Sub(entry.lastUsed)
		age := now.Sub(entry.openedAt)
		if idle > p.maxIdle || age > p.maxOpen {
			_ = entry.client.Disconnect(context.Background())
			delete(p.mongoEntries, key)
			closed++
		}
	}

	return closed
}

// Status returns the current status of all pooled connections.
func (p *ConnectionPool) Status() ConnectionPoolStatus {
	p.mu.Lock()
	defer p.mu.Unlock()

	entries := make([]PoolEntryInfo, 0, len(p.sqlEntries)+len(p.redisEntries)+len(p.mongoEntries))
	for key, entry := range p.sqlEntries {
		entries = append(entries, PoolEntryInfo{
			Key:      key,
			LastUsed: entry.lastUsed.Format(time.RFC3339),
			OpenedAt: entry.openedAt.Format(time.RFC3339),
		})
	}
	for key, entry := range p.redisEntries {
		entries = append(entries, PoolEntryInfo{
			Key:      key,
			LastUsed: entry.lastUsed.Format(time.RFC3339),
			OpenedAt: entry.openedAt.Format(time.RFC3339),
		})
	}
	for key, entry := range p.mongoEntries {
		entries = append(entries, PoolEntryInfo{
			Key:      key,
			LastUsed: entry.lastUsed.Format(time.RFC3339),
			OpenedAt: entry.openedAt.Format(time.RFC3339),
		})
	}

	return ConnectionPoolStatus{
		Entries: entries,
		Total:   len(entries),
	}
}

// GetConnectionPoolStatus returns the current connection pool status.
func (s *Service) GetConnectionPoolStatus() ConnectionPoolStatus {
	return s.pool.Status()
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

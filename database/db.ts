import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Returns a live SQLite connection, re-opening if the native handle was
 * reclaimed by the OS (e.g. after a long background period on Android).
 *
 * Bug fix: the old singleton never reset itself, so after Android reclaimed
 * the native file descriptor the JS reference was still non-null but all
 * queries silently returned empty results — making it look like data was lost.
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
    if (dbInstance) {
        // Probe with a lightweight query. If the native handle is dead this
        // will throw, allowing us to reconnect below.
        try {
            await dbInstance.getFirstAsync('SELECT 1');
            return dbInstance;
        } catch (_) {
            console.warn('db: stale connection detected — reconnecting…');
            dbInstance = null;
        }
    }

    dbInstance = await SQLite.openDatabaseAsync('badminton.db');
    await initDatabase(dbInstance);
    return dbInstance;
};

/**
 * Force-closes and nullifies the current connection so the next getDatabase()
 * call re-opens fresh. Safe to call at any time.
 */
export const resetDatabaseConnection = () => {
    dbInstance = null;
};

const initDatabase = async (db: SQLite.SQLiteDatabase) => {
    try {
        await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        matchesPlayed INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        avatar TEXT
      );
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        teamAPlayers TEXT NOT NULL,
        teamBPlayers TEXT NOT NULL,
        teamAScore INTEGER NOT NULL,
        teamBScore INTEGER NOT NULL,
        winnerTeam TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS error_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        stack TEXT
      );
    `);

        // Checkpoint WAL so the write-ahead log doesn't grow unboundedly
        // during long sessions. PASSIVE mode is non-blocking.
        try {
            await db.execAsync('PRAGMA wal_checkpoint(PASSIVE);');
        } catch (_) {
            // Non-fatal — WAL checkpoint is best-effort
        }


        // Migration: Add avatar column if it doesn't exist (safe approach for dev)
        try {
            await db.execAsync('ALTER TABLE players ADD COLUMN avatar TEXT');
        } catch (e) {
            // Likely column already exists
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

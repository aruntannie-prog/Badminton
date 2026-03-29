import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('badminton.db');
    await initDatabase(dbInstance);
  }
  return dbInstance;
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
        teamAPlayers TEXT NOT NULL, -- JSON string or comma-separated IDs
        teamBPlayers TEXT NOT NULL,
        teamAScore INTEGER NOT NULL,
        teamBScore INTEGER NOT NULL,
        winnerTeam TEXT NOT NULL -- 'A' or 'B'
      );
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

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

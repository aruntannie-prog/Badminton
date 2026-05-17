import { getDatabase } from './db';

const MAX_LOG_ENTRIES = 100; // keep last 100 errors — prune older ones automatically

export interface ErrorEntry {
    id: number;
    ts: number;
    source: string;
    message: string;
    stack: string | null;
}

/**
 * Lightweight local crash / error reporter backed by SQLite.
 *
 * Why local instead of Sentry?
 * This is a personal app — a full remote crash reporter adds account overhead.
 * This module gives the same benefit for field debugging:
 *   - Every unhandled JS error (and any manually logged error) is persisted
 *     to the `error_log` SQLite table with a timestamp and stack trace.
 *   - Call ErrorLogger.getRecentErrors() to view them (e.g. in a debug screen).
 *   - Automatically prunes entries beyond the last 100 so storage doesn't grow.
 *
 * Wired up via ErrorUtils.setGlobalHandler in app/_layout.tsx so ALL
 * unhandled JS exceptions are captured automatically.
 */
export const ErrorLogger = {
    /**
     * Persist an error entry to the local SQLite error_log table.
     * Safe to call from any context — swallows its own errors to avoid loops.
     */
    async logError(source: string, error: unknown): Promise<void> {
        try {
            const db = await getDatabase();
            const message = error instanceof Error
                ? error.message
                : (typeof error === 'string' ? error : JSON.stringify(error));
            const stack = error instanceof Error ? (error.stack ?? null) : null;

            await db.runAsync(
                'INSERT INTO error_log (ts, source, message, stack) VALUES (?, ?, ?, ?)',
                Date.now(), source, message, stack
            );

            // Prune: delete all but the latest MAX_LOG_ENTRIES rows
            await db.runAsync(
                `DELETE FROM error_log WHERE id NOT IN (
                    SELECT id FROM error_log ORDER BY ts DESC LIMIT ?
                )`,
                MAX_LOG_ENTRIES
            );
        } catch (loggingError) {
            // Never throw — this must be silent to avoid infinite error loops
            console.warn('ErrorLogger.logError itself failed:', loggingError);
        }
    },

    /**
     * Returns the most recent error entries for debugging (newest first).
     */
    async getRecentErrors(limit = 20): Promise<ErrorEntry[]> {
        try {
            const db = await getDatabase();
            return await db.getAllAsync<ErrorEntry>(
                'SELECT * FROM error_log ORDER BY ts DESC LIMIT ?',
                limit
            );
        } catch (e) {
            console.warn('ErrorLogger.getRecentErrors failed:', e);
            return [];
        }
    },

    /**
     * Clears all stored error log entries.
     */
    async clearLog(): Promise<void> {
        try {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM error_log');
        } catch (e) {
            console.warn('ErrorLogger.clearLog failed:', e);
        }
    }
};

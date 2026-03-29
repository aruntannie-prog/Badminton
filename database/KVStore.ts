import { getDatabase } from './db';

export const KVStore = {
    async setItem(key: string, value: string): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)',
            key, value
        );
    },

    async getItem(key: string): Promise<string | null> {
        const db = await getDatabase();
        const result = await db.getAllAsync<{ value: string }>(
            'SELECT value FROM kv_store WHERE key = ?',
            key
        );
        if (result && result.length > 0) {
            return result[0].value;
        }
        return null;
    },

    async removeItem(key: string): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM kv_store WHERE key = ?', key);
    }
};

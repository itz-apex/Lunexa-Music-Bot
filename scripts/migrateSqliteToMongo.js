const path = require('path');
const BetterSqlite3 = require('better-sqlite3');
const { MongoClient } = require('mongodb');

const SQLITE_PATH = path.join(process.cwd(), 'database.db');
const MONGO_DATABASE_NAME = process.env.MONGODB_DB_NAME || 'groove';

const parseJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const tableMappings = {
    profiles: {
        key: row => row.userId,
        transform: row => ({
            ...row,
            badges: parseJson(row.badges, []),
            friends: parseJson(row.friends, []),
            deniedCommands: parseJson(row.deniedCommands, []),
            allowedCommands: parseJson(row.allowedCommands, [])
        })
    },
    liked: {
        key: row => row.userId,
        transform: row => ({ userId: row.userId, songs: parseJson(row.songs, []) })
    },
    noprefix: {
        key: row => String(row.id),
        transform: row => ({
            ...row,
            noprefix: Boolean(row.noprefix)
        })
    },
    blacklist: { key: row => row.userId },
    prefixes: { key: row => row.guildId },
    rankPermissions: {
        key: row => row.rank,
        transform: row => ({
            ...row,
            allowedCommands: parseJson(row.allowedCommands, []),
            deniedCommands: parseJson(row.deniedCommands, [])
        })
    },
    ignorechannels: {
        key: row => `${row.guildId}:${row.channelId}`
    },
    userpreferences: { key: row => row.userId },
    setup: { key: row => row.guildId },
    twofourseven: { key: row => row.guildId },
    vcstatus: { key: row => row.guildId },
    reboot: { key: row => row.id }
};

async function migrate() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI secret is not configured');
    }

    const sqlite = new BetterSqlite3(SQLITE_PATH, { readonly: true });
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15_000,
        connectTimeoutMS: 15_000,
        socketTimeoutMS: 60_000
    });

    try {
        await mongoClient.connect();
        const database = mongoClient.db(MONGO_DATABASE_NAME);
        const summary = [];

        for (const [collectionName, mapping] of Object.entries(tableMappings)) {
            const tableExists = sqlite.prepare(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
            ).get(collectionName);
            if (!tableExists) {
                summary.push(`${collectionName}:skipped`);
                continue;
            }

            const rows = sqlite.prepare(`SELECT * FROM ${collectionName}`).all();
            const operations = rows.map(row => {
                const document = mapping.transform ? mapping.transform(row) : { ...row };
                const id = String(mapping.key(row));
                return {
                    replaceOne: {
                        filter: { _id: id },
                        replacement: { _id: id, ...document },
                        upsert: true
                    }
                };
            });

            if (operations.length > 0) {
                await database.collection(collectionName).bulkWrite(operations, { ordered: false });
            }
            summary.push(`${collectionName}:${rows.length}`);
        }

        console.log(`[Migration] SQLite to MongoDB complete (${summary.join(', ')})`);
    } finally {
        sqlite.close();
        await mongoClient.close();
    }
}

migrate().catch(error => {
    console.error('[Migration] Failed:', error.message);
    process.exitCode = 1;
});
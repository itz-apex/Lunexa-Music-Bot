const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const config = require('../config.js');

const COLLECTIONS = [
    'profiles',
    'liked',
    'noprefix',
    'blacklist',
    'prefixes',
    'rankPermissions',
    'ignorechannels',
    'userpreferences',
    'setup',
    'twofourseven',
    'vcstatus',
    'reboot'
];

class MongoDatabase {
    constructor() {
        this.client = null;
        this.database = null;
        this.cache = new Map();
        this.writeQueue = Promise.resolve();
        this.ready = false;

        this.profiles = this.createKeyedManager('profiles', 'userId', {
            transform: deserializeProfile
        });
        this.blacklist = this.createKeyedManager('blacklist', 'userId');
        this.prefixes = this.createKeyedManager('prefixes', 'guildId');
        this.setup = this.createKeyedManager('setup', 'guildId');
        this.twofourseven = this.createKeyedManager('twofourseven', 'guildId');
        this.userpreferences = this.createKeyedManager('userpreferences', 'userId');
        this.vcstatus = this.createKeyedManager('vcstatus', 'guildId');
        this.reboot = this.createKeyedManager('reboot', 'id');

        this.liked = {
            get: userId => {
                const document = this.getCached('liked', userId);
                return clone(document?.songs || []);
            },
            set: (userId, songs) => {
                this.setCached('liked', userId, {
                    userId,
                    songs: clone(songs)
                });
            }
        };

        this.noprefix = this.createNoPrefixManager();
        this.ignorechannels = this.createIgnoreChannelsManager();
        this.rankPermissions = this.createRankPermissionsManager();
    }

    async connect() {
        if (this.ready) return;
        const mongoUri = process.env.MONGODB_URI || config.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI secret is not configured');
        }

        this.client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 15_000,
            connectTimeoutMS: 15_000,
            socketTimeoutMS: 60_000,
            maxPoolSize: 10
        });
        await this.client.connect();
        this.database = this.client.db(process.env.MONGODB_DB_NAME || 'groove');

        await Promise.all(COLLECTIONS.map(collectionName => this.loadCollection(collectionName)));
        this.ready = true;
        console.log(`[DB] MongoDB connected (${this.database.databaseName})`);
    }

    async disconnect() {
        if (this.client) await this.client.close();
        this.ready = false;
    }

    async ping() {
        this.assertReady();
        return this.database.command({ ping: 1 });
    }

    async loadCollection(collectionName) {
        const documents = await this.collection(collectionName).find({}).toArray();
        const collectionCache = new Map();
        for (const document of documents) {
            collectionCache.set(String(document._id), stripMongoId(document));
        }
        this.cache.set(collectionName, collectionCache);
    }

    createKeyedManager(collectionName, keyField, options = {}) {
        const transform = options.transform || identity;
        return {
            get: key => {
                const document = this.getCached(collectionName, key);
                return document ? transform(clone(document)) : null;
            },
            set: (key, data) => {
                const existing = this.getCached(collectionName, key) || {};
                const document = {
                    ...existing,
                    ...clone(data),
                    [keyField]: key
                };
                this.setCached(collectionName, key, document);
            },
            delete: key => {
                this.deleteCached(collectionName, key);
            },
            getAll: () => {
                return this.getCollectionCache(collectionName)
                    .values()
                    .map(document => transform(clone(document)));
            },
            find: () => {
                return this.getCollectionCache(collectionName)
                    .values()
                    .map(document => transform(clone(document)));
            },
            deleteMany: () => {
                const entries = [...this.getCollectionCache(collectionName).values()];
                entries.forEach(entry => this.deleteCached(collectionName, entry[keyField]));
                return { deletedCount: entries.length };
            }
        };
    }

    createNoPrefixManager() {
        return {
            get: (userId, guildId = 'GLOBAL') =>
                this.findOneNoPrefix({ userId, guildId }),
            getGlobal: userId => {
                const entry = this.findOneNoPrefix({
                    userId,
                    guildId: 'GLOBAL',
                    noprefix: true
                });
                if (entry?.expiresAt && new Date(entry.expiresAt) < new Date()) {
                    this.deleteCached('noprefix', entry.id);
                    return null;
                }
                return entry;
            },
            find: filter => this.findNoPrefix(filter),
            findOne: filter => this.findOneNoPrefix(filter),
            findExpired: now => this.findNoPrefix()
                .filter(entry => entry.expiresAt && new Date(entry.expiresAt) < new Date(now)),
            create: data => {
                const id = crypto.randomUUID();
                this.setCached('noprefix', id, {
                    ...clone(data),
                    id
                });
            },
            updateOne: (filter, data) => {
                const entry = this.findOneNoPrefix(filter);
                if (!entry) return;
                this.setCached('noprefix', entry.id, {
                    ...entry,
                    ...clone(data),
                    id: entry.id
                });
            },
            deleteOne: filter => {
                const entry = this.findOneNoPrefix(filter);
                if (entry) this.deleteCached('noprefix', entry.id);
            },
            deleteMany: filter => {
                const entries = this.findNoPrefix(filter);
                entries.forEach(entry => this.deleteCached('noprefix', entry.id));
                return { deletedCount: entries.length };
            },
            delete: id => {
                this.deleteCached('noprefix', id);
            }
        };
    }

    createIgnoreChannelsManager() {
        return {
            get: (guildId, channelId) =>
                this.getCached('ignorechannels', `${guildId}:${channelId}`),
            getForGuild: guildId => this.getCollectionCache('ignorechannels')
                .values()
                .filter(entry => entry.guildId === guildId),
            add: (guildId, channelId) => {
                this.setCached('ignorechannels', `${guildId}:${channelId}`, {
                    guildId,
                    channelId
                });
            },
            remove: (guildId, channelId) => {
                this.deleteCached('ignorechannels', `${guildId}:${channelId}`);
            },
            deleteForGuild: guildId => {
                this.getCollectionCache('ignorechannels')
                    .values()
                    .filter(entry => entry.guildId === guildId)
                    .forEach(entry => {
                        this.deleteCached('ignorechannels', `${entry.guildId}:${entry.channelId}`);
                    });
            }
        };
    }

    createRankPermissionsManager() {
        return {
            get: rank => {
                const document = this.getCached('rankPermissions', rank);
                return document
                    ? {
                        ...clone(document),
                        allowedCommands: clone(document.allowedCommands || []),
                        deniedCommands: clone(document.deniedCommands || [])
                    }
                    : { rank, allowedCommands: [], deniedCommands: [] };
            },
            set: (rank, data) => {
                this.setCached('rankPermissions', rank, {
                    ...clone(data),
                    rank
                });
            },
            deleteMany: () => {
                const entries = [...this.getCollectionCache('rankPermissions').values()];
                entries.forEach(entry => this.deleteCached('rankPermissions', entry.rank));
            }
        };
    }

    findNoPrefix(filter = {}) {
        return this.getCollectionCache('noprefix')
            .values()
            .filter(entry => matchesFilter(entry, filter))
            .map(entry => clone(entry));
    }

    findOneNoPrefix(filter = {}) {
        return this.findNoPrefix(filter)[0] || null;
    }

    getCached(collectionName, key) {
        this.assertReady();
        return this.getCollectionCache(collectionName).get(this.cacheKey(collectionName, key));
    }

    setCached(collectionName, key, document) {
        this.assertReady();
        const cacheKey = this.cacheKey(collectionName, key);
        const storedDocument = clone(document);
        this.getCollectionCache(collectionName).set(cacheKey, storedDocument);
        this.enqueueWrite(collectionName, cacheKey, storedDocument);
    }

    deleteCached(collectionName, key) {
        this.assertReady();
        const cacheKey = this.cacheKey(collectionName, key);
        this.getCollectionCache(collectionName).delete(cacheKey);
        this.writeQueue = this.writeQueue
            .then(() => this.collection(collectionName).deleteOne({ _id: cacheKey }))
            .catch(error => {
                console.error(`[DB] MongoDB delete failed in ${collectionName}:`, error.message);
            });
    }

    enqueueWrite(collectionName, cacheKey, document) {
        this.writeQueue = this.writeQueue
            .then(() => {
                const { _id, ...storedDocument } = {
                    ...clone(document),
                    _id: cacheKey
                };
                return this.collection(collectionName).updateOne(
                    { _id },
                    { $set: storedDocument },
                    { upsert: true }
                );
            })
            .catch(error => {
                console.error(`[DB] MongoDB write failed in ${collectionName}:`, error.message);
            });
    }

    getCollectionCache(collectionName) {
        if (!this.cache.has(collectionName)) this.cache.set(collectionName, new Map());
        return new CollectionCache(this.cache.get(collectionName));
    }

    cacheKey(collectionName, key) {
        if (collectionName === 'ignorechannels') return String(key);
        return String(key);
    }

    collection(collectionName) {
        this.assertConnected();
        return this.database.collection(collectionName);
    }

    assertConnected() {
        if (!this.database) throw new Error('MongoDB is not connected');
    }

    assertReady() {
        if (!this.ready) throw new Error('MongoDB cache is not ready');
    }
}

class CollectionCache {
    constructor(map) {
        this.map = map;
    }

    get(key) {
        return this.map.get(String(key));
    }

    set(key, value) {
        this.map.set(String(key), value);
    }

    delete(key) {
        return this.map.delete(String(key));
    }

    values() {
        return [...this.map.values()];
    }
}

function deserializeProfile(document) {
    return {
        ...document,
        badges: Array.isArray(document.badges) ? document.badges : [],
        friends: Array.isArray(document.friends) ? document.friends : [],
        deniedCommands: Array.isArray(document.deniedCommands) ? document.deniedCommands : [],
        allowedCommands: Array.isArray(document.allowedCommands) ? document.allowedCommands : []
    };
}

function stripMongoId(document) {
    const { _id, ...data } = document;
    return data;
}

function matchesFilter(document, filter) {
    return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function clone(value) {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
}

function identity(value) {
    return value;
}

module.exports = new MongoDatabase();
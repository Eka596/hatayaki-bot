// db.js is a module for working with the SQLite database.
// Responsible for table creation, migrations, and all operations
// with files (saveFile) and the channel whitelist (allowed_channels).
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');
const logger = require('./logger');

db.serialize(() => {

// ===========================
// Таблица files и миграции
// ===========================
db.run(`
    CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        original_name TEXT,
        saved_name TEXT,
        path TEXT,
        type TEXT,
        size INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

db.all(`PRAGMA table_info(files)`, (err, rows) => {
    if (err) {
        console.error('[DB] Migration error:', err);
        return;
    }
    const columnNames = rows.map(col => col.name);

    if (!columnNames.includes('channel_id')) {
        db.run(`ALTER TABLE files ADD COLUMN channel_id TEXT`);
        console.log('[DB] Добавлена колонка channel_id');
    }
    if (!columnNames.includes('server_id')) {
        db.run(`ALTER TABLE files ADD COLUMN server_id TEXT`);
        console.log('[DB] Добавлена колонка server_id');
    }
    if (!columnNames.includes('data')) {
        db.run(`ALTER TABLE files ADD COLUMN data BLOB`);
        console.log('[DB] Добавлена колонка data (BLOB)');
    }
});

    // Create a table with a list of channels from which the bot will save attachments
    db.run(`
        CREATE TABLE IF NOT EXISTS allowed_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            added_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_id, channel_id)
        )
    `);

    // Таблица каналов, где Мику разрешено отвечать
    db.run(`
        CREATE TABLE IF NOT EXISTS miku_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            added_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_id, channel_id)
        )
    `);

    // Таблица с гифками для действий Мику
    db.run(`
    CREATE TABLE IF NOT EXISTS miku_gifs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            filename TEXT,
            data BLOB NOT NULL,
            added_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}); 

// ============================
// [FUNC] Inserting files into the database
// Saves information about the downloaded attachment to the database.
// data is an object with the following fields: userId, originalName, savedName, path, type,
// size, channelId, serverId
// Returns a Promise with the ID of the new record.
// The data parameter receives data from [FUNC] processAttachment in index.js
// ===========================
function saveFile(data) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO files (user_id, original_name, saved_name, path, type, size, channel_id, server_id, data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.userId,
                data.originalName,
                data.savedName,
                data.url,            // path хранит ссылку
                data.type,
                data.size,
                data.channelId,
                data.serverId,
                data.buffer          // сам файл (Buffer)
            ],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

// ===========================
// [FUNC] addAllowedChannel
// Adds a channel to the whitelist
// Accepts:
// serverId, channelId, userId
// ==========================
function addAllowedChannel(serverId, channelId, userId) {
    // Use promise to wait for the result
    return new Promise((resolve, reject) => {
        // Add a channel to the database
        db.run(
            `INSERT OR IGNORE INTO allowed_channels (server_id, channel_id, added_by) VALUES (?, ?, ?)`,
            [serverId, channelId, userId],
            function(err) {
                if (err) {
                    logger.error(`addAllowedChannel DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            }
        );
    });
}

// ============================
// [FUNC] removeAllowedChannel
// Removes a channel from the whitelist
// Accepts:
// serverId, channelId
// ===========================
function removeAllowedChannel(serverId, channelId) {
    return new Promise((resolve, reject) => {
        // Delete the channel from the database
        db.run(
            `DELETE FROM allowed_channels WHERE server_id = ? AND channel_id = ?`,
            [serverId, channelId],
            function(err) {
                if (err) {
                    logger.error(`removeAllowedChannel DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            }
        );
    });
}

// ============================
// [FUNC] getAllowedChannels
// Gets all server channels from wl
// Accepts:
// serverId
// ===========================
function getAllowedChannels(serverId) {
    return new Promise((resolve, reject) => {
        // We query the database for channels from the white list for a specific server
        db.all(
            `SELECT channel_id FROM allowed_channels WHERE server_id = ?`,
            [serverId],
            (err, rows) => {
                if (err) {
                    logger.error(`getAllowedChannels DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(rows.map(r => r.channel_id));
                }
            }
        );
    });
}

// ============================
// [FUNC] isChannelAllowed
// Checks whether the channel is allowed to download attachments
// Accepts:
// serverId, channelId
// ===========================
function isChannelAllowed(serverId, channelId) {
    return new Promise((resolve, reject) => {
        // Check the presence of the channel in the database
        db.get(
            `SELECT 1 FROM allowed_channels WHERE server_id = ? AND channel_id = ?`,
            [serverId, channelId],
            (err, row) => {
                if (err) {
                    logger.error(`isChannelAllowed DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(!!row);
                }
            }
        );
    });
}

// Добавить канал в белый список
function addChatChannel(serverId, channelId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR IGNORE INTO miku_channels (server_id, channel_id, added_by) VALUES (?, ?, ?)`,
            [serverId, channelId, userId],
            function(err) {
                if (err) {
                    logger.error(`addChatChannel DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            }
        );
    });
}

// Удалить канал из белого списка
function removeChatChannel(serverId, channelId) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM miku_channels WHERE server_id = ? AND channel_id = ?`,
            [serverId, channelId],
            function(err) {
                if (err) {
                    logger.error(`removeChatChannel DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            }
        );
    });
}

// Получить все каналы бота для сервера
function getChatChannels(serverId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT channel_id FROM miku_channels WHERE server_id = ?`,
            [serverId],
            (err, rows) => {
                if (err) {
                    logger.error(`getChatChannels DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(rows.map(r => r.channel_id));
                }
            }
        );
    });
}

// Проверить, разрешён ли канал для бота на этом сервере
function isChatChannelAllowed(serverId, channelId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 1 FROM miku_channels WHERE server_id = ? AND channel_id = ?`,
            [serverId, channelId],
            (err, row) => {
                if (err) {
                    logger.error(`isChatChannelAllowed DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(!!row);
                }
            }
        );
    });
}

// Получить статистику пользователя (по всем серверам или конкретному)
function getUserStats(userId, serverId = null) {
    return new Promise((resolve, reject) => {
        let query = `SELECT type, COUNT(*) as count, SUM(size) as totalSize 
                     FROM files 
                     WHERE user_id = ? AND data IS NOT NULL`;
        const params = [userId];
        if (serverId) {
            query += ` AND server_id = ?`;
            params.push(serverId);
        }
        query += ` GROUP BY type`;

        db.all(query, params, (err, rows) => {
            if (err) {
                logger.error(`getUserStats DB error: ${err.message}`);
                reject(err);
            } else {
                const stats = { images: 0, gifs: 0, videos: 0, other: 0, totalCount: 0, totalSize: 0 };
                rows.forEach(row => {
                    const type = row.type || 'other';
                    stats[type] = (stats[type] || 0) + row.count;
                    stats.totalCount += row.count;
                    stats.totalSize += row.totalSize;
                });
                resolve(stats);
            }
        });
    });
}

// Получить топ пользователей по количеству файлов на сервере
function getTopUsers(serverId, limit = 5) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT user_id, COUNT(*) as count, SUM(size) as totalSize 
             FROM files 
             WHERE server_id = ? AND data IS NOT NULL 
             GROUP BY user_id 
             ORDER BY count DESC 
             LIMIT ?`,
            [serverId, limit],
            (err, rows) => {
                if (err) {
                    logger.error(`getTopUsers DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Добавить гифку в коллекцию
function addActionGif(action, filename, data, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO miku_gifs (action, filename, data, added_by) VALUES (?, ?, ?, ?)`,
            [action, filename, data, userId],
            function(err) {
                if (err) {
                    logger.error(`addActionGif DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Удалить гифку по ID
function removeActionGif(id) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM miku_gifs WHERE id = ?`,
            [id],
            function(err) {
                if (err) {
                    logger.error(`removeActionGif DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            }
        );
    });
}

// Получить случайную гифку для действия
function getRandomActionGif(action) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id, filename, data FROM miku_gifs WHERE action = ? ORDER BY RANDOM() LIMIT 1`,
            [action],
            (err, row) => {
                if (err) {
                    logger.error(`getRandomActionGif DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(row || null);
                }
            }
        );
    });
}

// Получить список гифок для действия (с ID и именами)
function listActionGif(action) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, filename, added_by, created_at FROM miku_gifs WHERE action = ? ORDER BY id`,
            [action],
            (err, rows) => {
                if (err) {
                    logger.error(`listActionGif DB error: ${err.message}`);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Make functions available to other files
module.exports = {
    saveFile,
    addAllowedChannel,
    removeAllowedChannel,
    getAllowedChannels,
    isChannelAllowed,
    addChatChannel,
    removeChatChannel,
    getChatChannels,
    isChatChannelAllowed,
    getUserStats,
    getTopUsers,
    addActionGif,        
    removeActionGif,
    getRandomActionGif,
    listActionGif
};
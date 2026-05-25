// config.js
require('dotenv').config();

module.exports = {
    prefix: process.env.PREFIX || '!',
    cooldownSeconds: parseInt(process.env.MIKU_COOLDOWN, 10) || 10,
    testServerId: process.env.TEST_SERVER_ID || '',
    ownerId: process.env.OWNER_ID || '',

    // Режим работы ИИ: 'json' или 'ai'
    chatMode: process.env.AI_MODE || 'ai',
    // Адрес локальной LLM
    aiApiUrl: process.env.AI_API_URL || 'http://localhost:1234/v1/chat/completions',
    // Название модели
    aiModel: process.env.AI_MODEL || 'local-model',

    // Проверка, является ли пользователь владельцем бота
    isOwner(userId) {
        return userId === this.ownerId;
    }
};
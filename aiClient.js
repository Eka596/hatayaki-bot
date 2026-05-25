// aiClient.js – отправка запросов к локальному ИИ (LM Studio)
const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

/**
 * Отправляет сообщение модели и получает ответ.
 * @param {Array} messages - массив сообщений [{ role: 'system'|'user'|'assistant', content: '...' }]
 * @returns {Promise<string|null>} текст ответа или null при ошибке
 */
async function chat(messages) {
    try {
        const response = await axios.post(
            config.aiApiUrl,
            {
                model: config.aiModel,
                messages,
                temperature: 0.9,
                max_tokens: 150,
                stop: ['\n', 'User:', 'Мику:']
            },
            { timeout: 30000 }
        );
        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        return reply || null;
    } catch (err) {
        logger.error(`aiClient: ошибка запроса: ${err.message}`);
        return null;
    }
}

module.exports = { chat };
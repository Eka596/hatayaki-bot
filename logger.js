// logger.js — простой модуль логирования.
// В debug-режиме выводит всё в консоль, в production — важное в консоль,
// а информационные сообщения сохраняет в файл logs.txt.

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs.txt');
const IS_DEBUG = process.env.LOG_MODE === 'debug';

// Запись строки в файл (добавляет в конец)
function toFile(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
}

// Основная функция: принимает уровень и текст
function log(level, message) {
    const text = `[${level.toUpperCase()}] ${message}`;

    if (IS_DEBUG) {
        // В дебаге — всё в консоль
        if (level === 'error') {
            console.error(text);
        } else {
            console.log(text);
        }
    } else {
        // В production: ошибки — в консоль, всё остальное — в файл
        if (level === 'error') {
            console.error(text);  // чтобы сразу видеть проблемы
        } else {
            toFile(text);         // история сохраняется
        }
    }
}

// принимает контекст (guildName, channelName) и сообщение
function context(level, guildName, channelName, message) {
    let prefix = '';
    if (guildName) {
        prefix = `[${guildName} / #${channelName || 'DM'}] `;
    }
    log(level, prefix + message);
}

module.exports = {
    info: (msg) => log('info', msg),
    warn: (msg) => log('warn', msg),
    error: (msg) => log('error', msg),
    debug: (msg) => log('debug', msg),
    context: context
};
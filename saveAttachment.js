// saveAttachment.js – загрузка вложения в Buffer, без сохранения на диск
const path = require('path');
const axios = require('axios');
const logger = require('./logger');

/**
 * Скачивает файл по URL и возвращает Buffer.
 * @param {string} url - ссылка на файл
 * @returns {Promise<Buffer>}
 */
async function downloadFile(url) {
    logger.info(`Starting download: ${url}`);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer'   // получаем весь файл в память
    });
    logger.info(`Download complete (${response.data.length} bytes)`);
    return Buffer.from(response.data);
}

/**
 * Определяет тип файла и скачивает его.
 * Возвращает объект с информацией и buffer, без пути на диске.
 */
async function saveAttachment(attachment, userId, channelId, serverId) {
    const ext = path.extname(attachment.name || '').toLowerCase();
    const mime = (attachment.contentType || '').toLowerCase();

    console.log(`Processing the attachment: "${attachment.name}" (${attachment.size} байт)`);
    console.log(`Extension: "${ext}", MIME-type: "${mime}"`);

    // Классификация папки (images, gifs, videos, other)
    const imageTypes = ['.png', '.jpg', '.jpeg', '.webp', 'image/png', 'image/jpeg', 'image/webp'];
    const gifTypes = ['.gif', 'image/gif'];
    const videoTypes = ['.mp4', '.mov', '.webm', 'video/mp4', 'video/webm', 'video/quicktime'];

    let folder = 'other';
    if (imageTypes.includes(ext) || imageTypes.includes(mime)) folder = 'images';
    if (gifTypes.includes(ext) || mime.includes('gif')) folder = 'gifs';
    if (videoTypes.includes(ext) || videoTypes.includes(mime)) folder = 'videos';

    console.log(`Folder type defined: ${folder}`);

    // Генерируем безопасное имя (оставим для идентификации)
    const safeName = `${Date.now()}_${userId}${ext || ''}`;

    // Скачиваем файл в Buffer
    const buffer = await downloadFile(attachment.url);

    return {
        originalName: attachment.name,
        savedName: safeName,
        type: folder,
        size: buffer.length,          // точный размер после загрузки
        url: attachment.url,
        buffer: buffer,
        channelId,
        serverId
    };
}

module.exports = { saveAttachment };
// =========================
// IMPORTS & INITIALIZATION
// =========================

// index.js is the bot's main file.
// Connects to Discord, processes server and private messages,
// saves attachments, and responds to admin commands.
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

const config = require('./config');
const db = require('./db');
const { saveAttachment } = require('./saveAttachment');
const logger = require('./logger');
const chat = require('./chat');
const commands = require('./commands');

const PREFIX = config.prefix;

// =========================
// DISCORD CLIENT SETUP
// =========================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// =========================
// LAUNCHING THE BOT
// =========================

client.once('clientReady', () => {
    logger.info(`Bot launched as ${client.user.tag}`);
});

// =========================
// ATTACHMENT PROCESSING
// =========================

/**
 * [FUNC] processAttachment
 * A general-purpose function for processing a single attachment.
 * Accepts an attachmentData object with the following fields:
 * attachment, userId, channelId, serverId, guildName, channelName
 * Downloads the file and saves the information to the database.
 */
async function processAttachment(attachmentData) {
    const { attachment, userId, channelId, serverId, guildName, channelName } = attachmentData;

    try {
        logger.context('info', guildName, channelName,
            `Downloading: ${attachment.name} (${attachment.size} bytes)`);

        const file = await saveAttachment(attachment, userId, channelId, serverId);

        if (!file || !file.buffer) {
            logger.context('warn', guildName, channelName, 'saveAttachment returned no buffer');
            return;
        }

        await db.saveFile({
            userId: userId,
            originalName: file.originalName,
            savedName: file.savedName,
            path: file.url,      // в path будем хранить ссылку
            type: file.type,
            size: file.size,
            channelId: file.channelId,
            serverId: file.serverId,
            buffer: file.buffer  // <-- сам файл
        });

        logger.context('info', guildName, channelName,
            `Saved to DB: ${file.savedName} (${file.size} bytes)`);
    } catch (err) {
        logger.context('error', guildName, channelName,
            `Critical error: ${err.message}`);
    }
}

// =========================
// SERVER MESSAGE HANDLER
// =========================

client.on('messageCreate', async (message) => {
    /*
    // --- ВРЕМЕННАЯ ДИАГНОСТИКА ДЛЯ ОТЛАДКИ ---
    const TEST_SERVER_ID = '842840911515484181';
    if (message.guild?.id === TEST_SERVER_ID) {
        console.log(`❗❗❗ messageCreate СРАБОТАЛ! Тип: ${message.channel.type}, канал: ${message.channel.id}`);
        if (message.guild) {
            console.log(`   Сервер: ${message.guild.name} (${message.guild.id})`);
        } else {
            console.log(`   Гильдия отсутствует (DM/неизвестно)`);
        }
        console.log(`   Автор: ${message.author.tag}, бот: ${message.author.bot}`);
        console.log(`   Текст: "${message.content.substring(0, 50)}"`);
    }
    // --- КОНЕЦ ДИАГНОСТИКИ ---
    */

    // Basic filters
    if (message.channel.isDMBased()) return;
    if (message.author.bot) return;

    // =========================
    // chat MODE
    // =========================

    const chatReply = await chat.processMessage(
        message,
        (guildId, channelId) => db.isChatChannelAllowed(guildId, channelId)
    );

    if (chatReply) {
        await message.reply(chatReply);
        return; // после ответа Мику ничего не делаем
    }

    // =========================
    // BOT COMMANDS
    // =========================

// Проверяем, начинается ли сообщение с префикса
if (message.content.startsWith(PREFIX)) {
    const isCommand = await commands.handle(message);
    if (isCommand) return; // команда обработана, дальше не идём
    // если команда не распознана, можно просто игнорировать или показать подсказку
}   


    // =========================
    // ATTACHMENT CHECKS
    // =========================

    if (!message.attachments.size) return;

    const allowed = await db.isChannelAllowed(message.guild.id, message.channel.id);
    if (!allowed) {
        logger.context(
            'info',
            message.guild.name,
            message.channel.name,
            `Attachments ignored: channel is not whitelisted (from ${message.author.tag})`
        );
        return;
    }

    logger.context(
        'info',
        message.guild.name,
        message.channel.name,
        `New attachment(s) from ${message.author.tag} (ID: ${message.author.id}), count: ${message.attachments.size}`
    );

    for (const attachment of message.attachments.values()) {
        await processAttachment({
            attachment,
            userId: message.author.id,
            channelId: message.channel.id,
            serverId: message.guild.id,
            guildName: message.guild.name,
            channelName: message.channel.name
        });
    }
});

// =========================
// DM MESSAGE HANDLER
// =========================

client.on('raw', (packet) => {
    if (packet.t !== 'MESSAGE_CREATE') return;
    const data = packet.d;
    if (data.channel_type !== 1) return; // только DM
    if (data.author?.bot) return;
    if (!data.attachments || data.attachments.length === 0) return;

    logger.context(
        'info',
        null,
        'DM',
        `DM attachment(s) from ${data.author.username}#${data.author.discriminator} (ID: ${data.author.id}), count: ${data.attachments.length}`
    );

    for (const att of data.attachments) {
        const attachment = {
            name: att.filename,
            contentType: att.content_type,
            size: att.size,
            url: att.url
        };

        processAttachment({
            attachment,
            userId: data.author.id,
            channelId: data.channel_id,
            serverId: 'DM',
            guildName: null,
            channelName: 'DM'
        });
    }
});

// =========================
// BOT LOGIN
// =========================

client.login(process.env.TOKEN);
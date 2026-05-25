// commands.js — обработка всех команд бота (префикс !)
const db = require('./db');
const chat = require('./chat');
const logger = require('./logger');
const config = require('./config');

async function handle(message) {
    if (!message.guild) return false;

    const args = message.content
        .slice(config.prefix.length)
        .trim()
        .split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (!command) return false;

    const guildName = message.guild.name;
    const channelName = message.channel.name;

    // ---------- КОМАНДЫ, ДОСТУПНЫЕ ВСЕМ ----------

    if (command === 'me') {
        logger.context('info', guildName, channelName, `Command !me by ${message.author.tag}`);
        try {
            const stats = await db.getUserStats(message.author.id);
            const embed = {
                color: 0x86c06c,
                title: `Статистика ${message.author.username}`,
                fields: [
                    { name: '🖼️ Картинки', value: `${stats.images}`, inline: true },
                    { name: '🎞️ Гифки', value: `${stats.gifs}`, inline: true },
                    { name: '🎬 Видео', value: `${stats.videos}`, inline: true },
                    { name: '📁 Другое', value: `${stats.other}`, inline: true },
                    { name: '📦 Всего файлов', value: `${stats.totalCount}`, inline: true },
                    { name: '💾 Общий размер', value: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`, inline: true }
                ]
            };
            await message.reply({ embeds: [embed] });
        } catch (err) {
            logger.error(`!me error: ${err.message}`);
            await message.react('❌');
        }
        return true;
    }

    if (command === 'top') {
        logger.context('info', guildName, channelName, `Command !top by ${message.author.tag}`);
        try {
            const top = await db.getTopUsers(message.guild.id, 5);
            if (top.length === 0) {
                await message.reply('Пока никто ничего не сохранил.');
                return true;
            }

            const embed = {
                color: 0xffaa00,
                title: `Топ-5 участников сервера`,
                description: 'По количеству сохранённых вложений',
                fields: []
            };

            for (let i = 0; i < top.length; i++) {
                const user = await message.client.users.fetch(top[i].user_id).catch(() => null);
                const username = user ? user.username : 'Неизвестный';
                embed.fields.push({
                    name: `${i + 1}. ${username}`,
                    value: `Файлов: ${top[i].count} | Размер: ${(top[i].totalSize / 1024 / 1024).toFixed(2)} MB`,
                    inline: false
                });
            }

            await message.reply({ embeds: [embed] });
        } catch (err) {
            logger.error(`!top error: ${err.message}`);
            await message.react('❌');
        }
        return true;
    }

    // ---------- КОМАНДЫ-ДЕЙСТВИЯ (доступны всем) ----------
    if (command === 'hug' || command === 'pat') {
        const target = message.mentions.users.first();
        const targetName = target ? target.username : 'всех';

        try {
            const gif = await db.getRandomActionGif(command);
            if (!gif) {
                await message.reply('У меня пока нет гифок для этого действия. Попросите владельца добавить их через `!gif add`.');
                return true;
            }

            const botName = message.client.user.username;
            const messages = {
                hug: `*${botName} крепко обнимает ${targetName}*`,
                pat: `*${botName} нежно гладит ${targetName} по голове*`,
            };

            await message.channel.send({
                content: messages[command],
                files: [{ attachment: gif.data, name: gif.filename }]
            });

            logger.context('info', guildName, channelName,
                `${message.author.tag} использовал !${command} ${target ? 'на ' + targetName : ''}`);
        } catch (err) {
            logger.error(`Ошибка отправки гифки: ${err.message}`);
            await message.react('❌');
        }
        return true;
    }

    // ---------- ПРОВЕРКА ПРАВ ----------
    const isOwner = config.isOwner(message.author.id);
    const isAdmin = message.channel.permissionsFor(message.author)?.has('Administrator');
    const hasAccess = isOwner || isAdmin;

    if (!hasAccess) {
        logger.context('warn', guildName, channelName, `${message.author.tag} попытался использовать !${command} без прав`);
        await message.reply('У вас нет прав администратора или владельца для этой команды.');
        return true;
    }

    // ============================
    // КОМАНДЫ ВЛАДЕЛЬЦА (только для создателя бота)
    // ============================
    if (isOwner) {
        if (command === 'reload') {
            logger.context('info', guildName, channelName, `Owner ${message.author.tag} перезагружает модули`);
            try {
                delete require.cache[require.resolve('./db')];
                delete require.cache[require.resolve('./saveAttachment')];
                delete require.cache[require.resolve('./chat')];
                delete require.cache[require.resolve('./commands')];
                delete require.cache[require.resolve('./config')];
                require('./db');
                require('./saveAttachment');
                require('./chat');
                require('./commands');
                await message.react('✅');
                logger.info('Модули перезагружены');
            } catch (err) {
                logger.error(`Ошибка перезагрузки: ${err.message}`);
                await message.react('❌');
            }
            return true;
        }

        if (command === 'debug') {
            const current = process.env.LOG_MODE === 'debug';
            const newMode = current ? 'production' : 'debug';
            process.env.LOG_MODE = newMode;
            logger.info(`Debug режим переключён в ${newMode} владельцем ${message.author.tag}`);
            await message.reply(`🔧 Debug-режим: ${newMode.toUpperCase()}`);
            return true;
        }

        if (command === 'setting') {
            const key = args.shift();
            const value = args.join(' ');
            if (!key || !value) {
                await message.reply('Использование: `!setting <ключ> <значение>`\nДоступные ключи: `prefix`, `cooldownSeconds`, `phrasesPath`');
                return true;
            }
            const allowedKeys = ['prefix', 'cooldownSeconds', 'phrasesPath'];
            if (!allowedKeys.includes(key)) {
                await message.reply(`Нельзя изменить этот параметр. Доступны: ${allowedKeys.join(', ')}`);
                return true;
            }
            config[key] = isNaN(value) ? value : parseInt(value, 10);
            logger.context('info', guildName, channelName, `Owner изменил ${key} на ${value}`);
            await message.react('✅');
            return true;
        }   

        // --- Управление гифками ---
        if (command === 'gif') {
            const sub = args.shift()?.toLowerCase();

            if (sub === 'add') {
                const action = args.shift()?.toLowerCase();
                if (!action) {
                    await message.reply('Укажи действие (hug, pat, sing).');
                    return true;
                }
                if (!message.attachments.size) {
                    await message.reply('Приложи гифку (файл GIF) к сообщению.');
                    return true;
                }
                const attachment = message.attachments.first();

                if (!attachment.contentType || !attachment.contentType.startsWith('image/gif')) {
                    await message.reply('Принимаются только анимированные GIF-файлы. Попробуй снова с гифкой!');
                    return true;
                }

                try {
                    const axios = require('axios');
                    const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(response.data);
                    const id = await db.addActionGif(action, attachment.name, buffer, message.author.id);
                    await message.reply(`Гифка добавлена в коллекцию \`${action}\` (ID: ${id}).`);
                    logger.context('info', guildName, channelName,
                        `Owner добавил гифку в ${action}: ${attachment.name} (ID: ${id})`);
                } catch (err) {
                    logger.error(`Ошибка добавления гифки: ${err.message}`);
                    await message.react('❌');
                }
                return true;
            }

            if (sub === 'remove') {
                const action = args.shift()?.toLowerCase();
                const id = parseInt(args.shift());
                if (!action || isNaN(id)) {
                    await message.reply('Использование: `!gif remove <действие> <ID>` (ID можно узнать через `!gif list`).');
                    return true;
                }
                const removed = await db.removeActionGif(id);
                if (removed) {
                    await message.reply(`Гифка с ID ${id} удалена из \`${action}\`.`);
                } else {
                    await message.reply('Гифка с таким ID не найдена.');
                }
                return true;
            }

            if (sub === 'list') {
                const action = args.shift()?.toLowerCase();
                if (!action) {
                    await message.reply('Укажи действие: `!gif list hug`');
                    return true;
                }
                const gifs = await db.listActionGifs(action);
                if (gifs.length === 0) {
                    await message.reply(`В коллекции \`${action}\` пока нет гифок.`);
                } else {
                    const list = gifs.map(g => `ID:${g.id} – ${g.filename}`).join('\n');
                    await message.reply(`Гифки \`${action}\`:\n${list}`);
                }
                return true;
            }

            await message.reply('Используй: `!gif add <действие>` (прикрепи GIF), `!gif remove <действие> <ID>`, `!gif list <действие>`');
            return true;
        }
    } // ← закрытие блока if (isOwner)

    // ============================
    // АДМИНСКИЕ КОМАНДЫ (доступны при hasAccess)
    // ============================

    if (command === 'watch') {
        const targetChannel = message.mentions.channels.first() || message.channel;
        logger.context('info', guildName, channelName,
            `Command !watch: add channel ${targetChannel.name} by ${message.author.tag}`);
        const added = await db.addAllowedChannel(message.guild.id, targetChannel.id, message.author.id);
        await message.react(added ? '✅' : '❌');
        return true;
    }

    if (command === 'unwatch') {
        const targetChannel = message.mentions.channels.first() || message.channel;
        logger.context('info', guildName, channelName,
            `Command !unwatch: remove channel ${targetChannel.name} by ${message.author.tag}`);
        const removed = await db.removeAllowedChannel(message.guild.id, targetChannel.id);
        await message.react(removed ? '✅' : '❌');
        return true;
    }

    if (command === 'list') {
        logger.context('info', guildName, channelName, `Command !list by ${message.author.tag}`);
        const channels = await db.getAllowedChannels(message.guild.id);
        if (channels.length === 0) {
            await message.reply('Список отслеживаемых каналов пуст.');
        } else {
            const mentions = channels.map(id => `<#${id}>`).join(', ');
            await message.reply(`Отслеживаемые каналы: ${mentions}`);
        }
        return true;
    }

    if (command === 'reloadchat') {
        logger.context('info', guildName, channelName, `!reloadchat by ${message.author.tag}`);
        const success = chat.reloadPhrases();
        await message.react(success ? '✅' : '❌');
        return true;
    }

    if (command === 'chat') {
        const sub = args.shift()?.toLowerCase();
        if (sub === 'watch') {
            const target = message.mentions.channels.first() || message.channel;
            logger.context('info', guildName, channelName, `!chat watch: ${target.name} by ${message.author.tag}`);
            const added = await db.addChatChannel(message.guild.id, target.id, message.author.id);
            await message.reply(added ? `Бот теперь будет отвечать в ${target}.` : `ℹ️ ${target} уже в списке.`);
        } else if (sub === 'unwatch') {
            const target = message.mentions.channels.first() || message.channel;
            logger.context('info', guildName, channelName, `!chat unwatch: ${target.name} by ${message.author.tag}`);
            const removed = await db.removeChatChannel(message.guild.id, target.id);
            await message.reply(removed ? `Бот больше не отвечает в ${target}.` : `⚠️ ${target} не был в списке.`);
        } else if (sub === 'list') {
            const channels = await db.getChatChannels(message.guild.id);
            if (channels.length === 0) {
                await message.reply('Список каналов, где бот отвечает, пуст.');
            } else {
                const mentions = channels.map(id => `<#${id}>`).join(', ');
                await message.reply(`Каналы для ответов: ${mentions}`);
            }
        } else {
            await message.reply('Используй: `!chat watch #канал`, `!chat unwatch #канал`, `!chat list`');
        }
        return true;
    }

    // команда не распознана
    return false;
}

module.exports = { handle };
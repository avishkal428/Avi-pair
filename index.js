const express = require('express');
const app = express();
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express route for pairing
app.get('/pair', async (req, res) => {
    let num = req.query.code;
    if (!num) return res.status(400).json({ error: 'Please enter a valid phone number!' });

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

                const credsFile = `${authPath}/creds.json`;
                if (fs.existsSync(credsFile)) {
                    const credsData = fs.readFileSync(credsFile, 'utf-8');
                    
                    // Session ID format
                    const sessionId = "PRABATH-PAIR;;;" + Buffer.from(credsData).toString('base64');

                    // Send Session ID directly to user's WhatsApp Saved Messages / Self Chat
                    await sock.sendMessage(sock.user.id, { 
                        text: `*WEB-PAIR CONNECTED SUCCESSFULLY!* 🎉\n\n*YOUR SESSION ID:*\n\n${sessionId}\n\n_Do not share this code with anyone!_` 
                    });
                }

                // Cleanup session folder after successful pairing
                await delay(2000);
                await sock.ws.close();
                fs.rmSync(authPath, { recursive: true, force: true });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            }
        });

    } catch (err) {
        console.error("Pairing Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Service Unavailable" });
        }
        fs.rmSync(authPath, { recursive: true, force: true });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

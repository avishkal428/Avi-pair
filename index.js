const express = require('express');
const app = express();
const fs = require('fs-extra');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/pair', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: "Phone number is required. Example: /pair?number=947XXXXXXXX" });
    }

    // Clean phone number format
    num = num.replace(/[^0-9]/g, '');

    const sessionDir = `./temp/${Date.now()}`;

    async function generatePairCode() {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        try {
            const socket = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Safari"), // Standard Browser Config for Pairing
            });

            if (!socket.authState.creds.registered) {
                await delay(1500);
                const code = await socket.requestPairingCode(num);
                
                if (!res.headersSent) {
                    res.send({ code: code });
                }
            }

            socket.ev.on('creds.update', saveCreds);

            socket.ev.on('connection.update', async (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    await delay(5000);
                    // Remove temporary session files after successful pair
                    await fs.remove(sessionDir);
                }
            });

        } catch (err) {
            console.error("Error generating pairing code:", err);
            if (!res.headersSent) {
                res.status(500).send({ error: "Failed to generate pairing code" });
            }
            await fs.remove(sessionDir);
        }
    }

    await generatePairCode();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

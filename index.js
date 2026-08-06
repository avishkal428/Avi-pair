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
        return res.status(400).send({ error: "Phone number is required." });
    }

    num = num.replace(/[^0-9]/g, '');
    const sessionDir = `./temp/${Date.now()}`;

    // සර්වර් එකේ පැරණි Temp Folders ඇත්නම් ඩිලීට් කිරීම
    await fs.emptyDir('./temp').catch(() => {});

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // Chrome Desktop User-Agent එක භාවිතයෙන් WhatsApp Block වීම වැළැක්වීම
            browser: Browsers.macOS("Chrome"),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            fireInitQueries: true
        });

        socket.ev.on('creds.update', saveCreds);

        if (!socket.authState.creds.registered) {
            await delay(2000);
            const code = await socket.requestPairingCode(num);
            if (!res.headersSent) {
                res.send({ code: code });
            }
        }

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log("Successfully Linked!");
                // Link වූ පසු WhatsApp එකෙන් Session ID එක Phone එකට යැවීමට හෝ temporary files අස් කිරීමට මෙතැන භාවිතා කළ හැක
                await delay(10000);
                await fs.remove(sessionDir).catch(() => {});
            }

            if (connection === 'close') {
                await fs.remove(sessionDir).catch(() => {});
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).send({ error: "Pairing process failed" });
        }
        await fs.remove(sessionDir).catch(() => {});
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

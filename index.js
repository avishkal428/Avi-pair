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

// Home Route (UI එක පෙන්වීමට)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Avi Pair Code</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial, sans-serif; text-align: center; background: #121212; color: white; padding: 40px 20px; }
                input { padding: 12px; font-size: 16px; border-radius: 5px; border: 1px solid #333; margin-bottom: 10px; width: 80%; max-width: 300px; }
                button { padding: 12px 25px; font-size: 16px; border-radius: 5px; border: none; background: #25D366; color: white; cursor: pointer; font-weight: bold; }
                #result { margin-top: 20px; font-size: 24px; font-weight: bold; color: #25D366; letter-spacing: 2px; }
            </style>
        </head>
        <body>
            <h2>WhatsApp Pair Code Generator</h2>
            <form action="/pair" method="get">
                <input type="text" name="number" placeholder="947XXXXXXXX" required><br>
                <button type="submit">Get Code</button>
            </form>
        </body>
        </html>
    `);
});

// Pairing Code Generator Endpoint
app.get('/pair', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: "Phone number is required." });
    }

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
                browser: Browsers.macOS("Safari"),
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
                if (connection === 'open' || connection === 'close') {
                    await delay(3000);
                    await fs.remove(sessionDir).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            if (!res.headersSent) {
                res.status(500).send({ error: "Failed to generate pairing code" });
            }
            await fs.remove(sessionDir).catch(() => {});
        }
    }

    await generatePairCode();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const express = require('express');
const app = express();
const fs = require('fs-extra');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// active sockets මතකයේ තබා ගැනීමට global object එකක්
const activeSockets = {};

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

app.get('/pair', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: "Phone number is required." });
    }

    num = num.replace(/[^0-9]/g, '');
    const sessionDir = `./temp/${num}`;

    // පැරණි session එකක් ඇත්නම් clear කිරීම
    if (activeSockets[num]) {
        try {
            activeSockets[num].end();
        } catch (e) {}
        delete activeSockets[num];
    }
    await fs.remove(sessionDir).catch(() => {});

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.ubuntu("Chrome"),
            markOnlineOnConnect: true,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        activeSockets[num] = socket;

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`Successfully linked with ${num}`);
                // Link වූ පසු creds save වී Phone එක Sync වීමට විනාඩියක් දෙන්න
                await delay(60000);
                delete activeSockets[num];
                await fs.remove(sessionDir).catch(() => {});
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    delete activeSockets[num];
                    await fs.remove(sessionDir).catch(() => {});
                }
            }
        });

        // Connection එක setup වීමට තත්පර 3ක් ලබාදී Pair Code එක ගැනීම
        await delay(3000);
        if (!socket.authState.creds.registered) {
            const code = await socket.requestPairingCode(num);
            if (!res.headersSent) {
                res.send({ code: code });
            }
        }

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).send({ error: "Pairing process failed" });
        }
        await fs.remove(sessionDir).catch(() => {});
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

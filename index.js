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
    const sessionDir = `./temp/${Date.now()}`;

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
            syncFullHistory: false
        });

        socket.ev.on('creds.update', saveCreds);

        // Session connection state listener
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`Device linked successfully for ${num}`);
                await delay(20000); // Pair වූ පසු credentials save වීමට තත්පර 20ක් ලබාදෙයි
                await fs.remove(sessionDir).catch(() => {});
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    await fs.remove(sessionDir).catch(() => {});
                }
            }
        });

        // Promise එකක් හරහා socket ready වූ වහාම code එක request කර response යැවීම
        const getPairingCode = () => {
            return new Promise(async (resolve, reject) => {
                let attempts = 0;
                while (attempts < 10) {
                    await delay(1500);
                    if (!socket.authState.creds.registered) {
                        try {
                            const code = await socket.requestPairingCode(num);
                            return resolve(code);
                        } catch (e) {
                            attempts++;
                        }
                    }
                }
                reject("Failed to generate code in time");
            });
        };

        const code = await getPairingCode();
        if (!res.headersSent) {
            res.send({ code: code });
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

const Express = require('express');
const router = Express.Router();
const fs = require('fs-extra');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

router.get('/', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ status: false, message: "Please provide a valid phone number with country code." });
    }

    // Cleaning the phone number (Only keep digits)
    num = num.replace(/[^0-9]/g, '');

    async function AviPairing() {
        // Unique temporary session directory per request to prevent collision
        const sessionPath = `./session_${Date.now()}`;
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        try {
            let AviSession = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                // Using Desktop Safari/Chrome identity to guarantee direct pairing notifications
                browser: Browsers.macOS("Safari")
            });

            if (!AviSession.authState.creds.registered) {
                await delay(2000); // Connection stabilization delay

                // Request Pairing Code from WhatsApp Server
                let code = await AviSession.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code;

                if (!res.headersSent) {
                    res.send({ code: code });
                }
            }

            AviSession.ev.on('creds.update', saveCreds);

            AviSession.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(5000);

                    // Send success message to user's own chat
                    await AviSession.sendMessage(AviSession.user.id, {
                        text: "✅ *Avi-Pair Connected Successfully!*\n\n> Powered by Avishka"
                    });

                    await delay(2000);
                    await AviSession.ws.close();
                    await fs.remove(sessionPath); // Clean up session folder
                }

                if (connection === "close") {
                    let statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) {
                        // Reconnect if not logged out
                        AviPairing();
                    } else {
                        await fs.remove(sessionPath);
                    }
                }
            });

        } catch (err) {
            console.error("Pairing Error:", err);
            if (!res.headersSent) {
                res.status(500).send({ error: "Failed to generate pairing code. Check number format." });
            }
            await fs.remove(sessionPath);
        }
    }

    return await AviPairing();
});

module.exports = router;

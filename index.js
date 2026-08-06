const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Base Route
app.get('/', (req, res) => {
    res.send('WhatsApp Pair Code Server is running!');
});

// Pair Code Generating Route
app.get('/pair', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ error: 'Phone number is required! (e.g. ?number=94712345678)' });
    }

    // Clean phone number (Remove + or spaces)
    num = num.replace(/[^0-9]/g, '');

    // Temp Auth Folder
    const authFolder = path.join(__dirname, 'temp_session', Date.now().toString());

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: Browsers.macOS("Chrome")
        });

        socket.ev.on('creds.update', saveCreds);

        // Wait for connection initialization
        await delay(1500);

        if (!socket.authState.creds.registered) {
            // Request Pairing Code
            let code = await socket.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join("-") || code;

            // Send Response to Client
            res.json({ code: code });
        } else {
            res.status(400).json({ error: 'Number is already registered!' });
        }

        // Auto cleanup temp session folder after 30 seconds
        setTimeout(() => {
            try {
                fs.rmSync(authFolder, { recursive: true, force: true });
            } catch (err) {
                console.error('Error cleaning session folder:', err);
            }
        }, 30000);

    } catch (error) {
        console.error('Error in /pair route:', error);
        res.status(500).json({ error: 'Failed to generate pairing code' });
        
        // Cleanup on error
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }
    }
});

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

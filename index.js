const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTML Web Page Interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Avi Pair Code</title>
            <style>
                body { font-family: Arial, sans-serif; background: #0b141a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #111b21; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); text-align: center; width: 90%; max-width: 380px; }
                h2 { color: #00a884; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; border: 1px solid #2a3942; background: #202c33; color: #fff; box-sizing: border-box; text-align: center; font-size: 16px; }
                button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #00a884; color: #fff; font-size: 16px; font-weight: bold; cursor: pointer; }
                button:hover { background: #008f6f; }
                #result { margin-top: 20px; font-size: 18px; font-weight: bold; word-break: break-all; color: #25d366; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>WhatsApp Pair Code</h2>
                <input type="text" id="number" placeholder="947XXXXXXXX" required>
                <button onclick="getCode()">Get Code</button>
                <div id="result"></div>
            </div>
            <script>
                async function getCode() {
                    const num = document.getElementById('number').value;
                    const resDiv = document.getElementById('result');
                    if (!num) return alert('Enter phone number!');
                    resDiv.style.color = '#ffbc00';
                    resDiv.innerText = 'Generating code...';
                    try {
                        const response = await fetch('/pair?number=' + encodeURIComponent(num));
                        const data = await response.json();
                        if (data.code) {
                            resDiv.style.color = '#25d366';
                            resDiv.innerText = 'PAIR CODE: ' + data.code;
                        } else {
                            resDiv.style.color = '#ff4d4d';
                            resDiv.innerText = data.error || 'Failed!';
                        }
                    } catch (e) {
                        resDiv.style.color = '#ff4d4d';
                        resDiv.innerText = 'Error connecting to server!';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Pairing Code Generator API
app.get('/pair', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    num = num.replace(/[^0-9]/g, '');
    const sessionDir = path.join(__dirname, 'temp_session', `session_${Date.now()}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: Browsers.ubuntu("Chrome")
        });

        sock.ev.on('creds.update', saveCreds);

        await delay(2000);

        if (!sock.authState.creds.registered) {
            let code = await sock.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            res.json({ code: code });
        } else {
            res.status(400).json({ error: 'Already registered number' });
        }

        setTimeout(() => {
            fs.remove(sessionDir).catch(() => {});
        }, 40000);

    } catch (err) {
        console.error('Pair Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
        fs.remove(sessionDir).catch(() => {});
    }
});

// App Crash වීම වැළැක්වීමට
process.on('uncaughtException', (err) => console.error(err));
process.on('unhandledRejection', (err) => console.error(err));

app.listen(PORT, () => console.log(`App live on port ${PORT}`));

const express = require('express');
const app = express();
const path = require('path');
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

// Express HTML Interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AVI Pair Code</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #0b141a; color: #e9edef; margin: 0; }
                .card { background: #111b21; padding: 30px; border-radius: 16px; border: 1px solid #222d34; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; width: 340px; }
                h2 { color: #00a884; margin-bottom: 5px; }
                p { font-size: 13px; color: #8696a0; margin-bottom: 20px; }
                input { width: 90%; padding: 12px; margin-bottom: 15px; border-radius: 8px; border: 1px solid #2a3942; background: #202c33; color: white; font-size: 16px; text-align: center; outline: none; }
                input:focus { border-color: #00a884; }
                button { width: 97%; padding: 12px; border: none; background: #00a884; color: #111b21; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.2s; }
                button:hover { background: #06cf9c; }
                #code { margin-top: 20px; font-size: 24px; font-weight: bold; color: #53bdeb; letter-spacing: 3px; min-height: 30px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>AVI PAIR CODE</h2>
                <p>Enter your phone number with country code<br>Ex: 9477XXXXXXX</p>
                <input type="text" id="number" placeholder="94771234567">
                <button onclick="getCode()">GET CODE</button>
                <div id="code"></div>
            </div>

            <script>
                async function getCode() {
                    const num = document.getElementById('number').value.trim();
                    const codeDiv = document.getElementById('code');
                    if(!num) return alert('Enter phone number!');
                    
                    codeDiv.style.color = '#53bdeb';
                    codeDiv.innerText = 'Connecting...';
                    
                    try {
                        const res = await fetch('/code?number=' + encodeURIComponent(num));
                        const data = await res.json();
                        if(data.code) {
                            codeDiv.innerText = data.code;
                        } else {
                            codeDiv.style.color = '#ea4335';
                            codeDiv.innerText = data.error || 'Failed!';
                        }
                    } catch(e) {
                        codeDiv.style.color = '#ea4335';
                        codeDiv.innerText = 'Server Error!';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Pair Code Endpoint
app.get('/code', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: 'Phone number is required' });
    }

    // Number එකේ තියෙන සංකේත අයින් කිරීම
    num = num.replace(/[^0-9]/g, '');

    if (num.length < 10) {
        return res.status(400).send({ error: 'Invalid phone number format' });
    }

    // Temp Auth Folder
    const sessionDir = path.join(__dirname, './temp_session_' + Date.now());

    try {
        // MultiFileAuthState සෑදීම
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            // Ubuntu/Chrome signature එක යැවීමෙන් WhatsApp block වීම වළකී
            browser: Browsers.ubuntu("Chrome")
        });

        sock.ev.on('creds.update', saveCreds);

        if (!sock.authState.creds.registered) {
            // Socket Handshake එකට තත්පර 3ක delay එකක්
            await delay(3000);
            
            try {
                let code = await sock.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code;

                if (!res.headersSent) {
                    res.send({ code: code });
                }
            } catch (err) {
                console.error("Pairing Error:", err);
                if (!res.headersSent) {
                    res.status(500).send({ error: 'WhatsApp blocked or code request failed' });
                }
            }
        }

        // 2 Minutes පසු Temp Folder එක auto-delete වීම
        setTimeout(async () => {
            try {
                await sock.end();
                await fs.remove(sessionDir);
            } catch (e) {}
        }, 120000);

    } catch (error) {
        console.error("Server Crash:", error);
        if (!res.headersSent) {
            res.status(500).send({ error: 'Internal Server Error' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`AVI Pair Bot running on port ${PORT}`);
});

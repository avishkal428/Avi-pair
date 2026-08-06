const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, requestPairingCode } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const fs = require('fs')
const path = require('path')
const qrcode = require('qrcode-terminal')
const pino = require('pino')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000
const SESSION_FOLDER = './session'

if(!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER)

async function connectToWhatsApp(number) {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER)
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        
        if(connection === 'open') {
            console.log('✅ WhatsApp Connected!')
        }
        
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed. Reason:', lastDisconnect.error)
            if(shouldReconnect) {
                connectToWhatsApp()
            } else {
                // logout උනා නම් session delete කරන්න
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true })
            }
        }
    })

    // Number එක දුන්නොත් pairing code ඉල්ලනවා
    if(number && !sock.authState.creds.registered) {
        await delay(2000)
        const cleanNumber = number.replace(/[^0-9]/g, '')
        const code = await sock.requestPairingCode(cleanNumber)
        console.log(`Pairing Code for ${number}: ${code}`)
        return code
    }

    return sock
}

// Home page
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Pair Site</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { background:#111; color:#fff; font-family:Arial; display:flex; justify-content:center; align-items:center; height:100vh; }
            .box { background:#222; padding:30px; border-radius:12px; text-align:center; width:90%; max-width:400px; }
            input { width:90%; padding:12px; margin:10px 0; border-radius:8px; border:none; outline:none; font-size:16px; }
            button { background:#25D366; color:#fff; border:none; padding:12px 25px; border-radius:8px; font-size:16px; cursor:pointer; }
            button:hover { background:#1ebe5b; }
            .code { font-size:24px; letter-spacing:3px; color:#25D366; margin-top:15px; font-weight:bold; }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>WhatsApp Pairing</h2>
            <p>Number එක +94XXXXXXXXX format එකට දාන්න</p>
            <form method="POST" action="/pair">
                <input type="text" name="number" placeholder="+94XXXXXXXXX" required />
                <br>
                <button type="submit">Get Code</button>
            </form>
        </div>
    </body>
    </html>
    `)
})

// Pair code generate කරන route එක
app.post('/pair', async (req, res) => {
    try {
        let { number } = req.body
        if(!number) return res.send('Number එක දාන්න')
        
        // 94 වලින් පටන් ගන්නෙ නැත්නම් add කරනවා
        if(number.startsWith('0')) number = '94' + number.slice(1)
        if(!number.startsWith('94')) number = '94' + number

        // කලින් session එක තිබ්බොත් delete කරන්න
        fs.rmSync(SESSION_FOLDER, { recursive: true, force: true })
        fs.mkdirSync(SESSION_FOLDER)

        const code = await connectToWhatsApp(number)
        
        res.send(`
        <div style="background:#222; padding:30px; border-radius:12px; text-align:center; color:#fff">
            <h2>Your Pairing Code</h2>
            <div class="code" style="font-size:28px; letter-spacing:5px; color:#25D366">${code.match(/.{1,4}/g).join('-')}</div>
            <p>WhatsApp > Settings > Linked Devices > Link with phone number</p>
            <p style="color:orange">විනාඩි 1ක් ඇතුලත code එක දාන්න</p>
            <a href="/"><button>Back</button></a>
        </div>
        `)

    } catch (e) {
        console.log(e)
        res.send(`Error: ${e.message}. <a href="/">Try Again</a>`)
    }
})

app.listen(PORT, () => console.log(`Pair site running on http://localhost:${PORT}`))

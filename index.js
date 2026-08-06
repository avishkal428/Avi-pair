const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const pino = require('pino')

const app = express()
app.use(express.urlencoded({ extended: true }))
const SESSION = './auth'

async function startSock(num) {
    fs.rmSync(SESSION, { recursive: true, force: true })
    const { state, saveCreds } = await useMultiFileAuthState(SESSION)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'fatal' }),
        browser: ['Chrome', 'Windows', '10.0.0'],
        qrTimeout: 0,
        printQRInTerminal: false
    })

    sock.ev.on('creds.update', saveCreds)

    let code = null
    if(!state.creds.registered && num) {
        await delay(3000)
        num = num.replace(/[^0-9]/g, '')
        if(num.startsWith('0')) num = '94' + num.slice(1)
        try {
            code = await sock.requestPairingCode(num)
        } catch {
            // දෙපාරක් try කරනවා
            await delay(5000)
            code = await sock.requestPairingCode(num)
        }
    }
    return { sock, code }
}

app.get('/', (req, res) => {
    res.send(`<form method="POST" action="/pair" style="background:#000;color:#fff;padding:40px;text-align:center">
    <h2>WhatsApp Pair</h2>
    <input name="number" placeholder="+947XXXXXXXX" style="padding:10px;width:80%">
    <br><br><button style="padding:10px 20px;background:#25D366;border:none;color:#fff">Get Code</button></form>`)
})

app.post('/pair', async (req, res) => {
    let num = req.body.number
    if(!num) return res.send('Number එක දාන්න')
    
    const { code } = await startSock(num)
    
    if(!code) return res.send('Code ගන්න බැරි උනා. විනාඩි 5කින් ආපහු try කරන්න')
    
    res.send(`<div style="text-align:center;color:#fff;background:#111;padding:40px">
    <h2>Your Code</h2>
    <h1 style="color:#25D366;letter-spacing:4px">${code}</h1>
    <p>WhatsApp > Settings > Linked Devices > Link with phone number</p>
    <p style="color:red">60 තත්පරයි තියෙන්නේ</p>
    </div>`)
})

app.listen(3000, () => console.log('Running on 3000'))

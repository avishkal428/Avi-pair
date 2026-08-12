const { default: makeWASocket, useMultiFileAuthState, disconnectReason, delay } = require('@whiskeysockets/baileys');
const { Storage } = require('megajs');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

// Random Session ID එකක් සාදා ගැනීමේ function එක
function generateSessionId(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function startSession() {
    const sessionDir = './session';
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const client = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Terminal එකේ QR code එක පෙන්වීමට
        logger: pino({ level: 'silent' })
    });

    client.ev.on('creds.update', saveCreds);

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('✅ Device successfully linked!');
            await delay(3000); // Session files සූදානම් වන තෙක් තත්පර 3ක් රැඳී සිටීම

            try {
                // 1. MEGA Account එකට Login වීම
                const storage = await new Storage({
                    email: "newmage871@gmail.com",
                    password: "avishkal@23"
                }).ready;

                // 2. creds.json ෆයිල් එක කියවීම
                const credsPath = path.join(sessionDir, 'creds.json');
                const credsData = await fs.readFile(credsPath);

                // 3. Random Session ID නමක් සෑදීම
                const randomId = generateSessionId();
                const fileName = `Session_${randomId}.json`;

                // 4. MEGA එකට Upload කිරීම
                const uploadedFile = await storage.upload({
                    name: fileName,
                    data: credsData
                }).complete;

                // 5. Upload වූ ෆයිල් එකේ Link එක ලබා ගැනීම
                const megaUrl = await uploadedFile.link();

                // 6. Session ID format එක සැකසීම
                const sessionId = `BOT_PREFIX~${megaUrl}`;

                // 7. තමන්ගේම WhatsApp Inbox (Self) එකට Message එක යැවීම
                const userJid = client.user.id.split(':')[0] + '@s.whatsapp.net';
                
                await client.sendMessage(userJid, { 
                    text: `*✅ SESSION ID GENERATED SUCCESSFULLY!*\n\n\`\`\`${sessionId}\`\`\`\n\n_Do not share this Session ID with anyone!_` 
                });

                console.log('📩 Session ID sent to your inbox!');

                // 8. Session Folder එක Clean කිරීම
                await fs.remove(sessionDir);
                process.exit(0);

            } catch (error) {
                console.error('❌ Error during MEGA upload or sending message:', error);
            }
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) {
                startSession();
            }
        }
    });
}

startSession();

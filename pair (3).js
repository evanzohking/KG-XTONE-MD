const { 
    malvinId,
    removeFile
} = require('../lib'); 

const express = require('express');
const fs = require('fs'); 
const axios = require('axios');
require('dotenv').config();
const path = require('path');
let router = express.Router();
const pino = require("pino");

const SESSIONS_API_URL = process.env.SESSIONS_API_URL;
const SESSIONS_API_KEY = process.env.SESSIONS_API_KEY;

const {
    default: Malvin_Tech,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

async function uploadCreds(id) {
    try {
        const authPath = path.join(__dirname, 'temp', id, 'creds.json');
        
        if (!fs.existsSync(authPath)) {
            console.error('Creds file not found at:', authPath);
            return null;
        }

        const credsData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        const credsId = malvinId();
        
        const response = await axios.post(
            `${SESSIONS_API_URL}/api/uploadCreds.php`,
            { credsId, credsData },
            {
                headers: {
                    'x-api-key': SESSIONS_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );
        return credsId;
    } catch (error) {
        console.error('Error uploading credentials:', error.response?.data || error.message);
        return null;
    }
}

router.get('/', async (req, res) => {
    const id = malvinId(); 
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: "Phone number is required" });
    }

    async function MALVIN_PAIR_CODE() {
        const authDir = path.join(__dirname, 'temp', id);
        
        try {
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            let Malvin = Malvin_Tech({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari")
            });

            if (!Malvin.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await Malvin.requestPairingCode(num);
                console.log(`Your Code: ${code}`);

                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            Malvin.ev.on('creds.update', saveCreds);
            
            Malvin.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(5000);
                    
                    try {
                        const sessionId = await uploadCreds(id);
                        if (!sessionId) {
                            throw new Error('Failed to upload credentials');
                        }

                        const session = await Malvin.sendMessage(Malvin.user.id, { text: sessionId });

                        const MALVIN_TEXT = `
*✅sᴇssɪᴏɴ ɪᴅ ɢᴇɴᴇʀᴀᴛᴇᴅ✅*
______________________________
╭┉┉◇
║『 𝐘𝐎𝐔'𝐕𝐄 𝐂𝐇𝐎𝐒𝐄𝐍 KG-XTONE-MD 』
╰┅┅◇
╭───◇
╞ 『••• 𝗩𝗶𝘀𝗶𝘁 𝗙𝗼𝗿 𝗛𝗲𝗹𝗽 •••』
╞〠 𝐓𝐮𝐭𝐨𝐫𝐢𝐚𝐥: _https://whatsapp.com/channel/0029VbB6eyM7YSd78z6rDa3X_
╞⭖ 𝐎𝐰𝐧𝐞𝐫: _https://wa.me/254791002497_
╞⟴ 𝐑𝐞𝐩𝐨: _https://github.com/evanzohkin/KG-XTONE-MD_
╞⭖ 𝐕𝐚𝐥𝐢𝐝𝐚𝐭𝐨𝐫: _https://pairing.giftedtech.web.id/validate_
╞〠 𝐖𝐚𝐂𝐡𝐚𝐧𝐧𝐞𝐥: _https://whatsapp.com/channel/0029VbB6eyM7YSd78z6rDa3X_
║ 💜💜💜
╰┈┈┈┈┈◇ 
 KG-XTONE-MD
______________________________

Use the Quoted Session ID to Deploy your Bot.
Validate it First Using the Validator Link.`;

                        await Malvin.sendMessage(Malvin.user.id, { text: MALVIN_TEXT }, { quoted: session });
                    } catch (err) {
                        console.error('Error in connection update:', err);
                    } finally {
                        await delay(100);
                        await Malvin.ws.close();
                        removeFile(authDir).catch(err => console.error('Error removing temp files:', err));
                    }
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    MALVIN_PAIR_CODE().catch(err => console.error('Error restarting pairing:', err));
                }
            });
        } catch (err) {
            console.error("Service Error:", err);
            removeFile(authDir).catch(err => console.error('Error cleaning up:', err));

            if (!res.headersSent) {
                res.status(500).send({ error: "Service is Currently Unavailable" });
            }
        }
    }

    await MALVIN_PAIR_CODE();
});

module.exports = router;

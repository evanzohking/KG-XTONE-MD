/**
 * KG-XTONE-MD - A WhatsApp Remasterd Bot
 * Copyright (c) 2025 KGEvans
 * 
 * This program is not free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */

require('./settings')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const axios = require('axios')
const PhoneNumber = require('awesome-phonenumber')
const readline = require('readline')
const pino = require('pino')
const NodeCache = require("node-cache")
const { join } = require('path')

const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    jidDecode,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")

const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');

const store = require('@whiskeysockets/baileys').makeInMemoryStore({
    logger: pino().child({
        level: 'silent',
        stream: 'store'
    })
})

let phoneNumber = "254791002497"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "KG-XTONE-MD"
global.themeemoji = "💙"

const settings = require('./settings')
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

// ==== Express server for Pairing Code API ====
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

let globalSocketInstance; // Will hold your Baileys socket

// Pairing code endpoint
app.get('/code', async (req, res) => {
    const number = (req.query.number || '').replace(/[^0-9]/g, '');
    if (!number) return res.json({ code: 'Invalid number' });

    try {
        if (!globalSocketInstance) return res.json({ code: 'Service Initializing' });
        const code = await globalSocketInstance.requestPairingCode(number);
        if (!code) return res.json({ code: 'Service Unavailable' });
        // Format: groups of 4 digits separated by dashes, as WhatsApp expects
        const formatted = code.match(/.{1,4}/g)?.join('-') || code;
        res.json({ code: formatted });
    } catch (e) {
        res.json({ code: 'Service Unavailable' });
    }
});

app.listen(PORT, () => {
    console.log(`Pair Code API listening on port ${PORT}`);
});


// ==== MAIN BOT LOGIC ====
async function startXeonBotInc() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
    const msgRetryCounterCache = new NodeCache()
    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !pairingCode,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || ""
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
    })

    // Make the socket globally accessible for the /code endpoint
    globalSocketInstance = XeonBotInc;

    store.bind(XeonBotInc.ev)

    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, { 
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363302503344706@newsletter',
                                newsletterName: 'KG-XTONE-MD',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact 
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => require('./lib/myfunc').smsg(XeonBotInc, m, store)

    // Handle pairing code for CLI usage (not needed if you're using only the API)
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFor example: +254791002497 : `)))
        }

        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        setTimeout(async () => {
            let code = await XeonBotInc.requestPairingCode(phoneNumber)
            code = code?.match(/.{1,4}/g)?.join("-") || code
            console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
        }, 3000)
    }

    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
            await XeonBotInc.sendMessage(botNumber, { 
                text: `🤖 KG-XTONE-MD Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!
                \n Give a Star ⭐ to our bot:\n https://github.com/evanzoking/KG-XTONE-MD\n ✅Make sure to join below channel`,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363302503344706@newsletter',
                        newsletterName: 'KG-XTONE-MD',
                        serverMessageId: -1
                    }
                }
            });

            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KING-SANDESH-MD'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: Evans Omoit`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} TIK TOK: @KGEvans`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: KGEvans`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 KG-XTONE-MD Connected Successfully! ✅`))
        }
        if (
            connection === "close" &&
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode != 401
        ) {
            startXeonBotInc()
        }
    })

    XeonBotInc.ev.on('creds.update', saveCreds)
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
}

// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

// Error handling for process
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
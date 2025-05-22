async function githubCommand(sock, chatId) {
    const repoInfo = `*🤖 KG-XTONE-MD*

*📂 GitHub Repository:*
https://github.com/evanzohking/KG-XTONE-MD

*📢 Official Tiktok Page:*
https://tiktok.com/KGEvans

_Star ⭐ the repository if you like the bot!_`;

    try {
        await sock.sendMessage(chatId, {
            text: repoInfo,
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
    } catch (error) {
        console.error('Error in github command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error fetching repository information.' 
        });
    }
}

module.exports = githubCommand; 

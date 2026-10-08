const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags
} = require('discord.js');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const {
    discordJsonRequest,
    discordMultipartRequest
} = require('../../utils/discordNative');

module.exports = {
    name: 'backup',
    description: 'Create a backup of the bot source code',
    category: 'Owner',
    owner: true,


    async execute(message, args, client) {
        if (!client.owners.includes(message.author.id)) return;

        const loadingPayload = {
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${client.emoji.load} Creating backup, please wait...**`)
                )
            ],
            flags: MessageFlags.IsComponentsV2
        };
        let loading;
        let backupFile;

        try {
            loading = await sendNativeMessage(client.token, message.channel.id, loadingPayload, message.id);
            backupFile = await createBackup();

            const dmChannel = await discordJsonRequest({
                token: client.token,
                requestPath: '/api/v10/users/@me/channels',
                method: 'POST',
                body: { recipient_id: message.author.id }
            });
            const prevMsgs = await discordJsonRequest({
                token: client.token,
                requestPath: `/api/v10/channels/${dmChannel.id}/messages?limit=20`
            });

            for (const messageData of Array.isArray(prevMsgs) ? prevMsgs : []) {
                const isBotBackup = messageData.author?.id === client.user.id
                    && (
                        messageData.attachments?.some(attachment =>
                            attachment.filename?.includes('backup')
                        )
                        || messageData.content?.includes('Backup successful')
                    );
                if (isBotBackup) {
                    await discordJsonRequest({
                        token: client.token,
                        requestPath: `/api/v10/channels/${dmChannel.id}/messages/${messageData.id}`,
                        method: 'DELETE'
                    });
                }
            }

            const dmMsg = await discordMultipartRequest({
                token: client.token,
                requestPath: `/api/v10/channels/${dmChannel.id}/messages`,
                payload: {
                    content: `<t:${Math.floor(Date.now() / 1000)}:F> !`
                },
                files: [{
                    name: 'groove_backup.zip',
                    contentType: 'application/zip',
                    data: fs.readFileSync(backupFile)
                }]
            });

            const deleteUploadedBackup = setTimeout(() => {
                discordJsonRequest({
                    token: client.token,
                    requestPath: `/api/v10/channels/${dmChannel.id}/messages/${dmMsg.id}`,
                    method: 'DELETE'
                }).catch(() => null);
            }, 300000);
            deleteUploadedBackup.unref?.();

            return editNativeMessage(client.token, message.channel.id, loading.id, {
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**${client.emoji.check} Backup has been sent to your DMs.**`)
                    )
                ],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('[Backup] Discord request failed:', error);
            if (!loading) return;

            return editNativeMessage(client.token, message.channel.id, loading.id, {
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`**${client.emoji.cross} Failed to create backup: ${error.message}**`)
                    )
                ],
                flags: MessageFlags.IsComponentsV2
            }).catch(editError => console.error('[Backup] Failed to update status:', editError));
        } finally {
            if (backupFile && fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
        }
    }
};

async function sendNativeMessage(token, channelId, payload, referenceMessageId) {
    return discordJsonRequest({
        token,
        requestPath: `/api/v10/channels/${channelId}/messages`,
        method: 'POST',
        body: {
            ...serializePayload(payload),
            ...(referenceMessageId
                ? {
                    message_reference: {
                        message_id: referenceMessageId,
                        fail_if_not_exists: false
                    }
                }
                : {})
        }
    });
}

async function editNativeMessage(token, channelId, messageId, payload) {
    return discordJsonRequest({
        token,
        requestPath: `/api/v10/channels/${channelId}/messages/${messageId}`,
        method: 'PATCH',
        body: serializePayload(payload)
    });
}

function serializePayload(payload) {
    return {
        ...payload,
        components: (payload.components || []).map(component =>
            typeof component?.toJSON === 'function' ? component.toJSON() : component
        )
    };
}

async function createBackup() {
    const rootDir = path.resolve(__dirname, '../../../');
    const backupPath = path.join(rootDir, `groove_backup.zip`);

    fs.readdirSync(rootDir).forEach(file => {
        if ((file.startsWith('backup_') && file.endsWith('.zip')) || file === 'groove_backup.zip') {
            fs.unlinkSync(path.join(rootDir, file));
        }
    });

    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('close', () => resolve(backupPath));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);

        archive.directory(path.join(rootDir, 'src/'), 'src');
        archive.file(path.join(rootDir, '.env'), { name: '.env' });
        archive.file(path.join(rootDir, 'database.db'), { name: 'database.db' });
        archive.file(path.join(rootDir, 'index.js'), { name: 'index.js' });
        archive.file(path.join(rootDir, 'config.eps'), { name: 'config.eps' });
        archive.file(path.join(rootDir, 'package.json'), { name: 'package.json' });
        archive.file(path.join(rootDir, 'Shard.js'), { name: 'Shard.js' });
        archive.file(path.join(rootDir, 'database.db-shm'), { name: 'database.db-shm' });
        archive.file(path.join(rootDir, 'database.db-wal'), { name: 'database.db-wal' });

        archive.finalize();
    });
}

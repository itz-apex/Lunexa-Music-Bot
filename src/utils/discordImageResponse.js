const https = require('https');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');
const emoji = require('../emojis');

const TRANSIENT_DISCORD_ERRORS = new Set([
    'UND_ERR_SOCKET',
    'UND_ERR_ABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE'
]);

async function sendLoadingResponse(message, payload, label = 'Image') {
    const interaction = message.__imageInteraction;
    const client = message.client || interaction?.client;

    if (interaction) {
        if (!interaction.deferred && !interaction.replied && client?.token && interaction.id && interaction.token) {
            try {
                const response = await sendWithRetry(
                    () => nativeDiscordJsonRequest({
                        token: client.token,
                        requestPath: `/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
                        method: 'POST',
                        body: {
                            type: 4,
                            data: serializePayload(payload)
                        }
                    }),
                    `${label} loading`
                );
                return { type: 'interaction', interaction, native: true, response };
            } catch (error) {
                console.warn(`[${label}] Native interaction loading failed (${formatError(error)}); trying Discord.js.`);
            }
        }

        try {
            if (interaction.deferred) {
                await interaction.editReply(payload);
            } else if (interaction.replied) {
                await interaction.followUp(payload);
            } else {
                await interaction.reply(payload);
            }
            return { type: 'interaction', interaction, native: false };
        } catch (error) {
            throw new Error(`${label} loading response failed: ${formatError(error)}`);
        }
    }

    if (message.channel?.id && client?.token) {
        try {
            const nativePayload = { ...payload };
            if (message.id) {
                nativePayload.message_reference = {
                    message_id: message.id,
                    fail_if_not_exists: false
                };
            }
            const response = await sendWithRetry(
                () => nativeDiscordJsonRequest({
                    token: client.token,
                    requestPath: `/api/v10/channels/${message.channel.id}/messages`,
                    method: 'POST',
                    body: serializePayload(nativePayload)
                }),
                `${label} loading`
            );
            return {
                type: 'message',
                client,
                channelId: message.channel.id,
                messageId: response?.id,
                response
            };
        } catch (error) {
            console.warn(`[${label}] Native loading failed (${formatError(error)}); trying Discord.js.`);
        }
    }

    if (typeof message.reply === 'function') {
        const response = await sendWithRetry(() => message.reply(payload), `${label} loading`);
        return {
            type: 'message',
            client,
            channelId: message.channel?.id,
            messageId: response?.id,
            message: response
        };
    }

    if (message.channel?.send) {
        const response = await sendWithRetry(() => message.channel.send(payload), `${label} loading`);
        return {
            type: 'message',
            client,
            channelId: message.channel?.id,
            messageId: response?.id,
            message: response
        };
    }

    throw new Error('No message delivery method is available');
}

async function updateImageResponse(message, loadingResponse, payload, label = 'Image') {
    if (!loadingResponse) {
        return sendImageResponse(message, payload, label);
    }

    if (loadingResponse.type === 'interaction') {
        const interaction = loadingResponse.interaction;
        const client = interaction.client || message.client;
        if (client?.token && interaction.applicationId && interaction.token) {
            try {
                return await sendNativeImageUpload(
                    client,
                    `/api/v10/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
                    'PATCH',
                    payload,
                    `${label} image`
                );
            } catch (error) {
                console.warn(`[${label}] Native interaction image update failed (${formatError(error)}); trying Discord.js.`);
            }
        }

        if (interaction.deferred || interaction.replied || loadingResponse.native) {
            return sendWithRetry(() => interaction.editReply(payload), `${label} image`);
        }
        return sendWithRetry(() => interaction.reply(payload), `${label} image`);
    }

    if (loadingResponse.messageId && loadingResponse.channelId && loadingResponse.client?.token) {
        try {
            return await sendNativeImageUpload(
                loadingResponse.client,
                `/api/v10/channels/${loadingResponse.channelId}/messages/${loadingResponse.messageId}`,
                'PATCH',
                payload,
                `${label} image`
            );
        } catch (error) {
            console.warn(`[${label}] Native message image update failed (${formatError(error)}); trying Discord.js.`);
        }
    }

    if (loadingResponse.message?.edit) {
        return sendWithRetry(() => loadingResponse.message.edit(payload), `${label} image`);
    }

    return sendImageResponse(message, payload, label);
}

async function sendImageResponse(message, payload, label = 'Image') {
    const client = message.client || message.__imageInteraction?.client;
    const interaction = message.__imageInteraction;

    if (interaction && client?.token && interaction.applicationId && interaction.token) {
        try {
            return await sendNativeImageUpload(
                client,
                `/api/v10/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
                'PATCH',
                payload,
                `${label} image`
            );
        } catch (error) {
            console.warn(`[${label}] Native interaction image upload failed (${formatError(error)}); trying Discord.js.`);
        }
    }

    if (message.channel?.id && client?.token) {
        try {
            return await sendNativeImageUpload(
                client,
                `/api/v10/channels/${message.channel.id}/messages`,
                'POST',
                payload,
                `${label} image`
            );
        } catch (error) {
            console.warn(`[${label}] Native channel image upload failed (${formatError(error)}); trying Discord.js.`);
        }
    }

    if (message.channel?.send) {
        try {
            return await sendWithRetry(() => message.channel.send(payload), `${label} image`);
        } catch (error) {
            console.warn(`[${label}] Channel image upload failed (${formatError(error)}); trying reply fallback.`);
        }
    }

    if (typeof message.reply === 'function') {
        return sendWithRetry(() => message.reply(payload), `${label} image`);
    }

    throw new Error('No message delivery method is available');
}

async function sendNativeImageUpload(client, requestPath, method, payload, label) {
    const body = createMultipartBody(payload);
    return sendWithRetry(
        () => nativeDiscordRequest({
            token: client.token,
            requestPath,
            method,
            body,
            boundary: body.boundary
        }),
        label
    );
}

function createMultipartBody(payload) {
    const boundary = `----GrooveImage${Date.now().toString(36)}`;
    const files = (payload.files || []).map((file, index) => {
        const attachment = file.attachment;
        if (!Buffer.isBuffer(attachment)) {
            throw new TypeError('Image attachment must be an in-memory Buffer');
        }
        return {
            id: String(index),
            filename: file.name || `image-${index}.png`,
            description: file.description,
            data: attachment
        };
    });

    const jsonPayload = serializePayload(payload);
    jsonPayload.attachments = files.map(({ id, filename, description }) => ({
        id,
        filename,
        ...(description ? { description } : {})
    }));

    const parts = [
        Buffer.from(
            `--${boundary}\r\n`
            + 'Content-Disposition: form-data; name="payload_json"\r\n'
            + 'Content-Type: application/json\r\n\r\n'
            + `${JSON.stringify(jsonPayload)}\r\n`
        )
    ];

    for (const file of files) {
        parts.push(Buffer.from(
            `--${boundary}\r\n`
            + `Content-Disposition: form-data; name="files[${file.id}]"; filename="${file.filename}"\r\n`
            + 'Content-Type: image/png\r\n\r\n'
        ));
        parts.push(file.data);
        parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return {
        boundary,
        data: Buffer.concat(parts)
    };
}

function serializePayload(payload) {
    const components = (payload.components || []).map(component =>
        typeof component?.toJSON === 'function' ? component.toJSON() : component
    );
    const result = { ...payload, components };
    delete result.files;
    return result;
}

function nativeDiscordJsonRequest({ token, requestPath, method, body }) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(body));
        const request = https.request({
            hostname: 'discord.com',
            port: 443,
            path: requestPath,
            method,
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                'User-Agent': 'DiscordBot (https://discord.com, 14.22.1)'
            },
            agent: false,
            timeout: 60_000
        }, response => {
            readResponse(response, resolve, reject);
        });

        request.once('timeout', () => request.destroy(new Error('Native Discord request timed out')));
        request.once('error', reject);
        request.end(data);
    });
}

function nativeDiscordRequest({ token, requestPath, method, body, boundary }) {
    return new Promise((resolve, reject) => {
        const request = https.request({
            hostname: 'discord.com',
            port: 443,
            path: requestPath,
            method,
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.data.length,
                'User-Agent': 'DiscordBot (https://discord.com, 14.22.1)'
            },
            agent: false,
            timeout: 60_000
        }, response => {
            readResponse(response, resolve, reject);
        });

        request.once('timeout', () => request.destroy(new Error('Native Discord request timed out')));
        request.once('error', reject);
        request.end(body.data);
    });
}

function readResponse(response, resolve, reject) {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
                resolve(responseBody ? JSON.parse(responseBody) : null);
            } catch {
                resolve(responseBody);
            }
            return;
        }

        const error = new Error(`Discord API returned HTTP ${response.statusCode}: ${responseBody.slice(0, 500)}`);
        error.status = response.statusCode;
        reject(error);
    });
}

async function sendWithRetry(send, label) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            return await send();
        } catch (error) {
            lastError = error;
            if (!isTransientDiscordError(error) || attempt === 3) throw error;
            console.warn(`[ImageResponse] ${label} attempt ${attempt} failed (${formatError(error)}); retrying.`);
            await wait(attempt * 750);
        }
    }
    throw lastError;
}

function isTransientDiscordError(error) {
    const code = error?.code || error?.cause?.code;
    if (code && TRANSIENT_DISCORD_ERRORS.has(code)) return true;
    const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
    return message.includes('other side closed')
        || message.includes('socket')
        || message.includes('fetch failed')
        || message.includes('aborted');
}

function formatError(error) {
    if (!error) return 'unknown error';
    const cause = error.cause;
    const code = error.code || cause?.code;
    return `${error.name || 'Error'}${code ? ` [${code}]` : ''}: ${error.message || String(error)}`;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createLoadingPayload(title, detail) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${emoji.load} Loading`)
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    createLoadingPayload,
    sendLoadingResponse,
    updateImageResponse,
    sendImageResponse
};
const https = require('https');

const TRANSIENT_ERRORS = new Set([
    'UND_ERR_SOCKET',
    'UND_ERR_ABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE'
]);

async function discordJsonRequest({ token, requestPath, method = 'GET', body }) {
    return discordRequest({
        token,
        requestPath,
        method,
        body: body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
        contentType: body === undefined ? undefined : 'application/json'
    });
}

async function discordMultipartRequest({ token, requestPath, method = 'POST', payload = {}, files = [] }) {
    const body = createMultipartBody(payload, files);
    return discordRequest({
        token,
        requestPath,
        method,
        body: body.data,
        contentType: `multipart/form-data; boundary=${body.boundary}`
    });
}

async function discordRequest({ token, requestPath, method, body, contentType }) {
    return withRetry(
        () => nativeRequest({ token, requestPath, method, body, contentType }),
        `${method} ${requestPath}`
    );
}

function nativeRequest({ token, requestPath, method, body, contentType }) {
    return new Promise((resolve, reject) => {
        const data = body || Buffer.alloc(0);
        const headers = {
            Authorization: `Bot ${token}`,
            'User-Agent': 'DiscordBot (https://discord.com, 14.22.1)',
            'Content-Length': data.length
        };
        if (contentType) headers['Content-Type'] = contentType;

        const request = https.request({
            hostname: 'discord.com',
            port: 443,
            path: requestPath,
            method,
            headers,
            agent: false,
            timeout: 60_000
        }, response => {
            readResponse(response, resolve, reject);
        });

        request.once('timeout', () => {
            request.destroy(new Error('Native Discord request timed out'));
        });
        request.once('error', reject);
        request.end(data);
    });
}

function readResponse(response, resolve, reject) {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
            if (!responseBody) {
                resolve(null);
                return;
            }

            try {
                resolve(JSON.parse(responseBody));
            } catch {
                resolve(responseBody);
            }
            return;
        }

        const error = new Error(
            `Discord API returned HTTP ${response.statusCode}: ${responseBody.slice(0, 500)}`
        );
        error.status = response.statusCode;
        try {
            const parsed = JSON.parse(responseBody);
            if (parsed.retry_after !== undefined) error.retryAfter = Number(parsed.retry_after);
        } catch {
            // Keep the original HTTP error when Discord does not return JSON.
        }
        reject(error);
    });
}

function createMultipartBody(payload, files) {
    const boundary = `----GrooveBackup${Date.now().toString(36)}`;
    const normalizedFiles = files.map((file, index) => ({
        id: String(index),
        filename: sanitizeFilename(file.name || `file-${index}`),
        contentType: file.contentType || 'application/octet-stream',
        data: file.data
    }));

    for (const file of normalizedFiles) {
        if (!Buffer.isBuffer(file.data)) {
            throw new TypeError('Discord multipart attachments must be Buffers');
        }
    }

    const jsonPayload = {
        ...payload,
        attachments: normalizedFiles.map(({ id, filename }) => ({
            id,
            filename
        }))
    };
    const parts = [
        Buffer.from(
            `--${boundary}\r\n`
            + 'Content-Disposition: form-data; name="payload_json"\r\n'
            + 'Content-Type: application/json\r\n\r\n'
            + `${JSON.stringify(jsonPayload)}\r\n`
        )
    ];

    for (const file of normalizedFiles) {
        parts.push(Buffer.from(
            `--${boundary}\r\n`
            + `Content-Disposition: form-data; name="files[${file.id}]"; filename="${file.filename}"\r\n`
            + `Content-Type: ${file.contentType}\r\n\r\n`
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

function sanitizeFilename(filename) {
    return String(filename).replace(/["\r\n\\]/g, '_');
}

async function withRetry(request, label) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            return await request();
        } catch (error) {
            lastError = error;
            if (!isRetryable(error) || attempt === 3) throw error;

            const retryAfter = Number.isFinite(error.retryAfter)
                ? Math.max(250, Math.ceil(error.retryAfter * 1000))
                : attempt * 750;
            console.warn(
                `[DiscordNative] ${label} attempt ${attempt} failed (${formatError(error)}); retrying.`
            );
            await wait(retryAfter);
        }
    }
    throw lastError;
}

function isRetryable(error) {
    if (error?.status === 429) return true;
    const code = error?.code || error?.cause?.code;
    if (code && TRANSIENT_ERRORS.has(code)) return true;
    const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
    return message.includes('other side closed')
        || message.includes('socket')
        || message.includes('fetch failed')
        || message.includes('aborted')
        || message.includes('timed out');
}

function formatError(error) {
    const code = error?.code || error?.cause?.code;
    return `${error?.name || 'Error'}${code ? ` [${code}]` : ''}: ${error?.message || String(error)}`;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    discordJsonRequest,
    discordMultipartRequest
};
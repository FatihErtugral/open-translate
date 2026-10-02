import * as http2 from 'node:http2';

export interface HttpResponse {
    status: number;
    body: string;
}

/**
 * GET `url` over HTTP/2 on a fresh connection and resolve with the status and
 * UTF-8 body (any status; callers decide what counts as success).
 *
 * Deliberately not `fetch` / `https`: inside the VSCode extension host both go
 * through VSCode's proxy patch (`http.proxySupport`), which reuses TLS
 * sessions, and Google answers those resumed sessions from VSCode's Electron
 * runtime with HTTP 429 ("Sorry..." page). `node:http2` is not patched and
 * does a full TLS handshake per connection, which Google accepts.
 */
export function httpGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<HttpResponse> {
    const { origin, pathname, search } = new URL(url);

    return new Promise((resolve, reject) => {
        const session = http2.connect(origin);
        const fail = (error: Error) => {
            clearTimeout(timer);
            session.destroy();
            reject(error);
        };
        const timer = setTimeout(() => fail(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

        session.on('error', fail);

        const request = session.request({ ':method': 'GET', ':path': pathname + search, ...headers });
        const chunks: Buffer[] = [];
        let status = 0;

        request.on('response', (responseHeaders) => {
            status = Number(responseHeaders[':status']);
        });
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
            clearTimeout(timer);
            session.close();
            resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
        });
        request.on('error', fail);
        request.end();
    });
}

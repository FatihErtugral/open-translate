import * as http from 'node:http';
import * as http2 from 'node:http2';
import * as net from 'node:net';
import * as tls from 'node:tls';

export interface HttpResponse {
    status: number;
    body: string;
}

/**
 * GET `url` on a fresh connection and resolve with the status and UTF-8 body
 * (any status; callers decide what counts as success).
 *
 * Deliberately not `fetch` / `https`: inside the VSCode extension host both go
 * through VSCode's proxy patch (`http.proxySupport`), which reuses TLS
 * sessions, and Google answers those resumed sessions from VSCode's Electron
 * runtime with HTTP 429 ("Sorry..." page). A socket of our own does a full TLS
 * handshake per connection, which Google accepts.
 *
 * The socket offers ALPN `h2` and `http/1.1`. The request uses HTTP/2 when the
 * server selects `h2` and HTTP/1.1 on the same socket otherwise: TLS-inspecting
 * proxies such as Netskope select no protocol and reset an HTTP/2 request. The
 * HTTP/1.1 request is a `new http.ClientRequest` because VSCode patches
 * `http.request`, and the patch replaces our socket with its own agent.
 */
export function httpGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<HttpResponse> {
    const { protocol, host, hostname, port, origin, pathname, search } = new URL(url);
    const path = pathname + search;
    const address = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;

    return new Promise((resolve, reject) => {
        // Plain `http:` URLs speak cleartext HTTP/2 (h2c), which has no ALPN.
        const socket = protocol === 'https:'
            ? tls.connect({ host: address, port: Number(port || 443), servername: net.isIP(address) ? undefined : address, ALPNProtocols: ['h2', 'http/1.1'] })
            : net.connect({ host: address, port: Number(port || 80) });
        const chunks: Buffer[] = [];
        let status = 0;
        const fail = (error: Error) => {
            clearTimeout(timer);
            socket.destroy();
            reject(error);
        };
        const finish = () => {
            clearTimeout(timer);
            socket.destroy();
            resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
        };
        const timer = setTimeout(() => fail(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

        socket.on('error', fail);
        socket.once(protocol === 'https:' ? 'secureConnect' : 'connect', () => {
            if (socket instanceof tls.TLSSocket && socket.alpnProtocol !== 'h2') {
                const request = new http.ClientRequest({ path, headers: { host, ...headers }, createConnection: () => socket });

                request.on('response', (response) => {
                    status = response.statusCode ?? 0;
                    response.on('data', (chunk: Buffer) => chunks.push(chunk));
                    response.on('end', finish);
                    response.on('error', fail);
                });
                request.on('error', fail);
                request.end();
                return;
            }

            const session = http2.connect(origin, { createConnection: () => socket });
            session.on('error', fail);

            const request = session.request({ ':method': 'GET', ':path': path, ...headers });

            request.on('response', (responseHeaders) => {
                status = Number(responseHeaders[':status']);
            });
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', finish);
            request.on('error', fail);
            request.end();
        });
    });
}

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import * as http2 from 'http2';
import * as https from 'https';
import { AddressInfo, Server } from 'net';
import tls = require('tls'); // sinon cannot stub the read-only bindings of a namespace import
import * as sinon from 'sinon';
import TranslateHoverProvider from '../hoverProvider';
import * as api from '../api';
import * as httpClient from '../httpClient';

suite('TranslateHoverProvider Test Suite', () => {
    let hoverProvider: TranslateHoverProvider;
    const targetLang = 'tr';

    suiteSetup(async () => {
        sinon.stub(api, 'translateText').resolves('Mock Translate');

        // Initialize your hover provider
        hoverProvider = new TranslateHoverProvider();

        // Activate the extension
        const extension = vscode.extensions.getExtension('fatihertugral.open-translate.setTargetLanguage');
        await extension?.activate();
    });

    teardown(async () => {
        if (vscode.window.activeTextEditor) {
            vscode.window.activeTextEditor.selection = new vscode.Selection(0, 0, 0, 0);
        }
    });

    suiteTeardown(() => {
        sinon.restore();
    });

    test('Hover provider returns translated content', async () => {
        const exampleFileUri = vscode.Uri.file(path.join(__dirname, 'testFixture', 'example.txt'));
        await vscode.workspace.fs.writeFile(exampleFileUri, Buffer.from('Test content'));

        // Select the text in the document
        const document = await vscode.workspace.openTextDocument(exampleFileUri);
        const editor = await vscode.window.showTextDocument(document);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 12));
        editor.selection = new vscode.Selection(range.start, range.end);
        const hoverPosition = new vscode.Position(0, 6); // Position within the selected text
        const hover = await hoverProvider.provideHover(document, hoverPosition);

        assert.ok(hover, 'Hover content was returned.');

        const hoverContent = hover.contents;

        if (Array.isArray(hoverContent)) {
            assert.ok(hoverContent.length > 0, 'Hover content is empty.');
            const firstContent = hoverContent[0];

            if (firstContent instanceof vscode.MarkdownString) {
                assert.equal(firstContent.value, '**Translated:**\nMock Translate', 'Incorrect hover content.');
            } else if (typeof firstContent === 'string') {
                assert.equal(firstContent, '**Translated:**\nMock Translate', 'Incorrect hover content.');
            }
        } else {
            assert.fail('Unexpected hover content type.');
        }
    });

    test('Hover provider returns undefined for non-selectable text', async () => {
        const exampleFileUri = vscode.Uri.file(path.join(__dirname, 'testFixture', 'example.txt'));
        await vscode.workspace.fs.writeFile(exampleFileUri, Buffer.from('Test content'));
        
        const document = await vscode.workspace.openTextDocument(exampleFileUri);
        const editor = await vscode.window.showTextDocument(document);
        const hoverPosition = new vscode.Position(0, 0);

        const hover = await hoverProvider.provideHover(document, hoverPosition);

        assert.equal(hover, undefined, 'Hover content was returned unexpectedly.');
    });

    test('Hover works on non-file documents such as the git side of a diff', async () => {
        await vscode.extensions.getExtension('fatihertugral.open-translate')?.activate();

        // Stands in for `git:` / `gitlens:` / `untitled:` — anything that is not `file:`.
        const scheme = 'open-translate-test';
        const registration = vscode.workspace.registerTextDocumentContentProvider(scheme, {
            provideTextDocumentContent: () => 'Test content',
        });

        try {
            const uri = vscode.Uri.parse(`${scheme}:/example.txt`);
            const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
            editor.selection = new vscode.Selection(0, 0, 0, 12);

            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, new vscode.Position(0, 6));
            const contents = hovers.flatMap((hover) => hover.contents.map((content) => typeof content === 'string' ? content : content.value));

            assert.ok(contents.includes('**Translated:**\nMock Translate'), `Expected a translation hover, got: ${JSON.stringify(contents)}`);
        } finally {
            registration.dispose();
        }
    });

    test('Long translations are wrapped so the hover does not span the whole editor', () => {
        const maxLength = TranslateHoverProvider['MAX_LINE_LENGTH'];
        const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
        const lines = TranslateHoverProvider['wrapLines'](words.join(' ')).split('  \n');

        assert.ok(lines.length > 1, 'Long text should be split into several lines.');
        assert.ok(lines.every((line) => line.length <= maxLength), `Every line should fit in ${maxLength} chars.`);
        assert.deepStrictEqual(lines.join(' ').split(' '), words, 'Wrapping must not drop or split words.');

        // Languages written without spaces (e.g. Chinese) are cut at the column instead.
        const unspaced = '翻'.repeat(maxLength * 2 + 5);
        const unspacedLines = TranslateHoverProvider['wrapLines'](unspaced).split('  \n');
        assert.deepStrictEqual(unspacedLines.map((line) => line.length), [maxLength, maxLength, 5]);
    });

    test('Char limit validation', () => {
        const longText = 'a'.repeat(TranslateHoverProvider['CHAR_LIMIT'] + 1);
        const isValid = hoverProvider['isValidCharLimit'](longText);
        assert.strictEqual(isValid, false, 'Text exceeding char limit should not be valid.');
    });

    test('Correct language is used for translation', () => {
        const lang = hoverProvider['targetLang'];
        assert.strictEqual(lang, targetLang, 'Target language did not match expected value.');
    });
});

suite('translateText failover Test Suite', () => {
    let httpGetStub: sinon.SinonStub;
    let configStub: sinon.SinonStub;
    let updateSpy: sinon.SinonSpy;

    const PRIMARY = 'https://primary.example/translate_a/single';
    const FALLBACK = 'https://fallback.example/translate_a/single';

    function jsonResponse(body: unknown, status = 200): httpClient.HttpResponse {
        return { status, body: JSON.stringify(body) };
    }

    // Google translate_a/single response: [ [ [translated, source, ...], ... ], ... ]
    function googleBody(...segments: string[]) {
        return [segments.map((s) => [s, s, null, null, 10]), null, 'en'];
    }

    // httpGet is called with the base URL plus a query string, so match by prefix.
    function startsWith(prefix: string) {
        return sinon.match((value: string) => typeof value === 'string' && value.startsWith(prefix));
    }

    function stubConfig(apiUrl: string, fallbackApiUrls: string[]) {
        updateSpy = sinon.spy(async () => undefined);
        configStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: (key: string, fallback?: unknown) => {
                if (key === 'apiUrl') { return apiUrl; }
                if (key === 'fallbackApiUrls') { return fallbackApiUrls; }
                return fallback;
            },
            update: updateSpy,
        } as unknown as vscode.WorkspaceConfiguration);
    }

    teardown(() => {
        httpGetStub?.restore();
        configStub?.restore();
    });

    test('fails over to a fallback when the primary errors, joins segments, and persists it', async () => {
        const api = require('../api');
        stubConfig(PRIMARY, [FALLBACK]);

        httpGetStub = sinon.stub(httpClient, 'httpGet');
        // Primary: HTTP 429, as Google answers when it rate-limits.
        httpGetStub.withArgs(startsWith(PRIMARY)).resolves(jsonResponse('rate limited', 429));
        // Fallback: multi-segment Google response.
        httpGetStub.withArgs(startsWith(FALLBACK)).resolves(jsonResponse(googleBody('Merhaba. ', 'Nasılsın?')));

        const result = await api.translateText('Hello. How are you?', 'tr');

        assert.strictEqual(result, 'Merhaba. Nasılsın?', 'Should join all translated segments.');
        assert.ok(updateSpy.calledWith('apiUrl', FALLBACK), 'Working fallback should be persisted as the new default.');
    });

    test('HTTP 200 with unexpected/empty body is treated as failure', async () => {
        const api = require('../api');
        stubConfig(PRIMARY, []);

        httpGetStub = sinon.stub(httpClient, 'httpGet');
        httpGetStub.resolves(jsonResponse({ unexpected: true }));

        await assert.rejects(api.translateText('hello', 'tr'), /Translation failed/);
    });

    test('rejects with custom-URL guidance when all endpoints fail', async () => {
        const api = require('../api');
        stubConfig(PRIMARY, [FALLBACK]);

        httpGetStub = sinon.stub(httpClient, 'httpGet');
        httpGetStub.resolves(jsonResponse('error code: 523', 523));

        await assert.rejects(api.translateText('hello', 'tr'), /Set API URL|apiUrl setting/);
    });
});

suite('httpGet Test Suite', () => {
    let server: http2.Http2Server;
    let baseUrl: string;
    let handler: (stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) => void;

    suiteSetup(async () => {
        // Cleartext HTTP/2 (h2c) so the test needs no certificate; production URLs are https.
        server = http2.createServer();
        server.on('stream', (stream, headers) => handler(stream, headers));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    suiteTeardown(() => new Promise<void>((resolve) => server.close(() => resolve())));

    test('returns status and UTF-8 body, sending path, query and headers', async () => {
        handler = (stream, headers) => {
            stream.respond({ ':status': 429 });
            stream.end(JSON.stringify({ path: headers[':path'], userAgent: headers['user-agent'], text: 'Selam Dünya' }));
        };

        const response = await httpClient.httpGet(`${baseUrl}/translate_a/single?q=a%20b`, { 'user-agent': 'test-agent' }, 5000);

        assert.strictEqual(response.status, 429);
        assert.deepStrictEqual(JSON.parse(response.body), { path: '/translate_a/single?q=a%20b', userAgent: 'test-agent', text: 'Selam Dünya' });
    });

    test('rejects when the server does not answer in time', async () => {
        handler = () => { /* never respond */ };

        await assert.rejects(httpClient.httpGet(`${baseUrl}/slow`, {}, 100), /timed out/);
    });

    test('rejects when the host is unreachable', async () => {
        await assert.rejects(httpClient.httpGet('http://127.0.0.1:1/', {}, 5000));
    });
});

// Self-signed for localhost and 127.0.0.1, valid until 2126.
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgGHEUXoKwfu6dL/6q
5K7nCRW0wp8ImFDhjeHsdZExPW6hRANCAARlSfbsJ4d7YOUgPdWaqgPwhDI+rWTV
sFWTHGZAMU2y3C8ZVYBV0ROgo8KQL6IwYeKd30ztuBCgJvItibXIx92r
-----END PRIVATE KEY-----`;
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIBmjCCAUGgAwIBAgIUJ4XfXm9G0gFmeNxS8KpqGGvjInkwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTExOTIzNTgwMloYDzIxMjYxMDI2
MjM1ODAyWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARlSfbsJ4d7YOUgPdWaqgPwhDI+rWTVsFWTHGZAMU2y3C8ZVYBV0ROg
o8KQL6IwYeKd30ztuBCgJvItibXIx92ro28wbTAdBgNVHQ4EFgQUk/RCe7rTk1fK
sPHUMIrN+dA3K0gwHwYDVR0jBBgwFoAUk/RCe7rTk1fKsPHUMIrN+dA3K0gwDwYD
VR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZI
zj0EAwIDRwAwRAIgfA19vV971tGugq1Umv1QhaD9zhWy1+lBHEeUjKYpaKcCIFFc
47ZNmTgE2KHe4jjy6YoWAFindLw1EBbmiTLb/VsA
-----END CERTIFICATE-----`;

suite('httpGet over TLS Test Suite', () => {
    let server: Server;
    let connectStub: sinon.SinonStub;

    suiteSetup(() => {
        // Trust the test certificate on the TLS connections httpGet opens.
        const connect = tls.connect;
        connectStub = sinon.stub(tls, 'connect').callsFake((...args: unknown[]): tls.TLSSocket =>
            Reflect.apply(connect, tls, args.map((arg) => (arg && typeof arg === 'object' ? { ...arg, ca: TEST_CERT } : arg))));
    });

    teardown(() => new Promise<void>((resolve) => server.close(() => resolve())));

    suiteTeardown(() => connectStub.restore());

    async function listen(tlsServer: Server): Promise<string> {
        server = tlsServer;
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        return `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }

    test('uses HTTP/1.1 when the server selects no ALPN protocol, as TLS-inspecting proxies do', async () => {
        const baseUrl = await listen(https.createServer({ key: TEST_KEY, cert: TEST_CERT, ALPNProtocols: [] }, (request, response) => {
            response.end(JSON.stringify({
                alpn: (request.socket as tls.TLSSocket).alpnProtocol,
                httpVersion: request.httpVersion,
                path: request.url,
                host: request.headers.host,
                userAgent: request.headers['user-agent'],
            }));
        }));

        const response = await httpClient.httpGet(`${baseUrl}/translate_a/single?q=a%20b`, { 'user-agent': 'test-agent' }, 5000);

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(JSON.parse(response.body), {
            alpn: false,
            httpVersion: '1.1',
            path: '/translate_a/single?q=a%20b',
            host: new URL(baseUrl).host,
            userAgent: 'test-agent',
        });
    });

    test('uses HTTP/2 when the server selects h2', async () => {
        const baseUrl = await listen(http2.createSecureServer({ key: TEST_KEY, cert: TEST_CERT, allowHTTP1: true }, (request, response) => {
            response.end(request.httpVersion);
        }));

        const response = await httpClient.httpGet(`${baseUrl}/`, {}, 5000);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body, '2.0');
    });
});

suite('httpGet trust store Test Suite', () => {
    // `tls.getCACertificates` is Node 22.15+, newer than the @types/node of this repository.
    const tlsCaStores = tls as typeof tls & { getCACertificates(type: string): string[] };
    let server: Server;
    let caStub: sinon.SinonStub;

    teardown(() => {
        caStub.restore();
        return new Promise<void>((resolve) => server.close(() => resolve()));
    });

    test('trusts a CA that only the operating system store holds, as when NODE_EXTRA_CA_CERTS is not set', async () => {
        const getCACertificates = tlsCaStores.getCACertificates;
        caStub = sinon.stub(tlsCaStores, 'getCACertificates').callsFake((type: string) =>
            (type === 'system' ? [TEST_CERT] : getCACertificates(type)));
        server = https.createServer({ key: TEST_KEY, cert: TEST_CERT }, (request, response) => response.end('trusted'));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

        const response = await httpClient.httpGet(`https://127.0.0.1:${(server.address() as AddressInfo).port}/`, {}, 5000);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body, 'trusted');
    });
});

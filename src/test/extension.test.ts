import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import TranslateHoverProvider from '../hoverProvider';
import * as api from '../api';

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
    let fetchStub: sinon.SinonStub;
    let configStub: sinon.SinonStub;
    let updateSpy: sinon.SinonSpy;

    const PRIMARY = 'https://primary.example/translate_a/single';
    const FALLBACK = 'https://fallback.example/translate_a/single';

    function jsonResponse(body: unknown, ok = true, status = 200) {
        return {
            ok,
            status,
            json: async () => body,
            text: async () => JSON.stringify(body),
        } as unknown as Response;
    }

    // Google translate_a/single response: [ [ [translated, source, ...], ... ], ... ]
    function googleBody(...segments: string[]) {
        return [segments.map((s) => [s, s, null, null, 10]), null, 'en'];
    }

    // fetch is called with the base URL plus a query string, so match by prefix.
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
        fetchStub?.restore();
        configStub?.restore();
    });

    test('fails over to a fallback when the primary errors, joins segments, and persists it', async () => {
        const api = require('../api');
        stubConfig(PRIMARY, [FALLBACK]);

        fetchStub = sinon.stub(global, 'fetch');
        // Primary: HTTP 500.
        fetchStub.withArgs(startsWith(PRIMARY)).resolves(jsonResponse('rate limited', false, 500));
        // Fallback: multi-segment Google response.
        fetchStub.withArgs(startsWith(FALLBACK)).resolves(jsonResponse(googleBody('Merhaba. ', 'Nasılsın?')));

        const result = await api.translateText('Hello. How are you?', 'tr');

        assert.strictEqual(result, 'Merhaba. Nasılsın?', 'Should join all translated segments.');
        assert.ok(updateSpy.calledWith('apiUrl', FALLBACK), 'Working fallback should be persisted as the new default.');
    });

    test('HTTP 200 with unexpected/empty body is treated as failure', async () => {
        const api = require('../api');
        stubConfig(PRIMARY, []);

        fetchStub = sinon.stub(global, 'fetch');
        fetchStub.resolves(jsonResponse({ unexpected: true }));

        await assert.rejects(api.translateText('hello', 'tr'), /Translation failed/);
    });

    test('rejects with custom-URL guidance when all endpoints fail', async () => {
        const api = require('../api');
        stubConfig(PRIMARY, [FALLBACK]);

        fetchStub = sinon.stub(global, 'fetch');
        fetchStub.resolves(jsonResponse('error code: 523', false, 523));

        await assert.rejects(api.translateText('hello', 'tr'), /Set API URL|apiUrl setting/);
    });
});

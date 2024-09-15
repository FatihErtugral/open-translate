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

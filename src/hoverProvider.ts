import * as vscode from 'vscode';
import { translateText } from './api.js';
import Enums from './enum.js';

export default class TranslateHoverProvider implements vscode.HoverProvider {
    private static CHAR_LIMIT = 2000;
    private static MAX_LINE_LENGTH = 80;
    private beforeSelectedText: string;
    private beforeTranslatedText: string;

    constructor () {
        this.beforeSelectedText = '';
        this.beforeTranslatedText = '';
    }

    public provideHover (
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.ProviderResult<vscode.Hover> {
        if (!this.isSelectionMatch(position)) {
            return;
        }

        const selectedText = document.getText(vscode.window.activeTextEditor?.selection).trim();

        if (!this.isValidCharLimit(selectedText)) {
            return;
        }

        
        if (selectedText === this.beforeSelectedText) {
            return new vscode.Hover(`**Translated:**\n${TranslateHoverProvider.wrapLines(this.beforeTranslatedText)}`);
        }


        return translateText(selectedText, this.targetLang)
            .then((translatedText) => {
                this.beforeSelectedText = selectedText;
                this.beforeTranslatedText = translatedText;

                return new vscode.Hover(`**Translated:**\n${TranslateHoverProvider.wrapLines(translatedText)}`);
            })
            .catch((error) => new vscode.Hover(`**Translate Error:**\n${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    private isSelectionMatch (position: vscode.Position): boolean {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return false;
        }

        const selection = editor.selection;


        if (!selection.contains(position)) {
            return false;
        }

        return true;
    }

    /**
     * VSCode widens a hover up to the editor's width as soon as one line
     * overflows, so a long one-line translation spans wide screens. Hard-wrapping
     * at MAX_LINE_LENGTH (markdown `  \n` breaks) keeps the hover as wide as its
     * longest line. Text without spaces (e.g. Chinese) is cut at the column.
     */
    private static wrapLines (text: string): string {
        const maxLength = TranslateHoverProvider.MAX_LINE_LENGTH;
        const lines: string[] = [];

        for (const paragraph of text.split('\n')) {
            let line = '';

            for (const word of paragraph.split(/\s+/).filter(Boolean)) {
                const chars = Array.from(word);

                for (let i = 0; i < chars.length; i += maxLength) {
                    const piece = chars.slice(i, i + maxLength).join('');

                    if (line && line.length + 1 + piece.length > maxLength) {
                        lines.push(line);
                        line = piece;
                    } else {
                        line = line ? `${line} ${piece}` : piece;
                    }
                }
            }

            lines.push(line);
        }

        return lines.join('  \n');
    }

    private isValidCharLimit (text: string): boolean {
        return Boolean(text.length) && text.length < TranslateHoverProvider.CHAR_LIMIT;
    }

    private get targetLang () {
        return vscode.workspace.getConfiguration(Enums.COMMAND_ID).get<string>('targetLanguage') || 'tr';
    }
}

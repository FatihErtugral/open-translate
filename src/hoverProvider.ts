import * as vscode from 'vscode';
import { translateText } from './api.js';

export default class TranslateHoverProvider implements vscode.HoverProvider {
    private static CHAR_LIMIT = 2000;
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
            return new vscode.Hover(`**Translated:**\n${this.beforeTranslatedText}`);
        }


        return translateText(selectedText, this.targetLang)
            .then((translatedText) => {
                this.beforeSelectedText = selectedText;
                this.beforeTranslatedText = translatedText;

                return new vscode.Hover(`**Translated:**\n${translatedText}`);
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

    private isValidCharLimit (text: string): boolean {
        return Boolean(text.length) && text.length < TranslateHoverProvider.CHAR_LIMIT;
    }

    private get targetLang () {
        return vscode.workspace.getConfiguration('extension').get<string>('targetLanguage') || 'tr';
    }
}

import * as vscode from 'vscode';
import { getSetTargetLanguageCommandHandler } from './commands';
import TranslateHoverProvider from './hoverProvider';

export function activate(context: vscode.ExtensionContext) {
    const hoverProvider = new TranslateHoverProvider();
    const hoverProviderRegistration = vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        hoverProvider
    );
    const setTargetLanguageCommandHandler = getSetTargetLanguageCommandHandler();

    context.subscriptions.push(hoverProviderRegistration, setTargetLanguageCommandHandler);
}

export function deactivate() {}

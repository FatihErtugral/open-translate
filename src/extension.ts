import * as vscode from 'vscode';
import { getSetApiUrlCommandHandler, getSetTargetLanguageCommandHandler } from './commands';
import TranslateHoverProvider from './hoverProvider';

export function activate(context: vscode.ExtensionContext) {
    const hoverProvider = new TranslateHoverProvider();
    const hoverProviderRegistration = vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        hoverProvider
    );
    const setTargetLanguageCommandHandler = getSetTargetLanguageCommandHandler();
    const setApiUrlCommandHandler = getSetApiUrlCommandHandler();

    context.subscriptions.push(hoverProviderRegistration, setTargetLanguageCommandHandler, setApiUrlCommandHandler);
}

export function deactivate() {}

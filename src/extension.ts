import * as vscode from 'vscode';
import { getSetApiUrlCommandHandler, getSetTargetLanguageCommandHandler } from './commands';
import TranslateHoverProvider from './hoverProvider';

export function activate(context: vscode.ExtensionContext) {
    const hoverProvider = new TranslateHoverProvider();
    // Every scheme, not just `file:` — e.g. the original side of a git diff is a `git:` document.
    const hoverProviderRegistration = vscode.languages.registerHoverProvider(
        '*',
        hoverProvider
    );
    const setTargetLanguageCommandHandler = getSetTargetLanguageCommandHandler();
    const setApiUrlCommandHandler = getSetApiUrlCommandHandler();

    context.subscriptions.push(hoverProviderRegistration, setTargetLanguageCommandHandler, setApiUrlCommandHandler);
}

export function deactivate() {}

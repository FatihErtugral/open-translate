import * as vscode from 'vscode';
import enums from "./enum";

const setTargetLanguageCommandId = `${enums.COMMAND_ID}.setTargetLanguage`;
const setApiUrlCommandId = `${enums.COMMAND_ID}.setApiUrl`;
const Langs = vscode.workspace.getConfiguration(enums.COMMAND_ID).get<string[]>('targetLanguages') || [];

export async function setTargetLanguageCommand() {
    const targetLang = await vscode.window.showQuickPick(
        Langs.map(key => ({
            label: key,
            value: key
        })),
        {
            placeHolder: 'Select target language',
            canPickMany: false
        }
    );

    if (targetLang) {
        await vscode.workspace.getConfiguration(enums.COMMAND_ID).update(
            'targetLanguage',
            targetLang.value,
            vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`Target language set to ${targetLang.value}`);
    }
}

export function getSetTargetLanguageCommandHandler() {
    return vscode.commands.registerCommand(setTargetLanguageCommandId, setTargetLanguageCommand);
}

export async function setApiUrlCommand() {
    const config = vscode.workspace.getConfiguration(enums.COMMAND_ID);
    const currentUrl = config.get<string>('apiUrl', '');

    const apiUrl = await vscode.window.showInputBox({
        prompt: 'Enter the translation API URL (Google translate_a/single endpoint)',
        placeHolder: 'https://translate.googleapis.com/translate_a/single',
        value: currentUrl,
        validateInput: (value) => {
            const trimmed = value.trim();

            if (!trimmed) {
                return 'API URL cannot be empty';
            }

            return /^https?:\/\/.+/.test(trimmed) ? null : 'Enter a valid http(s) URL';
        }
    });

    if (apiUrl) {
        await config.update('apiUrl', apiUrl.trim(), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`API URL set to ${apiUrl.trim()}`);
    }
}

export function getSetApiUrlCommandHandler() {
    return vscode.commands.registerCommand(setApiUrlCommandId, setApiUrlCommand);
}

import * as vscode from 'vscode';
import enums from "./enum";

const setTargetLanguageCommandId = `${enums.COMMAND_ID}.setTargetLanguage`;
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

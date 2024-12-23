import { workspace } from 'vscode';
import { TranslationResponse } from './types.js';
import Enums from './enum.js';

const apiUrl = workspace.getConfiguration(Enums.COMMAND_ID).get('apiUrl', 'https://lingva.ml/api/graphql');

export const headers = {
    'Content-Type': 'application/json',
};

export const query = `
query Translation($source: String, $target: String, $query: String!) {
    translation(source: $source, target: $target, query: $query) {
        target {
            text
        }
    }
}
`;

export async function translateText(text: string, targetLang: string): Promise<string> {
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query,
                variables: {
                    source: 'auto',
                    target: targetLang,
                    query: text,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
        }

        const result = await response.json() as { data: TranslationResponse };

        return result.data.translation.target.text;
    } catch (error) {
        throw new Error('Translation failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

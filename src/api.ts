import { workspace, ConfigurationTarget } from 'vscode';
import { GoogleTranslateResponse } from './types.js';
import Enums from './enum.js';

// Google's free translate endpoint does not require an API key but can reject
// requests without a User-Agent, so we always send one.
export const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; open-translate-vscode)',
};

const REQUEST_TIMEOUT_MS = 10000;

// Fast path: the endpoint that last produced a valid translation this session.
let lastWorkingUrl: string | undefined;

function getPrimaryUrl(): string {
    return workspace.getConfiguration(Enums.COMMAND_ID).get('apiUrl', 'https://translate.googleapis.com/translate_a/single');
}

function getFallbackUrls(): string[] {
    return workspace.getConfiguration(Enums.COMMAND_ID).get<string[]>('fallbackApiUrls', []);
}

/**
 * Ordered, de-duplicated list of endpoints to try: the last known-working one
 * first (if any), then the configured primary, then the configured fallbacks.
 */
function buildCandidateUrls(): string[] {
    const ordered = [lastWorkingUrl, getPrimaryUrl(), ...getFallbackUrls()];
    const seen = new Set<string>();
    const candidates: string[] = [];

    for (const url of ordered) {
        const trimmed = url?.trim();

        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            candidates.push(trimmed);
        }
    }

    return candidates;
}

/**
 * GET a single Google `translate_a/single` endpoint and return the translated
 * text. The response is an array whose first element holds the translated
 * segments (`[[ [segmentText, sourceText, ...], ... ], ...]`); we join every
 * segment back together. Throws unless the response is HTTP-ok and yields a
 * non-empty translation.
 */
async function requestTranslation(baseUrl: string, text: string, targetLang: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const url = `${baseUrl}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const result = await response.json() as GoogleTranslateResponse;
        const segments = result?.[0];

        if (!Array.isArray(segments)) {
            throw new Error('Unexpected response shape');
        }

        const translatedText = segments
            .map((segment) => segment?.[0])
            .filter((part): part is string => typeof part === 'string')
            .join('');

        if (!translatedText) {
            throw new Error('Empty translation returned');
        }

        return translatedText;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Translate `text`, failing over across all candidate endpoints. The first
 * endpoint that returns a valid translation is cached for the session and, if
 * it differs from the saved primary, persisted as the new default.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
    const candidates = buildCandidateUrls();

    if (!candidates.length) {
        throw new Error('Translation failed: no API URL configured. Run "Open Translate: Set API URL" to add one.');
    }

    const failures: string[] = [];

    for (const url of candidates) {
        try {
            const translatedText = await requestTranslation(url, text, targetLang);

            lastWorkingUrl = url;

            if (url !== getPrimaryUrl()) {
                try {
                    await workspace.getConfiguration(Enums.COMMAND_ID).update('apiUrl', url, ConfigurationTarget.Global);
                } catch {
                    // Persisting the new default is best-effort — never fail a good translation over a settings-write error.
                }
            }

            return translatedText;
        } catch (error) {
            failures.push(`${url} (${error instanceof Error ? error.message : 'Unknown error'})`);
        }
    }

    throw new Error(
        `Translation failed: all ${candidates.length} endpoint(s) failed. ` +
        'Set a working endpoint via "Open Translate: Set API URL" or the open-translate.apiUrl setting.\n' +
        failures.join('\n')
    );
}

export interface Language {
    code: string;
    name: string;
}

export interface TranslationSource {
    lang: Language;
    text: string;
    audio: number[];
    detected?: Language;
    typo?: string;
    pronunciation?: string;
    definitions?: {
        type: string;
        list: {
            definition: string;
            example: string;
            field: string;
            synonyms: string[];
        }[];
    };
    examples?: string[];
    similar?: string[];
}

export interface TranslationTarget {
    lang: Language;
    text: string;
    audio: number[];
    pronunciation?: string;
    extraTranslations?: {
        type: string;
        list: {
            word: string;
            article: string;
            frequency: number;
            meanings: string[];
        }[];
    };
}

export interface TranslationResponse {
    translation: {
        source: TranslationSource;
        target: TranslationTarget;
    };
}

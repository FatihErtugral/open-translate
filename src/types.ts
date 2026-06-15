/**
 * Shape of the response returned by Google's free `translate_a/single`
 * endpoint. The first element is an array of translated segments, where each
 * segment is `[translatedText, sourceText, ...]`. The remaining top-level
 * elements (detected language, confidence, etc.) are not consumed.
 */
export type GoogleTranslateSegment = [string, string, ...unknown[]];

export type GoogleTranslateResponse = [GoogleTranslateSegment[], ...unknown[]];

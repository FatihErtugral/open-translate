# Open Translate

![open translate demo](https://github.com/FatihErtugral/public-assests/raw/main/open-translate/open-translate-demo-.gif)

## Description:

This open-source VSCode extension offers translation functionality directly within the editor using Google Translate's free, key-less endpoint. The extension allows you to translate selected text and view the translation in a hover popup.

## Features

- Translate text on hover.
- Support for multiple languages.
- No API key required.
- Automatic endpoint failover — if one endpoint is unreachable, the next is tried and the working one becomes the default.
- Custom endpoint support — set your own translation URL via the **Open Translate: Set API URL** command or the `open-translate.apiUrl` setting.
- Open source and free.

## Settings

| Setting | Description |
| --- | --- |
| `open-translate.targetLanguage` | Target language for translations (default `tr`). |
| `open-translate.apiUrl` | Preferred Google `translate_a/single` endpoint. Auto-updated to whichever endpoint is working. |
| `open-translate.fallbackApiUrls` | Endpoints tried in order when the preferred one fails. |

## License

This extension is licensed under the [Apache License](./LICENSE).

## Credits

Translations are powered by Google Translate's public `translate_a/single` endpoint.

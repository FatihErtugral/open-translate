# Change Log

All notable changes to the "classysoft-translate" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Use Google Translate's free `translate_a/single` endpoint for translations (no API key required).
- Add automatic endpoint failover across `apiUrl` + `fallbackApiUrls`; the first working endpoint is saved as the new default.
- Add custom endpoint support: `open-translate.apiUrl` is now free-text and a new "Open Translate: Set API URL" command lets you enter your own URL.
- Fix target language being ignored (config was read from the wrong settings section).
- Fix HTTP 429 ("Sorry...") on every endpoint inside VSCode: requests now use Node's HTTP/2 client instead of `fetch`, whose TLS session reuse in VSCode's runtime Google rate-limits.
- Fix translation hover not appearing in git diffs and other non-`file` documents (e.g. `git:`, `untitled:`).
- Wrap long translations at 80 characters so the hover no longer stretches across wide screens.

- Initial release
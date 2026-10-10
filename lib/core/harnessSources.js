// Exact credential sources owned by tools the extension can inspect in read-only mode.
// This list is deliberately explicit: it is never used to scan the home directory.
export const HARNESS_CREDENTIAL_SOURCES = Object.freeze({
    'command-code': Object.freeze({owner: 'Command Code', kind: 'api-key', path: '~/.commandcode/auth.json', select: ['apiKey']}),
    codex: Object.freeze({owner: 'Codex', kind: 'oauth-token', path: '~/.codex/auth.json', select: ['tokens', 'access_token']}),
    claude: Object.freeze({owner: 'Claude Code', kind: 'oauth-token', path: '~/.claude/.credentials.json', select: ['claudeAiOauth', 'accessToken']}),
    antigravity: Object.freeze({owner: 'Antigravity', kind: 'oauth-token', service: 'gemini', select: ['token', 'access_token']}),
});

export const harnessCredentialSource = providerId => HARNESS_CREDENTIAL_SOURCES[providerId] ?? null;

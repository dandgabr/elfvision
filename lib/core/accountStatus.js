// A short, stable word for how a provider's account is doing, shared between
// the running extension (which writes it) and the preferences window (which
// shows it next to the credential). Pure JavaScript, tested under `gjs -m`.

export const ACCOUNT_STATUSES = ['ok', 'no_key', 'rejected', 'keyring', 'unreachable', 'changed', 'expired', 'refused', 'no_config'];

/**
 * @param {object} snapshot - a provider snapshot
 * @returns {string} one of ACCOUNT_STATUSES
 */
export function accountStatus(snapshot) {
    switch (snapshot.state) {
    case 'ok':
        return 'ok';
    case 'auth_required':
        return ['no_key', 'expired', 'refused', 'no_config'].includes(snapshot.reason) ? snapshot.reason : 'rejected';
    case 'provider_changed':
    case 'parse_error':
        return 'changed';
    default:
        return snapshot.reason === 'keyring' ? 'keyring' : 'unreachable';
    }
}

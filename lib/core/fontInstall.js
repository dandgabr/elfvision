import {fontPlan} from './fontManifest.js';

// A separate action owns consent. Creating a view or choosing a theme never starts work.
export class FontInstallController {
    constructor({confirm, installer, changed}) {
        this._confirm = confirm;
        this._installer = installer;
        this._changed = changed;
        this._generation = 0;
        this._destroyed = false;
        this.state = {status: 'idle'};
    }

    _publish(state) {
        if (!this._destroyed) {
            this.state = state;
            this._changed({...state});
        }
    }

    async start() {
        if (this._destroyed || ['reviewing', 'installing'].includes(this.state.status))
            return;
        const generation = ++this._generation;
        const current = () => !this._destroyed && generation === this._generation;
        const plan = fontPlan();
        this._publish({status: 'reviewing'});
        try {
            const consent = await this._confirm(plan);
            if (!current()) return;
            if (!consent) { this._publish({status: 'cancelled'}); return; }
            this._publish({status: 'installing', bytes: 0, total: plan.bytes});
            const result = await this._installer.install(plan.files.map(file => file.id), {
                committed: () => { if (current()) this._publish({status: 'installed', restartRequired: true}); },
                progress: progress => { if (current()) this._publish({status: 'installing', ...progress, total: plan.bytes}); },
            });
            if (current()) this._publish({status: 'installed', restartRequired: result.restartRequired});
        } catch (error) {
            const reasons = ['existing_conflict', 'digest_mismatch', 'invalid_font', 'redirect_rejected', 'size_limit', 'unsafe_directory', 'license_missing', 'license_mismatch'];
            if (current()) this._publish({status: 'failed', reason: reasons.includes(error.message) ? error.message : 'download_failed'});
        }
    }

    cancel() {
        if (this.state.status === 'installed') { this._installer.cancel(); return; }
        this._generation++;
        this._installer.cancel();
        this._publish({status: 'cancelled'});
    }

    destroy() {
        if (this._destroyed) return;
        this.cancel();
        this._destroyed = true;
    }
}

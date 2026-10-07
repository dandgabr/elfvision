// The random source and the hash for PKCE, on top of GLib and Gio.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * @param {number} count
 * @returns {Uint8Array} exactly `count` bytes from /dev/urandom
 * @throws {Error} when fewer bytes could be read
 */
export function randomBytes(count) {
    const stream = Gio.File.new_for_path('/dev/urandom').read(null);
    try {
        const bytes = stream.read_bytes(count, null).toArray();
        if (bytes.length !== count)
            throw new Error('the random source returned too few bytes');
        return bytes;
    } finally {
        stream.close(null);
    }
}

/**
 * @param {Uint8Array} data
 * @returns {Uint8Array} the SHA-256 digest
 */
export function sha256(data) {
    const checksum = new GLib.Checksum(GLib.ChecksumType.SHA256);
    checksum.update(data);
    const hex = checksum.get_string();
    const digest = new Uint8Array(hex.length / 2);
    for (let i = 0; i < digest.length; i++)
        digest[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return digest;
}

<?php

namespace App\Support;

/**
 * The Windows desktop app installer (built from /desktop with `npm run build`).
 *
 * To publish a release, copy the NSIS installer Tauri makes, e.g.
 * `FinstackPOS_0.2.0_x64-setup.exe`, plus its `.exe.sig` signature, into
 * storage/app/downloads/. The newest version there is what the landing page
 * offers; with none, the page says "coming soon" instead of linking to a
 * missing file. Installed apps update themselves to the newest version that
 * has a signature (see update()).
 */
class DesktopRelease
{
    public const DIRECTORY = 'downloads';

    /** @return list<array{version: string, size_bytes: int, filename: string, path: string, signature: string|null, published_at: int}> newest first */
    public static function all(): array
    {
        $releases = [];

        foreach (glob(storage_path('app/'.self::DIRECTORY.'/FinstackPOS_*_x64-setup.exe')) ?: [] as $path) {
            if (! preg_match('/FinstackPOS_(\d+\.\d+\.\d+)_x64-setup\.exe$/', $path, $m)) {
                continue;
            }
            $signature = is_file($path.'.sig') ? trim((string) file_get_contents($path.'.sig')) : null;

            $releases[] = [
                'version' => $m[1],
                'size_bytes' => (int) filesize($path),
                'filename' => basename($path),
                'path' => $path,
                'signature' => $signature !== '' ? $signature : null,
                'published_at' => (int) filemtime($path),
            ];
        }

        usort($releases, fn ($a, $b) => version_compare($b['version'], $a['version']));

        return $releases;
    }

    public static function latest(): ?array
    {
        return self::all()[0] ?? null;
    }

    public static function find(string $version): ?array
    {
        foreach (self::all() as $release) {
            if ($release['version'] === $version) {
                return $release;
            }
        }

        return null;
    }

    /** What the landing page may show: no server paths. */
    public static function forPage(): ?array
    {
        $release = self::latest();

        return $release ? ['version' => $release['version'], 'size_bytes' => $release['size_bytes']] : null;
    }

    /**
     * The Tauri updater's answer for an installed app on $currentVersion:
     * the newest signed release if it is newer, else null (HTTP 204).
     *
     * @return array{version: string, notes: string, pub_date: string, url: string, signature: string}|null
     */
    public static function update(string $currentVersion): ?array
    {
        foreach (self::all() as $release) {
            if ($release['signature'] === null) {
                continue;
            }
            if (! version_compare($release['version'], $currentVersion, '>')) {
                return null;
            }

            return [
                'version' => $release['version'],
                'notes' => 'FinstackPOS '.$release['version'],
                'pub_date' => gmdate('Y-m-d\TH:i:s\Z', $release['published_at']),
                // Pinned to this version, so the file always matches the signature.
                'url' => route('download.windows', ['version' => $release['version']]),
                'signature' => $release['signature'],
            ];
        }

        return null;
    }
}

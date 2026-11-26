<?php

namespace App\Support;

/**
 * The Windows desktop app installer (built from /desktop with `npm run build`).
 *
 * To publish a release, copy the NSIS installer Tauri makes, e.g.
 * `FinstackPOS_0.1.0_x64-setup.exe`, into storage/app/downloads/. The newest
 * version there is what the landing page offers; with none, the page says
 * "coming soon" instead of linking to a missing file.
 */
class DesktopRelease
{
    public const DIRECTORY = 'downloads';

    /** @return array{version: string, size_bytes: int, filename: string, path: string}|null */
    public static function latest(): ?array
    {
        $files = glob(storage_path('app/'.self::DIRECTORY.'/FinstackPOS_*_x64-setup.exe')) ?: [];
        $latest = null;

        foreach ($files as $path) {
            if (! preg_match('/FinstackPOS_(\d+\.\d+\.\d+)_x64-setup\.exe$/', $path, $m)) {
                continue;
            }
            if ($latest === null || version_compare($m[1], $latest['version'], '>')) {
                $latest = [
                    'version' => $m[1],
                    'size_bytes' => (int) filesize($path),
                    'filename' => basename($path),
                    'path' => $path,
                ];
            }
        }

        return $latest;
    }

    /** What the landing page may show: no server paths. */
    public static function forPage(): ?array
    {
        $release = self::latest();

        return $release ? ['version' => $release['version'], 'size_bytes' => $release['size_bytes']] : null;
    }
}

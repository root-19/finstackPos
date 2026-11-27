<?php

namespace App\Support;

/**
 * The deployed web build, as the short git commit the server is on, so a
 * store can tell support exactly which version it runs. Read straight from
 * .git (no shell); null when the app isn't deployed from a git checkout.
 */
class WebVersion
{
    public static function current(): ?string
    {
        $git = base_path('.git');
        $head = @file_get_contents($git.'/HEAD');
        if ($head === false) {
            return null;
        }
        $head = trim($head);

        if (! str_starts_with($head, 'ref: ')) {
            return self::short($head);
        }

        $ref = substr($head, 5);
        $hash = @file_get_contents($git.'/'.$ref);
        if ($hash !== false) {
            return self::short(trim($hash));
        }

        // Refs packed by `git gc`.
        foreach (@file($git.'/packed-refs', FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            if (str_ends_with($line, ' '.$ref)) {
                return self::short(strtok($line, ' '));
            }
        }

        return null;
    }

    private static function short(string $hash): ?string
    {
        return preg_match('/^[0-9a-f]{40}$/', $hash) ? substr($hash, 0, 7) : null;
    }
}

<?php

namespace App\Support;

/**
 * Exports open in Excel and Google Sheets, which run a cell that starts
 * with =, +, -, @ (or a tab/return) as a formula. Text from the store's
 * own records (names, notes, references) is neutralised before it is
 * written out.
 */
final class Csv
{
    public static function safe(mixed $value): mixed
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        return preg_match('/^[=+\-@\t\r]/', $value) ? "'".$value : $value;
    }

    /**
     * @param  list<mixed>  $row
     * @return list<mixed>
     */
    public static function row(array $row): array
    {
        return array_map([self::class, 'safe'], $row);
    }
}

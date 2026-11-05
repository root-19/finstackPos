<?php

namespace App\Enums;

/**
 * Owner: full access. Staff: whatever their custom role allows.
 */
enum UserRole: string
{
    case Owner = 'owner';
    case Staff = 'staff';
}

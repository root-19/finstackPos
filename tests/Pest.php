<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * A staff member of the store whose custom role grants exactly $permissions.
 *
 * @param  list<string>  $permissions
 */
function staffWith(array $permissions, ?Merchant $merchant = null): User
{
    $merchant ??= Merchant::factory()->create();

    $role = new Role(['name' => 'Role '.Str::random(6), 'permissions' => $permissions]);
    $role->merchant()->associate($merchant);
    $role->save();

    $user = User::factory()->make();
    $user->merchant()->associate($merchant);
    $user->role = UserRole::Staff;
    $user->staffRole()->associate($role);
    $user->save();

    return $user;
}

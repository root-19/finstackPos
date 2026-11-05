<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Category;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Model events stay on: a new Merchant creates its default roles.
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database with a demo store.
     */
    public function run(): void
    {
        $merchant = Merchant::factory()->create(['name' => 'Demo Sari-Sari Store']);

        $owner = User::factory()->make([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);
        $owner->merchant()->associate($merchant);
        $owner->role = UserRole::Owner;
        $owner->save();

        // The store comes with default Manager and Cashier roles.
        foreach ($merchant->roles as $role) {
            $staff = User::factory()->make([
                'name' => "Demo {$role->name}",
                'email' => strtolower($role->name).'@example.com',
            ]);
            $staff->merchant()->associate($merchant);
            $staff->role = UserRole::Staff;
            $staff->staffRole()->associate($role);
            $staff->save();
        }

        $catalog = [
            'Drinks' => [['Bottled Water 500ml', 1500], ['Cola 1.5L', 8500], ['Iced Coffee', 6500]],
            'Snacks' => [['Potato Chips', 3500], ['Chocolate Bar', 4500], ['Crackers Pack', 1200]],
            'Grocery' => [['Rice 1kg', 5800], ['Instant Noodles', 1600], ['Canned Sardines', 2600]],
        ];

        foreach ($catalog as $categoryName => $items) {
            $category = Category::factory()->for($merchant)->create(['name' => $categoryName]);

            foreach ($items as [$name, $price]) {
                $product = Product::factory()->for($merchant)->create([
                    'category_id' => $category->id,
                    'name' => $name,
                    'price_cents' => $price,
                ]);

                // An example of merchant-defined sizes, each with its own price.
                if ($name === 'Iced Coffee') {
                    $product->syncSizes([
                        ['name' => 'Small', 'price' => 65],
                        ['name' => 'Medium', 'price' => 75],
                        ['name' => 'Large', 'price' => 85],
                        ['name' => 'Extra Large', 'price' => 95],
                    ]);
                }
            }
        }
    }
}

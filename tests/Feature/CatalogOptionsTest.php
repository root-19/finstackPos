<?php

use App\Enums\UserRole;
use App\Models\Category;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\SaleItem;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function catalogOwner(): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function sizes(): array
{
    return [
        ['id' => null, 'name' => 'Small', 'price' => '100'],
        ['id' => null, 'name' => 'Medium', 'price' => '120'],
        ['id' => null, 'name' => 'Large', 'price' => '170.50'],
    ];
}

function productFields(array $overrides = []): array
{
    return array_merge(['name' => 'Latte', 'sku' => 'LAT', 'price' => '120', 'is_active' => true], $overrides);
}

test('categories are just names', function () {
    $user = catalogOwner();

    $this->actingAs($user)->post('/categories', ['name' => 'Drinks'])->assertSessionHasNoErrors();
    $category = Category::firstWhere('name', 'Drinks');
    expect($category->merchant_id)->toBe($user->merchant_id);

    $this->put("/categories/{$category->id}", ['name' => 'Beverages'])->assertSessionHasNoErrors();
    expect($category->fresh()->name)->toBe('Beverages');
});

test('another store\'s category cannot be renamed', function () {
    $foreign = Category::factory()->create();

    $this->actingAs(catalogOwner())
        ->put("/categories/{$foreign->id}", ['name' => 'Hijack'])
        ->assertNotFound();
});

test('each size keeps its own full price', function () {
    $user = catalogOwner();

    $this->actingAs($user)->post('/products', productFields([
        'price' => null,
        'sizes' => sizes(),
    ]))->assertSessionHasNoErrors();

    $product = Product::firstWhere('sku', 'LAT');

    expect($product->sizes->pluck('name')->all())->toBe(['Small', 'Medium', 'Large'])
        ->and($product->sizes->pluck('price_cents')->all())->toBe([10000, 12000, 17050])
        // Listed at its cheapest size.
        ->and($product->price_cents)->toBe(10000);
});

test('a product without sizes needs a price', function () {
    $this->actingAs(catalogOwner())
        ->post('/products', productFields(['price' => null]))
        ->assertSessionHasErrors('price');
});

test('updating sizes keeps, edits, adds, and removes them by id', function () {
    $user = catalogOwner();
    $this->actingAs($user)->post('/products', productFields(['sizes' => sizes()]));
    $product = Product::firstWhere('sku', 'LAT');
    [$small, $medium] = $product->sizes;

    $this->put("/products/{$product->id}", productFields([
        'sizes' => [
            ['id' => $medium->id, 'name' => 'Grande', 'price' => '150'],
            ['id' => null, 'name' => 'Venti', 'price' => '190'],
        ],
    ]))->assertSessionHasNoErrors();

    $sizes = $product->fresh()->sizes;
    expect($sizes->pluck('name')->all())->toBe(['Grande', 'Venti'])
        ->and($sizes[0]->id)->toBe($medium->id)
        ->and($product->fresh()->price_cents)->toBe(15000)
        ->and($small->fresh())->toBeNull();
});

test('leaving out the sizes removes them', function () {
    $user = catalogOwner();
    $this->actingAs($user)->post('/products', productFields(['sizes' => sizes()]));
    $product = Product::firstWhere('sku', 'LAT');

    // Multipart forms drop empty arrays, so "no sizes" means none.
    $this->put("/products/{$product->id}", productFields(['price' => '99']))->assertSessionHasNoErrors();

    expect($product->fresh()->sizes)->toHaveCount(0)
        ->and($product->fresh()->price_cents)->toBe(9900);
});

test('size ids from another product are never reused', function () {
    $user = catalogOwner();
    $this->actingAs($user)->post('/products', productFields(['sizes' => sizes()]));
    $this->post('/products', productFields(['name' => 'Cake', 'sku' => 'CAKE']));
    $latteSmall = Product::firstWhere('sku', 'LAT')->sizes->first();
    $cake = Product::firstWhere('sku', 'CAKE');

    $this->put("/products/{$cake->id}", productFields([
        'name' => 'Cake', 'sku' => 'CAKE',
        'sizes' => [['id' => $latteSmall->id, 'name' => 'Slice', 'price' => '80']],
    ]))->assertSessionHasNoErrors();

    expect($latteSmall->fresh()->name)->toBe('Small')
        ->and($cake->fresh()->sizes->first()->id)->not->toBe($latteSmall->id);
});

test('size names must be unique per product', function () {
    $this->actingAs(catalogOwner())->post('/products', productFields([
        'sizes' => [['name' => 'Small', 'price' => '1'], ['name' => 'small', 'price' => '2']],
    ]))->assertSessionHasErrors('sizes.1.name');
});

test('the pos catalog includes sizes with their prices and product images', function () {
    $user = catalogOwner();
    $this->actingAs($user)->post('/products', productFields(['sizes' => sizes()]));
    Product::firstWhere('sku', 'LAT')->update(['image_path' => 'products/1/a.jpg']);

    $response = $this->getJson('/pos/sync/catalog')->assertOk();

    expect($response->json('products.0.sizes.2'))->toMatchArray(['name' => 'Large', 'price_cents' => 17050])
        ->and($response->json('products.0.image_url'))->toBe('/storage/products/1/a.jpg');
});

test('changing only the sizes makes pos devices re-pull the product', function () {
    $user = catalogOwner();
    $this->actingAs($user)->post('/products', productFields());
    $product = Product::firstWhere('sku', 'LAT');

    $since = $this->getJson('/pos/sync/catalog')->json('server_time');
    $this->travel(5)->seconds();
    $this->put("/products/{$product->id}", productFields(['sizes' => sizes()]));

    $this->getJson('/pos/sync/catalog?since='.urlencode($since))
        ->assertJsonPath('products.0.id', $product->id)
        ->assertJsonPath('products.0.sizes.0.name', 'Small');
});

test('a product photo can be uploaded, replaced, and removed', function () {
    Storage::fake('public');
    $user = catalogOwner();

    $this->actingAs($user)->post('/products', productFields([
        'image' => UploadedFile::fake()->image('latte.jpg'),
    ]))->assertSessionHasNoErrors();

    $product = Product::firstWhere('sku', 'LAT');
    $first = $product->image_path;
    expect($first)->toStartWith("products/{$user->merchant_id}/");
    Storage::disk('public')->assertExists($first);

    $this->put("/products/{$product->id}", productFields([
        'image' => UploadedFile::fake()->image('latte2.png'),
    ]))->assertSessionHasNoErrors();
    $second = $product->fresh()->image_path;
    Storage::disk('public')->assertMissing($first);
    Storage::disk('public')->assertExists($second);

    $this->put("/products/{$product->id}", productFields(['remove_image' => true]));
    expect($product->fresh()->image_path)->toBeNull();
    Storage::disk('public')->assertMissing($second);
});

test('non-image uploads are rejected', function () {
    Storage::fake('public');

    $this->actingAs(catalogOwner())->post('/products', productFields([
        'image' => UploadedFile::fake()->create('virus.php', 10, 'application/x-php'),
    ]))->assertSessionHasErrors('image');
});

test('synced sales record the chosen size at its own price, even for the same product twice', function () {
    $user = catalogOwner();
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 10000, 'stock' => 10]);

    $this->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => (string) Str::uuid(),
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 100000,
        'items' => [
            ['product_id' => $product->id, 'quantity' => 1, 'unit_price_cents' => 10000,
                'options' => [['group' => 'Size', 'value' => 'Small', 'price_cents' => 10000]]],
            ['product_id' => $product->id, 'quantity' => 2, 'unit_price_cents' => 17000,
                'options' => [['group' => 'Size', 'value' => 'Large', 'price_cents' => 17000]]],
        ],
    ]]])->assertOk()->assertJsonCount(1, 'synced');

    $items = SaleItem::orderBy('id')->get();
    expect($items)->toHaveCount(2)
        ->and($items[1]->options)->toBe([['group' => 'Size', 'value' => 'Large', 'price_cents' => 17000]])
        ->and($items[1]->line_total_cents)->toBe(34000)
        ->and($product->fresh()->stock)->toBe(7);
});

<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function settingsUser(UserRole $role = UserRole::Owner, array $merchant = []): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create($merchant));
    $user->role = $role;
    $user->save();

    return $user;
}

function settingsPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Kape ni Juan',
        'address' => 'Quezon City',
        'tin' => '123-456-789-000',
        'contact_number' => '0917 000 0000',
        'receipt_footer' => 'Salamat po!',
        'receipt_paper_mm' => 58,
        'auto_print_receipt' => true,
        'tax_rate' => '12',
        'prices_include_tax' => true,
        'senior_discount_enabled' => true,
        'pwd_discount_enabled' => true,
        'discount_rate' => '20',
        'discount_vat_exempt' => true,
        'service_charge' => '10',
        'manual_qr_enabled' => false,
        'manual_qr_label' => null,
        'paymongo_enabled' => false,
        'paymongo_secret_key' => null,
    ], $overrides);
}

function qrSale(Product $product, array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 100000,
        'items' => [['product_id' => $product->id, 'quantity' => 1, 'unit_price_cents' => $product->price_cents]],
    ], $overrides);
}

// Settings

test('only owners can manage settings', function () {
    $this->actingAs(settingsUser())->get('/settings')->assertOk();

    // Even a role with every assignable permission can't open settings.
    $this->actingAs(staffWith(['pos.sell', 'products.manage', 'categories.manage', 'sales.view']))
        ->get('/settings')
        ->assertForbidden();
});

test('settings are saved with percentages stored as basis points', function () {
    $user = settingsUser();

    $this->actingAs($user)->put('/settings', settingsPayload())->assertSessionHasNoErrors();

    $merchant = $user->merchant->fresh();
    expect($merchant->name)->toBe('Kape ni Juan')
        ->and($merchant->tin)->toBe('123-456-789-000')
        ->and($merchant->receipt_paper_mm)->toBe(58)
        ->and($merchant->tax_rate_bps)->toBe(1200)
        ->and($merchant->discount_rate_bps)->toBe(2000)
        ->and($merchant->service_charge_bps)->toBe(1000)
        ->and($merchant->auto_print_receipt)->toBeTrue();
});

test('the paymongo key is encrypted, never sent to the browser, and kept when left blank', function () {
    $user = settingsUser();
    $key = 'sk_test_'.Str::random(24);

    $this->actingAs($user)->put('/settings', settingsPayload([
        'paymongo_enabled' => true,
        'paymongo_secret_key' => $key,
    ]))->assertSessionHasNoErrors();

    $raw = DB::table('merchants')->where('id', $user->merchant_id)->value('paymongo_secret_key');
    expect($raw)->not->toContain($key)
        ->and($user->merchant->fresh()->paymongo_secret_key)->toBe($key);

    $page = $this->get('/settings')->assertOk();
    expect($page->getContent())->not->toContain($key);
    $page->assertInertia(fn ($p) => $p->where('settings.paymongo_key_hint', 'sk_test_••••'.substr($key, -4)));

    // Blank keeps the saved key.
    $this->put('/settings', settingsPayload(['paymongo_enabled' => true]))->assertSessionHasNoErrors();
    expect($user->merchant->fresh()->paymongo_secret_key)->toBe($key);

    // The POS catalog only says whether PayMongo is chosen and ready.
    $catalog = $this->getJson('/pos/sync/catalog')->assertOk();
    expect($catalog->getContent())->not->toContain($key)
        ->and($catalog->json('merchant.paymongo_enabled'))->toBeTrue()
        ->and($catalog->json('merchant.paymongo_ready'))->toBeTrue();
});

test('payment options need what they depend on', function () {
    $this->actingAs(settingsUser())->put('/settings', settingsPayload([
        'paymongo_enabled' => true,
        'manual_qr_enabled' => true,
    ]))->assertSessionHasErrors(['paymongo_secret_key', 'manual_qr_image', 'qr_mode']);

    $this->put('/settings', settingsPayload(['paymongo_secret_key' => 'pk_live_wrongkey']))
        ->assertSessionHasErrors('paymongo_secret_key');
});

test('the manual qr picture can be uploaded', function () {
    Storage::fake('public');
    $user = settingsUser();

    $this->actingAs($user)->put('/settings', settingsPayload([
        'manual_qr_enabled' => true,
        'manual_qr_label' => 'GCash',
        'manual_qr_image' => UploadedFile::fake()->image('gcash.png'),
    ]))->assertSessionHasNoErrors();

    $path = $user->merchant->fresh()->manual_qr_image_path;
    Storage::disk('public')->assertExists($path);
    expect($user->merchant->fresh()->posSettings()['manual_qr_image_url'])->toBe('/storage/'.$path);
});

// Discounts & service charge

test('a senior discount removes vat, then takes 20 percent off, then adds service charge', function () {
    $user = settingsUser(merchant: ['tax_rate_bps' => 1200, 'prices_include_tax' => true, 'service_charge_bps' => 1000]);
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 11200]);
    $sale = qrSale($product, [
        'discount_type' => 'senior',
        'discount_id_number' => 'SC-123',
        'discount_customer_name' => 'Maria Santos',
    ]);

    $this->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [$sale]])
        ->assertJsonPath('synced', [$sale['client_uuid']]);

    $stored = Sale::firstWhere('client_uuid', $sale['client_uuid']);
    expect($stored->vat_exempt_cents)->toBe(1200)   // ₱112 → ₱100 without VAT
        ->and($stored->discount_cents)->toBe(2000)   // 20% of ₱100
        ->and($stored->tax_cents)->toBe(0)
        ->and($stored->service_charge_cents)->toBe(800) // 10% of ₱80
        ->and($stored->total_cents)->toBe(8800)
        ->and($stored->discount_customer_name)->toBe('Maria Santos');
});

test('a pwd sale records what the cashier saw on the doh registry', function () {
    $user = settingsUser(merchant: ['pwd_discount_enabled' => true]);
    $product = Product::factory()->for($user->merchant)->create();
    $pwd = fn (string $id, array $extra = []) => qrSale($product, ['discount_type' => 'pwd', 'discount_id_number' => $id, 'discount_customer_name' => 'Juan Cruz', ...$extra]);
    $found = $pwd('13-7404-000-0000001', ['discount_doh_check' => 'found']);
    $notFound = $pwd('13-7404-000-0000002', ['discount_doh_check' => 'not_found']);
    $unchecked = $pwd('13-7404-000-0000003');
    // Only PWD IDs are on the DOH registry.
    $senior = qrSale($product, ['discount_type' => 'senior', 'discount_id_number' => 'SC-1', 'discount_customer_name' => 'Lola', 'discount_doh_check' => 'found']);

    // Not found, or not checked, is never a reason to refuse the discount.
    $this->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [$found, $notFound, $unchecked, $senior]])->assertJsonCount(4, 'synced');

    $check = fn (array $sale) => Sale::firstWhere('client_uuid', $sale['client_uuid'])->discount_doh_check;
    expect($check($found))->toBe('found')
        ->and($check($notFound))->toBe('not_found')
        ->and($check($unchecked))->toBeNull()
        ->and($check($senior))->toBeNull();

    $this->get('/sales/'.Sale::firstWhere('client_uuid', $notFound['client_uuid'])->id)
        ->assertInertia(fn ($p) => $p->where('sale.discount_doh_check', 'not_found'));

    // Anything else is not a DOH result.
    $this->postJson('/pos/sync/sales', ['sales' => [$pwd('13-7404-000-0000004', ['discount_doh_check' => 'legit'])]])->assertJsonCount(1, 'rejected');
});

test('a discount the store turned off is rejected, and it needs the id and name', function () {
    $user = settingsUser(merchant: ['pwd_discount_enabled' => false]);
    $product = Product::factory()->for($user->merchant)->create();

    $this->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [
        qrSale($product, ['discount_type' => 'pwd', 'discount_id_number' => '1', 'discount_customer_name' => 'A']),
        qrSale($product, ['discount_type' => 'senior']),
    ]])->assertJsonCount(0, 'synced')->assertJsonCount(2, 'rejected');
});

// PayMongo QR Ph

function fakePayMongo(string $status = 'awaiting_next_action'): void
{
    Http::fake([
        'api.paymongo.com/v1/payment_intents' => Http::response(['data' => [
            'id' => 'pi_test123', 'attributes' => ['client_key' => 'pi_test123_client_x', 'status' => 'awaiting_payment_method'],
        ]]),
        'api.paymongo.com/v1/payment_methods' => Http::response(['data' => ['id' => 'pm_test456']]),
        'api.paymongo.com/v1/payment_intents/pi_test123/attach' => Http::response(['data' => [
            'id' => 'pi_test123', 'attributes' => [
                'status' => 'awaiting_next_action',
                'next_action' => ['type' => 'consume_qr', 'code' => ['image_url' => 'iVBORw0KGgo=']],
            ],
        ]]),
        'api.paymongo.com/v1/payment_intents/pi_test123' => Http::response(['data' => [
            'id' => 'pi_test123', 'attributes' => ['status' => $status],
        ]]),
    ]);
}

function paymongoUser(): User
{
    $user = settingsUser();
    $user->merchant->forceFill(['paymongo_enabled' => true, 'paymongo_secret_key' => 'sk_test_abc'])->save();

    return $user;
}

test('the pos can create a qr ph code and poll it until paid', function () {
    fakePayMongo('succeeded');
    $user = paymongoUser();

    $this->actingAs($user)->postJson('/pos/payments/qrph', ['amount_cents' => 15000])
        ->assertOk()
        ->assertJsonPath('id', 'pi_test123')
        ->assertJsonPath('qr_image', 'data:image/png;base64,iVBORw0KGgo=');

    Http::assertSent(fn ($request) => $request->url() === 'https://api.paymongo.com/v1/payment_intents'
        && $request['data']['attributes']['amount'] === 15000
        && $request['data']['attributes']['payment_method_allowed'] === ['qrph']
        && $request->hasHeader('Authorization', 'Basic '.base64_encode('sk_test_abc:')));

    $this->getJson('/pos/payments/qrph/pi_test123')->assertJsonPath('status', 'succeeded');
    expect(PaymentIntent::firstWhere('provider_id', 'pi_test123')->merchant_id)->toBe($user->merchant_id);
});

test('qr ph is unavailable until paymongo is set up', function () {
    $this->actingAs(settingsUser())->postJson('/pos/payments/qrph', ['amount_cents' => 15000])->assertStatus(422);
});

test('a qr ph sale needs a paid payment of exactly its total, used only once', function () {
    fakePayMongo('succeeded');
    $user = paymongoUser();
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 15000]);
    $this->actingAs($user)->postJson('/pos/payments/qrph', ['amount_cents' => 15000]);

    $paid = qrSale($product, ['payment_method' => 'qrph', 'payment_reference' => 'pi_test123', 'amount_paid_cents' => 15000]);
    $this->postJson('/pos/sync/sales', ['sales' => [$paid]])->assertJsonPath('synced', [$paid['client_uuid']]);
    expect(PaymentIntent::firstWhere('provider_id', 'pi_test123')->sale_id)
        ->toBe(Sale::firstWhere('client_uuid', $paid['client_uuid'])->id);

    // The same payment cannot pay for a second sale.
    $again = qrSale($product, ['payment_method' => 'qrph', 'payment_reference' => 'pi_test123', 'amount_paid_cents' => 15000]);
    $this->postJson('/pos/sync/sales', ['sales' => [$again]])->assertJsonCount(1, 'rejected');
});

test('an unpaid or mismatched qr ph payment is rejected', function () {
    fakePayMongo('awaiting_next_action');
    $user = paymongoUser();
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 15000]);
    $this->actingAs($user)->postJson('/pos/payments/qrph', ['amount_cents' => 15000]);

    $unpaid = qrSale($product, ['payment_method' => 'qrph', 'payment_reference' => 'pi_test123', 'amount_paid_cents' => 15000]);
    $this->postJson('/pos/sync/sales', ['sales' => [$unpaid]])
        ->assertJsonPath('rejected.0.message', 'The QR Ph payment has not been completed.');

    PaymentIntent::query()->update(['status' => 'succeeded']);
    $tooCheap = Product::factory()->for($user->merchant)->create(['price_cents' => 99999]);
    $mismatch = qrSale($tooCheap, ['payment_method' => 'qrph', 'payment_reference' => 'pi_test123', 'amount_paid_cents' => 99999]);
    $this->postJson('/pos/sync/sales', ['sales' => [$mismatch]])
        ->assertJsonPath('rejected.0.message', 'The QR Ph payment amount does not match the sale total.');
});

test('another store\'s qr ph payment can neither be polled nor used', function () {
    fakePayMongo('succeeded');
    $this->actingAs(paymongoUser())->postJson('/pos/payments/qrph', ['amount_cents' => 15000]);

    $other = paymongoUser();
    $product = Product::factory()->for($other->merchant)->create(['price_cents' => 15000]);

    $this->actingAs($other)->getJson('/pos/payments/qrph/pi_test123')->assertNotFound();
    $this->postJson('/pos/sync/sales', ['sales' => [
        qrSale($product, ['payment_method' => 'qrph', 'payment_reference' => 'pi_test123', 'amount_paid_cents' => 15000]),
    ]])->assertJsonCount(1, 'rejected');
});

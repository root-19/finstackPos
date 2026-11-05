<?php

use App\Models\DiningTable;
use App\Models\Product;
use App\Models\Sale;
use App\Models\TableOrder;
use Illuminate\Support\Facades\Http;

/** A Pro store taking table orders, its table, and a ₱100 product. */
function checkoutStore(array $merchant = []): array
{
    $owner = tableOwner();
    $owner->merchant->forceFill($merchant)->save();
    $owner->merchant->mainBranch()->forceFill(['orders_seen_at' => now()])->save();
    $table = tableOf($owner);
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Iced Latte', 'price_cents' => 10000, 'stock' => 5]);

    return [$owner, $table, $product];
}

/** PayMongo answers with the status set by the latest call (the fakes stack, first match wins). */
function fakeTablePayMongo(string $status): void
{
    $GLOBALS['table_paymongo_status'] = $status;
    if (($GLOBALS['table_paymongo_faked'] ?? null) === test()) {
        return;
    }
    $GLOBALS['table_paymongo_faked'] = test();

    Http::fake([
        'api.paymongo.com/v1/payment_intents' => Http::response(['data' => [
            'id' => 'pi_table1', 'attributes' => ['client_key' => 'pi_table1_client', 'status' => 'awaiting_payment_method'],
        ]]),
        'api.paymongo.com/v1/payment_methods' => Http::response(['data' => ['id' => 'pm_table1']]),
        'api.paymongo.com/v1/payment_intents/pi_table1/attach' => Http::response(['data' => [
            'id' => 'pi_table1', 'attributes' => ['status' => 'awaiting_next_action', 'next_action' => ['code' => ['image_url' => 'iVBORw0KGgo=']]],
        ]]),
        'api.paymongo.com/v1/payment_intents/pi_table1' => fn () => Http::response(['data' => ['id' => 'pi_table1', 'attributes' => ['status' => $GLOBALS['table_paymongo_status']]]]),
    ]);
}

function orderOne($test, DiningTable $table, Product $product, string $payment, int $quantity = 1)
{
    return $test->postJson(route('menu.order', $table->token), [
        'items' => [['product_id' => $product->id, 'quantity' => $quantity]],
        'payment_method' => $payment,
    ]);
}

test('the menu offers the payments the store has set up', function () {
    [, $table] = checkoutStore();
    $this->get(route('menu.show', $table->token))->assertInertia(fn ($page) => $page
        ->where('payments.cash', true)
        ->where('payments.qrph', false)
        ->where('payments.ewallet', null));

    [, $qrTable, $product] = checkoutStore(['paymongo_enabled' => true, 'paymongo_secret_key' => 'sk_test_x']);
    $this->get(route('menu.show', $qrTable->token))->assertInertia(fn ($page) => $page->where('payments.qrph', true));

    // Not set up: refused.
    orderOne($this, $table, Product::factory()->create(['merchant_id' => $table->merchant_id, 'stock' => null]), 'qrph')->assertJsonValidationErrors('payment_method');
    orderOne($this, $table, Product::factory()->create(['merchant_id' => $table->merchant_id, 'stock' => null]), 'ewallet')->assertJsonValidationErrors('payment_method');
});

test('a cash order becomes a sale with a receipt when the staff accept it', function () {
    [$owner, $table, $product] = checkoutStore(['service_charge_bps' => 1000]);

    $order = orderOne($this, $table, $product, 'cash', 2)->assertCreated()->json('order');
    expect($order['total_cents'])->toBe(22000)->and($order['payment_status'])->toBe('unpaid');
    expect(Sale::withoutGlobalScopes()->count())->toBe(0);

    $id = TableOrder::withoutGlobalScopes()->sole()->id;
    $this->actingAs($owner)->patchJson("/orders/{$id}", ['status' => 'preparing'])->assertOk()
        ->assertJsonPath('receipt.total_cents', 22000)
        ->assertJsonPath('receipt.service_charge_cents', 2000)
        ->assertJsonPath('receipt.amount_paid_cents', 22000);

    $sale = Sale::withoutGlobalScopes()->sole();
    expect($sale->payment_method->value)->toBe('cash')
        ->and($sale->user_id)->toBe($owner->id)
        ->and($sale->branch_id)->toBe($owner->merchant->mainBranch()->id)
        ->and($product->fresh()->stock)->toBe(3);

    $tableOrder = TableOrder::withoutGlobalScopes()->sole();
    expect($tableOrder->payment_status)->toBe('paid')->and($tableOrder->status)->toBe('preparing')->and($tableOrder->sale_id)->toBe($sale->id);

    auth()->logout();
    $this->getJson(route('menu.state', ['token' => $table->token, 'orders' => [$order['token']]]))
        ->assertJsonPath('orders.0.paid', true)
        ->assertJsonPath('orders.0.status', 'preparing');
});

test('a QR Ph order pays by itself, then the staff accept it', function () {
    fakeTablePayMongo('awaiting_next_action');
    [$owner, $table, $product] = checkoutStore(['paymongo_enabled' => true, 'paymongo_secret_key' => 'sk_test_x']);

    $order = orderOne($this, $table, $product, 'qrph')->assertCreated()->json('order');
    expect($order['qr_image'])->toBe('data:image/png;base64,iVBORw0KGgo=')->and($order['paid'])->toBeFalse();
    $id = TableOrder::withoutGlobalScopes()->sole()->id;

    // Not paid yet: staff can't accept it.
    $this->travel(5)->seconds();
    $this->actingAs($owner)->patchJson("/orders/{$id}", ['status' => 'preparing'])->assertStatus(409);
    auth()->logout();

    // The customer pays; their phone's next poll records the sale.
    fakeTablePayMongo('succeeded');
    $this->travel(5)->seconds();
    $this->getJson(route('menu.state', ['token' => $table->token, 'orders' => [$order['token']]]))
        ->assertJsonPath('orders.0.paid', true)
        ->assertJsonPath('orders.0.qr_image', null)
        ->assertJsonPath('orders.0.status', 'new');

    $sale = Sale::withoutGlobalScopes()->sole();
    expect($sale->payment_method->value)->toBe('qrph')->and($sale->payment_reference)->toBe('pi_table1')->and($sale->user_id)->toBeNull();

    // Accepting prints the same sale; it can no longer be rejected.
    $this->actingAs($owner)->patchJson("/orders/{$id}", ['status' => 'rejected'])->assertStatus(409);
    $this->actingAs($owner)->patchJson("/orders/{$id}", ['status' => 'preparing'])->assertOk()->assertJsonPath('receipt.payment_method', 'qrph');
    expect(Sale::withoutGlobalScopes()->count())->toBe(1);
});

test('a store-QR order waits for the customer to say paid and the staff to confirm', function () {
    [$owner, $table, $product] = checkoutStore(['manual_qr_enabled' => true, 'manual_qr_label' => 'GCash']);
    $owner->merchant->forceFill(['manual_qr_image_path' => 'payment-qr/1/qr.png'])->save();

    $this->get(route('menu.show', $table->token))->assertInertia(fn ($page) => $page
        ->where('payments.ewallet.label', 'GCash')
        ->where('payments.ewallet.image_url', '/storage/payment-qr/1/qr.png'));

    $order = orderOne($this, $table, $product, 'ewallet')->assertCreated()->json('order');
    $this->postJson(route('menu.paid', $table->token), ['order' => $order['token'], 'reference' => '1234 567'])->assertOk()
        ->assertJsonPath('order.payment_status', 'awaiting');

    $id = TableOrder::withoutGlobalScopes()->sole()->id;
    $this->actingAs($owner)->getJson('/orders/feed')->assertJsonPath('orders.0.payment_status', 'awaiting')->assertJsonPath('orders.0.payment_reference', '1234 567');
    $this->actingAs($owner)->patchJson("/orders/{$id}", ['status' => 'preparing'])->assertOk()
        ->assertJsonPath('receipt.payment_method', 'ewallet')
        ->assertJsonPath('receipt.payment_reference', '1234 567');

    // Another table can't mark it paid.
    $other = tableOf($owner, 'Table 2');
    $this->postJson(route('menu.paid', $other->token), ['order' => $order['token']])->assertNotFound();
});

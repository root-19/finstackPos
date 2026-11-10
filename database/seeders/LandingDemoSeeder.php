<?php

namespace Database\Seeders;

use App\Enums\PaymentMethod;
use App\Enums\UserRole;
use App\Models\AttendanceRecord;
use App\Models\Category;
use App\Models\DeductionRule;
use App\Models\DiningTable;
use App\Models\Employee;
use App\Models\InventoryItem;
use App\Models\Merchant;
use App\Models\PayrollRun;
use App\Models\Product;
use App\Models\RecipeLine;
use App\Models\SalaryRate;
use App\Models\StockMovement;
use App\Models\TableOrder;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use App\Services\Payroll\PayrollService;
use App\Services\SubscriptionService;
use App\Services\TableOrders\TableOrderPayments;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * A demo café used for the landing page screenshots. Run it by hand only:
 *
 *     php artisan db:seed --class=LandingDemoSeeder
 *
 * It only ever touches its own store (found by slug, owner by email) and is
 * safe to run again: rows that exist are kept, missing ones are added. The
 * owner's password is LANDING_DEMO_PASSWORD, or a new random one each run.
 *
 * Data goes through the app's own models and services (default roles and
 * branch from the Merchant events, InventoryService for stock, the table
 * order settlement for sales, PayrollService for payslips), with the demo
 * owner signed in so every query stays scoped to this store.
 */
class LandingDemoSeeder extends Seeder
{
    public const SLUG = 'landing-demo-kapihan-sa-kanto';

    public const EMAIL = 'landing-demo@finstack.test';

    /** QR code that only says "FINSTACKPOS DEMO - NOT A REAL ACCOUNT". */
    private const DEMO_QR_PNG =
        'iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoCAYAAAB65WHVAAAAAklEQVR4AewaftIAAAhHSURBVO3BwY0dNhIFwOfGRMAbM2D+0TAD'.
        '3piCVgksbAL+Rmumqv769VsAaKcCQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkC'.
        'QEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaOkr/4ExV/iMe3a6GXPl1T07L8Zc+bR7dj5tzJUX9+y8GnOFz7hn55MqALRUAaClCgAt'.
        'VQBoqQJASxUAWqoA0FIFgJYqALRUAaClCgAtVQBo6StN3bPzE425Qg9jrnzaPTvd3LPzE4250k0FgJYqALRUAaClCgAtVQBoqQJA'.
        'SxUAWqoA0FIFgJYqALRUAaClr3wTY650c89OR2Ou/Onu2fm0MVde3bPzYsyVF/fsdDTmSjf37PzpKgC0VAGgpQoALVUAaKkCQEsV'.
        'AFqqANBSBYCWKgC0VAGgpQoALVUAaOkr8Dfu2Xkx5sqrMVde3LPT0Zgr8G+pANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFqqANBS'.
        'BYCWKgC09BX4G2OuvLhn56e6Z+fFmCvw/1QAaKkCQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFr6yjdxzw78m+7Z+bR7'.
        'dr6De3b491UAaKkCQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFqqANDSV5oac4Ue7tl5MebKq3t2Xoy58uqenRdjrry6'.
        'Z+fFmCsv7tn5tDFX6KECQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFqqANDSV/4D9+zAv+menU+7Z+fT7tn5tHt2+DNV'.
        'AGipAkBLFQBaqgDQUgWAlioAtFQBoKUKAC1VAGipAkBLFQBaqgDQ0lf+A2OuvLpn58WYKz/RPTuv7tn504258uqenU8bc+WT7tl5'.
        'NebKT3TPzp+uAkBLFQBaqgDQUgWAlioAtFQBoKUKAC1VAGipAkBLFQBaqgDQ0l+/fss3MOZKN/fsfAdjrvxE9+x82pgr38E9O580'.
        '5sqre3ZejLny6p6dT6oA0FIFgJYqALRUAaClCgAtVQBoqQJASxUAWqoA0FIFgJYqALT0lR/snp1uxlx5cc/OqzFXurln59PGXHkx'.
        '5sp3cM/OizFXvoMxV/50FQBaqgDQUgWAlioAtFQBoKUKAC1VAGipAkBLFQBaqgDQUgWAlioAtPSV/8CYK6/u2elmzJUX9+y8umen'.
        'm3t2voN7dl6MufIdjLny4p6dV2OuvLhn58U9O5825ko3FQBaqgDQUgWAlioAtFQBoKUKAC1VAGipAkBLFQBaqgDQUgWAlv769Vt+'.
        'qDFX/nT37Lwac+WT7tl5NebKp92z82LMle/gnp1uxlx5cc/OT1QBoKUKAC1VAGipAkBLFQBaqgDQUgWAlioAtFQBoKUKAC1VAGip'.
        'AkBLX/kPjLny6p6dT7tn58WYK592z86LMVe6GXPl1T07L8Zc+Q7u2Xkx5spPNOZKR/fsfFIFgJYqALRUAaClCgAtVQBoqQJASxUA'.
        'WqoA0FIFgJYqALRUAaClr/Ax9+y8GnPlxT073Yy5wj8z5sqLe3Y6GnPlk+7ZeTXmyp+uAkBLFQBaqgDQUgWAlioAtFQBoKUKAC1V'.
        'AGipAkBLFQBaqgDQUgWAlv769Vs+bMyVV/fs8PfGXOnmnp1PG3Pl0+7Z+bQxVz7tnp0/3Zgrn3bPTjcVAFqqANBSBYCWKgC0VAGg'.
        'pQoALVUAaKkCQEsVAFqqANBSBYCWvvJNjLny6p6dF2Ou/ET37LwYc+U7GHPlOxhzpZt7dl7cs/MTVQBoqQJASxUAWqoA0FIFgJYq'.
        'ALRUAaClCgAtVQBoqQJASxUAWvrr12/hRxlz5cU9Oy/GXPm0e3a+gzFXXtyz09GYK590z85PVAGgpQoALVUAaKkCQEsVAFqqANBS'.
        'BYCWKgC0VAGgpQoALVUAaKkCQEtf+Q+MucJn3LPz6p6dF2OudDPmCv/MmCsv7tn5tHt2+HsVAFqqANBSBYCWKgC0VAGgpQoALVUA'.
        'aKkCQEsVAFqqANBSBYCWvtLUPTs/0Zgrnzbmyot7dl6MudLRPTsvxlx5dc/OizFXPu2enW7GXPm0e3b+dBUAWqoA0FIFgJYqALRU'.
        'AaClCgAtVQBoqQJASxUAWqoA0FIFgJYqALT0lW9izJVu7tn5DsZc6eaenVdjrry4Z6ebMVd+ont2Pm3MlVf37HxSBYCWKgC0VAGg'.
        'pQoALVUAaKkCQEsVAFqqANBSBYCWKgC0VAGgpa/A37hn58WYK5825sqre3Y+bcyVF/fsvBhz5dPu2Xk15sqLe3Y+bcyVP10FgJYq'.
        'ALRUAaClCgAtVQBoqQJASxUAWqoA0FIFgJYqALRUAaClr8DfGHPlxT07r8Zc+bQxV17cs/Pqnp0XY668uGfnOxhz5cU9O6/u2Xkx'.
        '5ko3FQBaqgDQUgWAlioAtFQBoKUKAC1VAGipAkBLFQBaqgDQUgWAlioAtPSVb+KeHf6Ze3ZejLnyHdyz82LMlVf37Ly4Z+fFmCsd'.
        '3bPzp7tnp5sKAC1VAGipAkBLFQBaqgDQUgWAlioAtFQBoKUKAC1VAGipAkBLX2lqzBU+Y8yVF/fsvBhzhX9mzJVPu2fnxZgrr8Zc'.
        'eXHPzosxV17ds/NizJVX9+x8UgWAlioAtFQBoKUKAC1VAGipAkBLFQBaqgDQUgWAlioAtFQBoKUKAC399eu3ANBOBYCWKgC0VAGg'.
        'pQoALVUAaKkCQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFqqANBSBYCWKgC0VAGgpQoALVUAaKkCQEsVAFr6HwpHgU1J'.
        'LZgZAAAAAElFTkSuQmCC';

    public function run(): void
    {
        $password = env('LANDING_DEMO_PASSWORD') ?: Str::password(16, symbols: false);

        [$merchant, $owner] = DB::transaction(fn () => $this->store($password));

        // Signed in as the demo owner: global scopes keep every query inside
        // this store and new rows are stamped with it, as in the app.
        Auth::guard('web')->setUser($owner);

        $this->subscribe($merchant);
        $this->paymentQr($merchant);
        $products = $this->catalog($merchant);
        $items = $this->inventory();
        $this->recipes($products, $items);
        $this->tablesAndOrders($merchant, $owner, $products);
        $this->workforce($merchant, $owner);

        Auth::guard('web')->forgetUser();

        $this->command?->info('Landing demo store ready: '.$merchant->name.' (merchant #'.$merchant->id.')');
        $this->command?->line('  Login:    '.self::EMAIL);
        $this->command?->line('  Password: '.$password);
    }

    /**
     * @return array{0: Merchant, 1: User}
     */
    private function store(string $password): array
    {
        $merchant = Merchant::query()->where('slug', self::SLUG)->first();

        if (! $merchant) {
            // The created event adds the Manager/Cashier roles, the statutory
            // deduction templates, and the main branch.
            $merchant = Merchant::create([
                'name' => 'Kapihan sa Kanto',
                'slug' => self::SLUG,
                'address' => 'Brgy. San Isidro, Quezon City',
                'tin' => '000-000-000-000',
                'contact_number' => '0900 000 0000',
                'tax_rate_bps' => 1200,
                'prices_include_tax' => true,
                'receipt_footer' => 'Salamat po! Demo store only - not a real business.',
                'manual_qr_enabled' => true,
                'manual_qr_label' => 'GCash',
                'table_ordering_enabled' => true,
            ]);
        }

        $owner = User::query()->where('email', self::EMAIL)->first();

        if ($owner && $owner->merchant_id !== $merchant->id) {
            throw new \RuntimeException(self::EMAIL.' belongs to another store; not touching it.');
        }

        if (! $owner) {
            $owner = new User(['name' => 'Rosa Villanueva', 'email' => self::EMAIL]);
            $owner->merchant()->associate($merchant);
            $owner->role = UserRole::Owner;
        }

        $owner->password = $password;
        $owner->email_verified_at ??= now();
        $owner->save();

        return [$merchant, $owner];
    }

    /** Pro for a year, the way `subscription:grant` does it. */
    private function subscribe(Merchant $merchant): void
    {
        $merchant->refresh();

        if (! $merchant->isSubscribed() || $merchant->subscribed_until->lt(now()->addMonth())) {
            app(SubscriptionService::class)->grant($merchant, 12, 'Landing page demo store');
            $merchant->refresh();
        }
    }

    /** The store's own QR (shown as "GCash" at checkout). Not a real account. */
    private function paymentQr(Merchant $merchant): void
    {
        $disk = Storage::disk('public');

        if ($merchant->manual_qr_image_path && $disk->exists($merchant->manual_qr_image_path)) {
            return;
        }

        $path = 'payment-qr/'.$merchant->id.'/landing-demo-qr.png';
        $disk->put($path, base64_decode(self::DEMO_QR_PNG));

        $merchant->forceFill([
            'manual_qr_enabled' => true,
            'manual_qr_label' => $merchant->manual_qr_label ?: 'GCash',
            'manual_qr_image_path' => $path,
        ])->save();
    }

    /**
     * @return array<string, Product> keyed by name
     */
    private function catalog(Merchant $merchant): array
    {
        // [category, name, sku, price in pesos or sizes, stock (null: not tracked)]
        $catalog = [
            ['Coffee', 'Kape Barako', 'KSK-COF-01', 120, null],
            ['Coffee', 'Spanish Latte', 'KSK-COF-02', 140, null],
            ['Coffee', 'Iced Americano', 'KSK-COF-03', 110, null],
            ['Coffee', 'Caramel Macchiato', 'KSK-COF-04', 160, null],
            ['Drinks', 'Milk Tea', 'KSK-TEA-01', ['Medium' => 110, 'Large' => 130], null],
            ['Drinks', 'Wintermelon Milk Tea', 'KSK-TEA-02', ['Medium' => 115, 'Large' => 135], null],
            ['Drinks', 'Calamansi Juice', 'KSK-REF-01', 60, null],
            ['Drinks', 'Buko Juice', 'KSK-REF-02', 70, 20],
            ['Bakery', 'Pandesal (10 pcs)', 'KSK-BAK-01', 50, 40],
            ['Bakery', 'Ensaymada', 'KSK-BAK-02', 45, 24],
            ['Bakery', 'Turon', 'KSK-BAK-03', 25, 18],
            ['Bakery', 'Ube Cheese Pandesal', 'KSK-BAK-04', 20, 36],
            ['Bakery', 'Banana Bread', 'KSK-BAK-05', 65, 8],
            ['Meals', 'Tapsilog', 'KSK-MEA-01', 150, null],
            ['Meals', 'Longsilog', 'KSK-MEA-02', 140, null],
            ['Meals', 'Pancit Canton', 'KSK-MEA-03', 90, null],
        ];

        $branchId = $merchant->mainBranch()->id;
        $products = [];

        foreach ($catalog as [$categoryName, $name, $sku, $price, $stock]) {
            $category = Category::query()->firstOrCreate(['name' => $categoryName]);
            $product = Product::query()->where('sku', $sku)->first();

            if (! $product) {
                $sizes = is_array($price)
                    ? collect($price)->map(fn ($p, $size) => ['name' => $size, 'price' => $p])->values()->all()
                    : [];

                // As ProductController::saveWithImage: the product, its sizes,
                // and (stock at one branch) that branch's own count.
                DB::transaction(function () use (&$product, $category, $name, $sku, $price, $stock, $sizes, $branchId) {
                    $product = new Product([
                        'category_id' => $category->id,
                        'name' => $name,
                        'sku' => $sku,
                        'price_cents' => (int) round((is_array($price) ? min($price) : $price) * 100),
                        'stock' => $stock,
                        'is_active' => true,
                        'all_branches' => true,
                    ]);
                    $product->save();
                    $product->syncSizes($sizes);

                    if ($stock !== null) {
                        $product->branchRows()->updateOrCreate(['branch_id' => $branchId], ['stock' => $stock]);
                    }
                    $product->touch();
                });
            }

            $products[$name] = $product->fresh('sizes');
        }

        return $products;
    }

    /**
     * Supplies and ingredients, with opening stock recorded the way the
     * Inventory page does it. A few are at or below their reorder level.
     *
     * @return array<string, InventoryItem> keyed by name
     */
    private function inventory(): array
    {
        // [name, sku, category, unit, opening qty, unit cost ₱, reorder level, reorder qty, location]
        $supplies = [
            ['Coffee beans (Barako)', 'INV-001', 'Ingredients', 'kg', 1.2, 620, 2, 5, 'Back shelf'],
            ['Fresh milk', 'INV-002', 'Ingredients', 'L', 9, 98, 4, 12, 'Chiller'],
            ['Tapioca pearls', 'INV-003', 'Ingredients', 'kg', 0.8, 180, 1, 5, 'Back shelf'],
            ['All-purpose flour', 'INV-004', 'Raw materials', 'kg', 12.5, 52, 5, 25, 'Bakery storage'],
            ['Brown sugar', 'INV-005', 'Raw materials', 'kg', 2.5, 75, 3, 10, 'Bakery storage'],
            ['Eggs', 'INV-006', 'Ingredients', 'pcs', 60, 8.5, 30, 90, 'Chiller'],
            ['Paper cups 16 oz', 'INV-007', 'Packaging', 'pcs', 180, 4.2, 100, 500, 'Counter'],
        ];

        $service = app(InventoryService::class);
        $items = [];

        foreach ($supplies as [$name, $sku, $category, $unit, $qty, $cost, $reorder, $reorderQty, $location]) {
            $item = InventoryItem::query()->where('name', $name)->first();

            if (! $item) {
                DB::transaction(function () use (&$item, $service, $name, $sku, $category, $unit, $qty, $cost, $reorder, $reorderQty, $location) {
                    $item = new InventoryItem([
                        'name' => $name,
                        'sku' => $sku,
                        'category' => $category,
                        'unit' => $unit,
                        'reorder_level' => $reorder,
                        'reorder_quantity' => $reorderQty,
                        'location' => $location,
                        'is_active' => true,
                    ]);
                    $item->unit_cost_cents = round($cost * 100, 4);
                    $item->save();

                    $service->move($item, StockMovement::ADJUSTMENT, (float) $qty, [
                        'note' => 'Opening stock',
                        'user_id' => Auth::id(),
                    ]);
                });
            }

            $items[$name] = $item->fresh();
        }

        return $items;
    }

    /**
     * @param  array<string, Product>  $products
     * @param  array<string, InventoryItem>  $items
     */
    private function recipes(array $products, array $items): void
    {
        // [product, ingredient, quantity per unit sold, size name or null for every size]
        $recipes = [
            ['Kape Barako', 'Coffee beans (Barako)', 0.018, null],
            ['Kape Barako', 'Paper cups 16 oz', 1, null],
            ['Spanish Latte', 'Coffee beans (Barako)', 0.018, null],
            ['Spanish Latte', 'Fresh milk', 0.15, null],
            ['Spanish Latte', 'Paper cups 16 oz', 1, null],
            ['Milk Tea', 'Tapioca pearls', 0.04, 'Medium'],
            ['Milk Tea', 'Tapioca pearls', 0.05, 'Large'],
            ['Milk Tea', 'Fresh milk', 0.1, null],
            ['Milk Tea', 'Paper cups 16 oz', 1, null],
        ];

        foreach (collect($recipes)->groupBy(0) as $productName => $lines) {
            $product = $products[$productName];

            if (RecipeLine::query()->where('product_id', $product->id)->exists()) {
                continue;
            }

            foreach ($lines as [, $itemName, $quantity, $sizeName]) {
                RecipeLine::create([
                    'product_id' => $product->id,
                    'option_value_id' => $sizeName ? $product->sizes->firstWhere('name', $sizeName)?->id : null,
                    'inventory_item_id' => $items[$itemName]->id,
                    'quantity' => $quantity,
                ]);
            }
        }
    }

    /**
     * Four tables and, the first time, a few open orders: two waiting to be
     * accepted, one being prepared, one ready. Accepting turns an order into
     * a sale, through the same service the Orders screen uses.
     *
     * @param  array<string, Product>  $products
     */
    private function tablesAndOrders(Merchant $merchant, User $owner, array $products): void
    {
        $branchId = $merchant->mainBranch()->id;
        $tables = [];

        foreach (['Table 1', 'Table 2', 'Table 3', 'Table 4'] as $name) {
            $tables[$name] = DiningTable::query()->firstOrCreate(['branch_id' => $branchId, 'name' => $name]);
        }

        if (TableOrder::query()->exists()) {
            return;
        }

        $line = function (string $name, int $quantity, ?string $size = null, ?string $note = null) use ($products) {
            $product = $products[$name];
            $sizeRow = $size ? $product->sizes->firstWhere('name', $size) : null;

            return [
                'product_id' => $product->id,
                'size_id' => $sizeRow?->id,
                'name' => $product->name,
                'options' => $sizeRow ? [['group' => 'Size', 'value' => $sizeRow->name, 'price_cents' => $sizeRow->price_cents]] : null,
                'unit_price_cents' => $sizeRow ? $sizeRow->price_cents : $product->price_cents,
                'quantity' => $quantity,
                'note' => $note,
            ];
        };

        $orders = [
            // [table, minutes ago, status, payment method, lines, order note]
            ['Table 1', 14, TableOrder::PREPARING, PaymentMethod::Cash, [$line('Tapsilog', 1), $line('Calamansi Juice', 2)], null],
            ['Table 3', 22, TableOrder::READY, PaymentMethod::Cash, [$line('Pancit Canton', 1), $line('Milk Tea', 1, 'Large', 'Less ice'), $line('Spanish Latte', 1)], null],
            ['Table 2', 4, TableOrder::NEW, PaymentMethod::Cash, [$line('Kape Barako', 2), $line('Ensaymada', 2)], null],
            ['Table 4', 2, TableOrder::NEW, PaymentMethod::EWallet, [$line('Milk Tea', 2, 'Medium'), $line('Turon', 2)], 'Paki-init po ang turon'],
        ];

        $payments = app(TableOrderPayments::class);

        foreach ($orders as [$tableName, $minutesAgo, $status, $method, $lines, $note]) {
            $table = $tables[$tableName];
            $placed = now()->subMinutes($minutesAgo);
            $subtotal = collect($lines)->sum(fn ($l) => $l['unit_price_cents'] * $l['quantity']);

            // As TableMenuController::order.
            $order = new TableOrder([
                'branch_id' => $branchId,
                'dining_table_id' => $table->id,
                'table_name' => $table->name,
                'public_token' => (string) Str::uuid(),
                'status' => TableOrder::NEW,
                'note' => $note,
                'subtotal_cents' => $subtotal,
                'total_cents' => $merchant->computeTotals($subtotal)['total'],
                'payment_method' => $method->value,
                'payment_status' => TableOrder::UNPAID,
            ]);
            $order->merchant_id = $merchant->id;
            $order->created_at = $placed;
            $order->updated_at = $placed;
            $order->save();
            $order->items()->createMany($lines);

            if ($method === PaymentMethod::EWallet) {
                // As TableMenuController::paid: the customer says they paid the store's QR.
                $order->forceFill(['payment_status' => TableOrder::AWAITING, 'payment_reference' => 'DEMO123'])->save();
            }

            if ($status !== TableOrder::NEW) {
                // As TableOrderController::update: accepting records the sale.
                $sale = $payments->settle($order, $owner);
                if (is_string($sale)) {
                    throw new \RuntimeException($sale);
                }

                $order->refresh();
                $order->status = $status;
                $order->accepted_at = $placed->copy()->addMinutes(1);
                if ($status === TableOrder::READY) {
                    $order->ready_at = now()->subMinutes(3);
                }
                $order->save();
            }
        }
    }

    private function workforce(Merchant $merchant, User $owner): void
    {
        // The app's own statutory templates, switched on as an owner would.
        DeductionRule::query()
            ->where('merchant_id', $merchant->id)
            ->whereIn('code', [...DeductionRule::STATUTORY, 'withholding_tax'])
            ->update(['enabled' => true, 'verified' => true]);

        // [no, name, position, hired, pay type, rate ₱, allowance ₱ per period]
        $people = [
            ['KSK-001', 'Juan Dela Cruz', 'Barista', '2025-03-01', 'monthly', 16500, 500],
            ['KSK-002', 'Maria Santos', 'Cashier', '2025-06-16', 'monthly', 15000, 500],
            ['KSK-003', 'Jose Reyes', 'Cook', '2024-11-04', 'monthly', 17500, 500],
            ['KSK-004', 'Ana Bautista', 'Baker', '2026-01-12', 'daily', 645, 0],
        ];

        $branchId = $merchant->mainBranch()->id;
        $employees = [];

        foreach ($people as $i => [$no, $name, $position, $hired, $payType, $rate, $allowance]) {
            $employee = Employee::query()->firstOrCreate(['employee_no' => $no], [
                'branch_id' => $branchId,
                'name' => $name,
                'position' => $position,
                'phone' => '0900 000 000'.($i + 1),
                'hired_on' => $hired,
                'status' => 'active',
                // Obvious dummies.
                'sss_no' => '00-0000000-0',
                'philhealth_no' => '00-000000000-0',
                'pagibig_no' => '0000-0000-0000',
                'tin' => '000-000-000-000',
            ]);

            $rateRow = SalaryRate::query()->firstOrNew(['employee_id' => $employee->id, 'effective_from' => $hired]);
            if (! $rateRow->exists) {
                $rateRow->fill([
                    'pay_type' => $payType,
                    'rate_cents' => $rate * 100,
                    'pay_frequency' => 'semi_monthly',
                    'allowance_cents' => $allowance * 100,
                    'overtime_rate_bps' => 12500,
                ]);
                $rateRow->created_by = $owner->id;
                $rateRow->save();
            }

            $employees[$no] = $employee;
        }

        // Attendance for the last finished pay period (Oct 16-31) and this
        // period so far, entered by the owner (approved, as on the Attendance page).
        $tz = $merchant->timezone;
        $today = Carbon::now($tz)->startOfDay();
        $periodStart = $today->copy()->day <= 15
            ? $today->copy()->subMonthNoOverflow()->startOfMonth()->addDays(15)
            : $today->copy()->startOfMonth();
        $periodEnd = $periodStart->day === 16 ? $periodStart->copy()->endOfMonth()->startOfDay() : $periodStart->copy()->addDays(14);
        // The baker misses one working day in the period.
        $absentDay = $periodStart->copy()->addDays(10);
        if ($absentDay->isSunday()) {
            $absentDay->addDay();
        }

        foreach ($employees as $no => $employee) {
            for ($day = $periodStart->copy(); $day->lt($today); $day->addDay()) {
                if ($day->isSunday() || ($no === 'KSK-002' && $day->isMonday())) {
                    continue; // Days off.
                }

                $date = $day->toDateString();
                if (AttendanceRecord::query()->where('employee_id', $employee->id)->whereDate('work_date', $date)->exists()) {
                    continue;
                }

                $absent = $no === 'KSK-004' && $day->eq($absentDay);
                // The cook stays two hours longer on Saturdays.
                $out = $no === 'KSK-003' && $day->isSaturday() ? '18:00' : '16:00';

                $record = new AttendanceRecord([
                    'employee_id' => $employee->id,
                    'work_date' => $date,
                    'type' => $absent ? 'absent' : 'worked',
                    'clock_in_at' => $absent ? null : Carbon::createFromFormat('Y-m-d H:i', "$date 07:00", $tz),
                    'clock_out_at' => $absent ? null : Carbon::createFromFormat('Y-m-d H:i', "$date $out", $tz),
                    'break_minutes' => $absent ? 0 : 60,
                    'note' => $absent ? 'Sick leave (unpaid)' : null,
                ]);
                $record->source = 'manual';
                $record->status = AttendanceRecord::APPROVED;
                $record->approved_by = $owner->id;
                $record->approved_at = now();
                $record->save();
            }
        }

        // One payroll for the last finished period, computed by the app and
        // taken through review and approval to paid.
        if (PayrollRun::query()->exists()) {
            return;
        }

        $payroll = app(PayrollService::class);
        ['run' => $run] = $payroll->create(
            Carbon::parse($periodStart->toDateString()),
            Carbon::parse($periodEnd->toDateString()),
            'semi_monthly',
            collect($employees)->map->id->values()->all(),
            'Demo payroll',
        );

        $payroll->transition($run, PayrollRun::REVIEW);
        $payroll->transition($run->fresh(), PayrollRun::APPROVED);
        $payroll->transition($run->fresh(), PayrollRun::PAID);
    }
}

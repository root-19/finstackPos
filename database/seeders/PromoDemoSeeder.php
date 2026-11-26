<?php

namespace Database\Seeders;

use App\Enums\PaymentMethod;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\Shift;
use App\Models\SupportMessage;
use App\Models\User;
use App\Services\Sales\SaleRecorder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use RuntimeException;

/**
 * Extra data on the landing demo café, for the promo video's screenshots.
 * Run it by hand only:
 *
 *     php artisan db:seed --class=PromoDemoSeeder
 *
 * It runs LandingDemoSeeder first (same store, same login), then adds two
 * more branches, a week of register sales at each branch, this week's
 * published shifts, and a short support conversation. Everything goes
 * through the app's own models and SaleRecorder, and it is safe to run
 * again: a branch's day that already has sales is skipped, so a later run
 * only adds the days since.
 */
class PromoDemoSeeder extends Seeder
{
    /** Not tracked and without a recipe, so other branches never go below zero. */
    private const MENU = ['Iced Americano', 'Caramel Macchiato', 'Wintermelon Milk Tea', 'Calamansi Juice', 'Tapsilog', 'Longsilog', 'Pancit Canton'];

    public function run(): void
    {
        if (app()->isProduction() && ! filter_var(env('LANDING_DEMO_ALLOW_PRODUCTION'), FILTER_VALIDATE_BOOL)) {
            throw new RuntimeException('PromoDemoSeeder refuses to run in production.');
        }

        $this->call(LandingDemoSeeder::class);

        $merchant = Merchant::query()->where('slug', LandingDemoSeeder::SLUG)->firstOrFail();
        $owner = User::query()->where('email', LandingDemoSeeder::EMAIL)->firstOrFail();
        Auth::guard('web')->setUser($owner);

        $branches = $this->branches($merchant);
        $this->sales($merchant, $owner, $branches);
        $this->shifts($merchant);
        $this->support($merchant, $owner);

        Auth::guard('web')->forgetUser();
        $this->command?->info('Promo data added: '.count($branches).' branches, sales, shifts, support thread.');
    }

    /** @return array<string, Branch> */
    private function branches(Merchant $merchant): array
    {
        $main = $merchant->mainBranch();
        if ($main->name === 'Main branch') {
            $main->update(['name' => 'Cubao (Main)']);
        }

        $branches = ['Cubao (Main)' => $main->fresh()];
        foreach (['Katipunan' => 'Katipunan Ave., Quezon City', 'Marikina' => 'Gil Fernando Ave., Marikina'] as $name => $address) {
            $branch = Branch::query()->firstOrNew(['name' => $name]);
            if (! $branch->exists) {
                $branch->address = $address;
                $branch->merchant_id = $merchant->id;
                $branch->save();
            }
            $branches[$name] = $branch;
        }

        return $branches;
    }

    /** Seven days back plus this morning, more at the main branch, more on weekends. */
    private function sales(Merchant $merchant, User $owner, array $branches): void
    {
        $tz = $merchant->timezone;
        $now = Carbon::now($tz);
        $products = Product::query()->with('sizes')->whereIn('name', [...self::MENU, 'Kape Barako', 'Spanish Latte', 'Ensaymada', 'Ube Cheese Pandesal'])->get()->keyBy('name');
        $recorder = app(SaleRecorder::class);
        $perBranch = ['Cubao (Main)' => 9, 'Katipunan' => 7, 'Marikina' => 4];
        mt_srand(20261110);

        for ($daysAgo = 7; $daysAgo >= 0; $daysAgo--) {
            $day = $now->copy()->subDays($daysAgo)->startOfDay();
            $weekend = $day->isWeekend() ? 3 : 0;

            foreach ($perBranch as $branchName => $count) {
                $branch = $branches[$branchName];
                // A day that already has this branch's sales (an earlier run) is left alone.
                $from = $day->copy()->utc();
                if (\App\Models\Sale::query()->where('branch_id', $branch->id)->whereBetween('sold_at', [$from, $from->copy()->addDay()])->count() >= 3) {
                    continue;
                }
                $n = $count + $weekend + mt_rand(0, 3);
                // Today: only the sales up to now (the café opens at 7).
                $lastHour = $daysAgo === 0 ? max(7, $now->hour - 1) : 19;

                for ($k = 0; $k < $n; $k++) {
                    // Today: any minute so far (the demo may be seeded before opening time).
                    $soldAt = $daysAgo === 0
                        ? $day->copy()->setTime(0, 5)->addMinutes(mt_rand(0, max(1, (int) $day->copy()->setTime(0, 5)->diffInMinutes($now) - 1)))
                        : $day->copy()->setTime(mt_rand(7, $lastHour), mt_rand(0, 59));
                    if ($soldAt->gt($now)) {
                        continue;
                    }

                    $menu = $branchName === 'Cubao (Main)' ? [...self::MENU, 'Kape Barako', 'Spanish Latte', 'Ensaymada', 'Ube Cheese Pandesal'] : self::MENU;
                    $items = [];
                    foreach ((array) array_rand(array_flip($menu), mt_rand(1, 3)) as $name) {
                        $product = $products[$name];
                        $size = $product->sizes->isNotEmpty() ? $product->sizes[mt_rand(0, $product->sizes->count() - 1)] : null;
                        $items[] = [
                            'product_id' => $product->id,
                            'unit_price_cents' => $size ? $size->price_cents : $product->price_cents,
                            'quantity' => mt_rand(1, 2),
                            'options' => $size ? [['group' => 'Size', 'value' => $size->name, 'price_cents' => $size->price_cents]] : [],
                        ];
                    }

                    $total = $merchant->computeTotals(collect($items)->sum(fn ($i) => $i['unit_price_cents'] * $i['quantity']))['total'];
                    $cash = mt_rand(0, 9) < 7;
                    $error = $recorder->record($merchant, $owner, $branch->id, [
                        'client_uuid' => $this->uuid("promo-{$branchName}-{$day->toDateString()}-{$k}"),
                        'sold_at' => $soldAt->toIso8601String(),
                        'payment_method' => $cash ? PaymentMethod::Cash->value : PaymentMethod::EWallet->value,
                        'payment_reference' => $cash ? null : 'DEMO'.mt_rand(1000, 9999),
                        'amount_paid_cents' => $cash ? (int) (ceil($total / 10000) * 10000) : $total,
                        'items' => $items,
                    ]);

                    if ($error) {
                        throw new RuntimeException($error);
                    }
                }
            }
        }
    }

    /** This week (Mon-Sat), published, 7:00-16:00 with an hour's break, at each person's branch. */
    private function shifts(Merchant $merchant): void
    {
        $tz = $merchant->timezone;
        $monday = Carbon::now($tz)->startOfWeek(Carbon::MONDAY);

        foreach (Employee::query()->get() as $employee) {
            for ($d = 0; $d < 6; $d++) {
                $day = $monday->copy()->addDays($d);
                if ($employee->employee_no === 'KSK-002' && $day->isMonday()) {
                    continue;
                }
                $start = $day->copy()->setTime(7, 0)->utc();
                if (Shift::query()->where('employee_id', $employee->id)->where('starts_at', $start)->exists()) {
                    continue;
                }
                Shift::create([
                    'employee_id' => $employee->id,
                    'starts_at' => $start,
                    'ends_at' => $day->copy()->setTime(16, 0)->utc(),
                    'break_minutes' => 60,
                    'position' => $employee->position,
                    'status' => Shift::PUBLISHED,
                ]);
            }
        }
    }

    /** A question from the owner and the FinstackPOS team's answer. */
    private function support(Merchant $merchant, User $owner): void
    {
        if (SupportMessage::query()->exists()) {
            return;
        }

        $admin = User::query()->withoutGlobalScopes()->where('is_admin', true)->first();
        $thread = [
            [false, $owner->id, 'Hi! Our new branch uses a 58 mm printer. How do I make the receipt fit?', 40],
            [true, $admin?->id, 'Hi Rosa! Go to Settings and set Receipt paper width to 58 mm. You can also turn on "Print automatically after each sale" there.', 32],
            [false, $owner->id, 'Got it, it prints perfectly now. Salamat po!', 25],
        ];

        foreach ($thread as [$fromAdmin, $userId, $body, $minutesAgo]) {
            if ($fromAdmin && ! $userId) {
                continue;
            }
            $message = new SupportMessage(['user_id' => $userId, 'from_admin' => $fromAdmin, 'body' => $body, 'read_at' => now()]);
            $message->merchant_id = $merchant->id;
            $message->created_at = now()->subMinutes($minutesAgo);
            $message->updated_at = $message->created_at;
            $message->save();
        }
    }

    /** A stable UUID for a name, so reruns find the same sale. */
    private function uuid(string $name): string
    {
        $h = md5($name);

        return sprintf('%s-%s-4%s-a%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 13, 3), substr($h, 17, 3), substr($h, 20, 12));
    }
}

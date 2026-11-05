<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Product options become a plain list of sizes, each with its own full
 * price (Small ₱100, Large ₱170) instead of an amount added to the product
 * price. The numbers merchants already typed are kept as the size prices.
 *
 * Every step is safe to repeat in case a run fails halfway on MySQL.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasColumn('option_values', 'price_delta_cents')) {
            Schema::table('option_values', function (Blueprint $table) {
                $table->renameColumn('price_delta_cents', 'price_cents');
            });
        }

        DB::transaction(function () {
            DB::table('option_groups')->update([
                'name' => 'Size',
                'is_required' => true,
                'allows_multiple' => false,
            ]);

            // A product with sizes is listed at its cheapest size.
            $cheapest = DB::table('option_values')
                ->join('option_groups', 'option_groups.id', '=', 'option_values.option_group_id')
                ->groupBy('option_groups.product_id')
                ->select('option_groups.product_id', DB::raw('min(option_values.price_cents) as price'))
                ->get();

            foreach ($cheapest as $row) {
                DB::table('products')->where('id', $row->product_id)->update([
                    'price_cents' => max(0, (int) $row->price),
                    // POS devices re-pull these products on their next sync.
                    'updated_at' => now(),
                ]);
            }
        });
    }

    /**
     * Reverse the migrations. Prices stay as they are; only the column
     * name goes back.
     */
    public function down(): void
    {
        if (Schema::hasColumn('option_values', 'price_cents')) {
            Schema::table('option_values', function (Blueprint $table) {
                $table->renameColumn('price_cents', 'price_delta_cents');
            });
        }
    }
};

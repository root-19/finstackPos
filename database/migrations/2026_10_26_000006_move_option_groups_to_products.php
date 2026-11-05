<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Options (size, add-ons, ...) now belong to each product instead of its
 * category, since prices per size differ from product to product. Existing
 * category options are copied onto every product in that category.
 *
 * Each step checks what is already done: MySQL can't roll back schema
 * changes, so a run that failed halfway must be safe to repeat.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('option_groups', 'product_id')) {
            Schema::table('option_groups', function (Blueprint $table) {
                $table->foreignId('product_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
            });
        }

        if (Schema::hasColumn('option_groups', 'category_id')) {
            DB::transaction(fn () => $this->copyCategoryOptionsToProducts());

            Schema::table('option_groups', function (Blueprint $table) {
                $table->dropConstrainedForeignId('category_id');
            });
        }
    }

    private function copyCategoryOptionsToProducts(): void
    {
        // Rows still attached only to a category (not yet copied).
        $categoryGroups = DB::table('option_groups')->whereNull('product_id')->get();

        foreach ($categoryGroups as $group) {
            $values = DB::table('option_values')->where('option_group_id', $group->id)->get();
            $productIds = DB::table('products')->where('category_id', $group->category_id)->pluck('id');

            foreach ($productIds as $productId) {
                $newGroupId = DB::table('option_groups')->insertGetId([
                    'product_id' => $productId,
                    // category_id is still NOT NULL here; it is dropped below.
                    'category_id' => $group->category_id,
                    'name' => $group->name,
                    'is_required' => $group->is_required,
                    'allows_multiple' => $group->allows_multiple,
                    'sort_order' => $group->sort_order,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if ($values->isNotEmpty()) {
                    DB::table('option_values')->insert($values->map(fn ($value) => [
                        'option_group_id' => $newGroupId,
                        'name' => $value->name,
                        'price_delta_cents' => $value->price_delta_cents,
                        'sort_order' => $value->sort_order,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ])->all());
                }
            }

            // POS devices re-pull these products on their next sync.
            DB::table('products')->whereIn('id', $productIds)->update(['updated_at' => now()]);
        }

        // Remove the category-level originals (their values cascade).
        DB::table('option_groups')->whereIn('id', $categoryGroups->pluck('id'))->delete();
    }

    /**
     * Reverse the migrations. Product options are dropped; they cannot be
     * folded back into categories without guessing.
     */
    public function down(): void
    {
        DB::table('option_groups')->delete();

        Schema::table('option_groups', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_id');
            $table->foreignId('category_id')->after('id')->constrained()->cascadeOnDelete();
        });
    }
};

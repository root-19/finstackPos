<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A product at one branch: sold there (when the product isn't sold at every
 * branch) and that branch's own stock of it (null: not tracked).
 */
class BranchProduct extends Model
{
    protected $table = 'branch_product';

    public $timestamps = false;

    protected $fillable = [
        'product_id',
        'branch_id',
        'stock',
    ];

    protected function casts(): array
    {
        return [
            'stock' => 'integer',
        ];
    }
}

<?php

namespace App\Models\Concerns;

use App\Models\Merchant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Tenant isolation: whenever a user is authenticated, queries only ever see
 * rows of that user's merchant, and new rows are stamped with it.
 */
trait BelongsToMerchant
{
    protected static function bootBelongsToMerchant(): void
    {
        static::addGlobalScope('merchant', function (Builder $builder) {
            if (Auth::check()) {
                // A user without a merchant matches nothing (WHERE merchant_id IS NULL).
                $builder->where($builder->qualifyColumn('merchant_id'), Auth::user()->merchant_id);
            }
        });

        static::creating(function (Model $model) {
            if (! $model->merchant_id && Auth::check()) {
                $model->merchant_id = Auth::user()->merchant_id;
            }
        });
    }

    public function merchant(): BelongsTo
    {
        return $this->belongsTo(Merchant::class);
    }
}

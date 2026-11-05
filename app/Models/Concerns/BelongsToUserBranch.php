<?php

namespace App\Models\Concerns;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Staff tied to one branch only ever see that branch's rows (its sales,
 * tables, and orders), on every page and report. Everyone else sees the
 * whole store, as before.
 */
trait BelongsToUserBranch
{
    protected static function bootBelongsToUserBranch(): void
    {
        static::addGlobalScope('branch', function (Builder $builder) {
            if (Auth::check() && Auth::user()->branch_id !== null) {
                $builder->where($builder->qualifyColumn('branch_id'), Auth::user()->branch_id);
            }
        });
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}

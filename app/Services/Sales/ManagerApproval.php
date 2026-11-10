<?php

namespace App\Services\Sales;

use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * A manager approving a void or refund at the register with their own PIN.
 * Each manager sets their PIN themselves (Profile), so no one else knows it.
 */
class ManagerApproval
{
    /** Wrong PINs allowed per manager per minute before it locks for a while. */
    private const ATTEMPTS = 5;

    /**
     * Who may approve for this user at this sale's branch: managers of the
     * same store (owners, or roles with Void & refund) who have set a PIN
     * and work at that branch or at every branch.
     *
     * @return Collection<int, User>
     */
    public function approvers(User $actor, ?int $branchId): Collection
    {
        return User::query()
            ->where('merchant_id', $actor->merchant_id)
            ->whereNotNull('manager_pin')
            ->when($branchId, fn ($q) => $q->where(fn ($w) => $w->whereNull('branch_id')->orWhere('branch_id', $branchId)))
            ->with('staffRole')
            ->orderBy('name')
            ->get()
            ->filter(fn (User $u) => $u->canApproveVoids())
            ->values();
    }

    /**
     * The approving manager, after checking their PIN. Throws a validation
     * error (on "approver_pin") for a wrong PIN or someone who can't approve.
     *
     * @throws ValidationException
     */
    public function verify(User $actor, Sale $sale, int $approverId, string $pin): User
    {
        $key = "manager-pin:{$actor->merchant_id}:{$approverId}";

        if (RateLimiter::tooManyAttempts($key, self::ATTEMPTS)) {
            throw ValidationException::withMessages([
                'approver_pin' => 'Too many wrong PINs. Try again in '.RateLimiter::availableIn($key).' seconds.',
            ]);
        }

        $approver = $this->approvers($actor, $sale->branch_id)->firstWhere('id', $approverId);

        if ($approver === null || ! Hash::check($pin, $approver->manager_pin)) {
            RateLimiter::hit($key, 300);

            throw ValidationException::withMessages([
                'approver_pin' => $approver === null ? 'This manager can’t approve here.' : 'Wrong PIN.',
            ]);
        }

        RateLimiter::clear($key);

        return $approver;
    }

    /**
     * Who approves this action: nobody when the user may do it themselves,
     * else the manager whose PIN was entered.
     *
     * @param  array{approver_id?: int|null, approver_pin?: string|null}  $data
     *
     * @throws ValidationException
     */
    public function resolve(User $actor, Sale $sale, array $data): ?User
    {
        if ($actor->canApproveVoids()) {
            return null;
        }

        if (empty($data['approver_id']) || empty($data['approver_pin'])) {
            throw ValidationException::withMessages([
                'approver_pin' => 'A manager has to approve this. Choose a manager and enter their PIN.',
            ]);
        }

        return $this->verify($actor, $sale, (int) $data['approver_id'], (string) $data['approver_pin']);
    }
}

<?php

namespace App\Http\Requests\Sales;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared by voids and refunds: reachable from Sales (sales.view) and from
 * the register's receipt lookup (pos.sell). Whether the user may do it
 * themselves or needs a manager's PIN is decided by ManagerApproval.
 */
abstract class SaleAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('sales.view') || $this->user()->can('pos.sell');
    }

    /**
     * @return array<string, array<mixed>>
     */
    protected function approvalRules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:200'],
            'restock' => ['required', 'boolean'],
            'approver_id' => ['nullable', 'integer'],
            'approver_pin' => ['nullable', 'string', 'regex:/^\d{4,6}$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'approver_pin.regex' => 'A PIN is 4 to 6 digits.',
            'reason.required' => 'Say why, for the audit log.',
        ];
    }
}

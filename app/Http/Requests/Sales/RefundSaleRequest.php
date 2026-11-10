<?php

namespace App\Http\Requests\Sales;

use App\Enums\PaymentMethod;
use Illuminate\Validation\Rule;

class RefundSaleRequest extends SaleAdjustmentRequest
{
    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return [
            ...$this->approvalRules(),
            // Made by the screen: a double tap or retry never refunds twice.
            'client_uuid' => ['required', 'uuid'],
            // How the money went back to the customer.
            'method' => ['required', Rule::enum(PaymentMethod::class)],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.sale_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:9999'],
        ];
    }
}

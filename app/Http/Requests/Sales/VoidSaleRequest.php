<?php

namespace App\Http\Requests\Sales;

class VoidSaleRequest extends SaleAdjustmentRequest
{
    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return $this->approvalRules();
    }
}

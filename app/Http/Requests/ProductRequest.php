<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $merchantId = $this->user()->merchant_id;
        /** @var Product|null $product */
        $product = $this->route('product');

        return [
            'name' => ['required', 'string', 'max:255'],
            'sku' => [
                'required', 'string', 'max:64',
                Rule::unique(Product::class)->where('merchant_id', $merchantId)->ignore($product),
            ],
            // QR codes can hold a URL or other long text, not just a product number.
            'barcode' => ['nullable', 'string', 'max:255'],
            'category_id' => [
                'nullable', 'integer',
                Rule::exists('categories', 'id')->where('merchant_id', $merchantId)->whereNull('deleted_at'),
            ],
            // With sizes, each size carries its own price instead.
            'price' => ['required_without:sizes', 'nullable', 'numeric', 'min:0', 'max:9999999.99', 'decimal:0,2'],
            'stock' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'is_active' => ['required', 'boolean'],
            // Sold at every branch, or only at branch_ids.
            'all_branches' => ['sometimes', 'boolean'],
            'branch_ids' => [Rule::requiredIf(fn () => ! $this->boolean('all_branches', true)), 'nullable', 'array', 'min:1'],
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('merchant_id', $merchantId)],
            // Each branch's own stock, keyed by branch id (stores with several branches).
            'branch_stock' => ['nullable', 'array'],
            'branch_stock.*' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'remove_image' => ['sometimes', 'boolean'],
            // Merchant-defined sizes, each with its own full price.
            // Multipart drops empty arrays, so a missing list means "none".
            'sizes' => ['sometimes', 'array', 'min:1', 'max:30'],
            'sizes.*.id' => ['nullable', 'integer'],
            'sizes.*.name' => ['required', 'string', 'max:60', 'distinct:ignore_case'],
            'sizes.*.price' => ['required', 'numeric', 'min:0', 'max:9999999.99', 'decimal:0,2'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'branch_ids.required' => 'Choose at least one branch, or sell it at all branches.',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'branch_stock.*' => 'branch stock',
            'sizes.*.name' => 'size name',
            'sizes.*.price' => 'size price',
        ];
    }

    /**
     * @return array<int, array{id?: int|null, name: string, price: numeric-string}>
     */
    public function sizes(): array
    {
        return $this->validated('sizes', []);
    }

    /**
     * The validated input mapped onto Product attributes (image excluded).
     * A product with sizes is listed at its cheapest size.
     *
     * @return array<string, mixed>
     */
    public function productAttributes(): array
    {
        $data = $this->safe()->except(['image', 'remove_image', 'price', 'sizes', 'branch_ids', 'branch_stock']);
        $data['all_branches'] = $this->boolean('all_branches', true);
        $prices = $this->sizes() !== []
            ? array_column($this->sizes(), 'price')
            : [$this->validated('price')];
        $data['price_cents'] = (int) round(min($prices) * 100);

        return $data;
    }
}

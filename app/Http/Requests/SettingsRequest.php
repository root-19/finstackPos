<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SettingsRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $percent = ['required', 'numeric', 'min:0', 'max:100', 'decimal:0,2'];

        return [
            // Business & receipt
            'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'tin' => ['nullable', 'string', 'max:30'],
            'contact_number' => ['nullable', 'string', 'max:30'],
            'receipt_footer' => ['nullable', 'string', 'max:500'],
            'receipt_paper_mm' => ['required', 'integer', 'in:58,80'],
            'auto_print_receipt' => ['required', 'boolean'],

            // Tax
            'tax_rate' => $percent,
            'prices_include_tax' => ['required', 'boolean'],

            // Discounts & service charge
            'senior_discount_enabled' => ['required', 'boolean'],
            'pwd_discount_enabled' => ['required', 'boolean'],
            'discount_rate' => $percent,
            'discount_vat_exempt' => ['required', 'boolean'],
            'service_charge' => $percent,

            // Payments
            'manual_qr_enabled' => ['required', 'boolean'],
            'manual_qr_label' => ['nullable', 'string', 'max:60'],
            'manual_qr_image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'remove_manual_qr_image' => ['sometimes', 'boolean'],
            'paymongo_enabled' => ['required', 'boolean'],
            // Write-only: blank keeps the saved key.
            'paymongo_secret_key' => ['nullable', 'string', 'max:200', 'starts_with:sk_live_,sk_test_'],
            'remove_paymongo_key' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'paymongo_secret_key.starts_with' => 'Use your PayMongo secret key (it starts with sk_live_ or sk_test_).',
        ];
    }

    /**
     * Turning on a payment option needs what it depends on.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                $merchant = $this->user()->merchant;

                $hasQrImage = $this->hasFile('manual_qr_image')
                    || ($merchant->manual_qr_image_path && ! $this->boolean('remove_manual_qr_image'));

                if ($this->boolean('manual_qr_enabled') && ! $hasQrImage) {
                    $validator->errors()->add('manual_qr_image', 'Upload your QR code picture to turn on QR payments.');
                }

                $hasKey = filled($this->input('paymongo_secret_key'))
                    || (filled($merchant->paymongo_secret_key) && ! $this->boolean('remove_paymongo_key'));

                if ($this->boolean('paymongo_enabled') && ! $hasKey) {
                    $validator->errors()->add('paymongo_secret_key', 'Enter your PayMongo secret key to turn on QR Ph.');
                }

                // Checkout shows one QR, so the store picks one source.
                if ($this->boolean('manual_qr_enabled') && $this->boolean('paymongo_enabled')) {
                    $validator->errors()->add('qr_mode', 'Choose one QR payment method: your own QR or PayMongo QR Ph.');
                }
            },
        ];
    }
}

<?php

namespace App\Http\Controllers;

use App\Http\Requests\SettingsRequest;
use App\Models\Merchant;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Store settings: receipt details, tax, discounts, service charge, and
 * payment options. Owner only.
 */
class SettingsController extends Controller
{
    public function edit(Request $request): Response
    {
        $merchant = $request->user()->merchant;

        return Inertia::render('Settings/Edit', [
            'settings' => [
                ...$merchant->posSettings(),
                'paymongo_enabled' => $merchant->paymongo_enabled,
                'paymongo_key_hint' => $this->keyHint($merchant),
            ],
        ]);
    }

    public function update(SettingsRequest $request): RedirectResponse
    {
        $merchant = $request->user()->merchant;
        $data = $request->validated();

        $merchant->fill([
            ...collect($data)->only([
                'name', 'address', 'tin', 'contact_number', 'receipt_footer', 'receipt_paper_mm',
                'auto_print_receipt', 'prices_include_tax', 'senior_discount_enabled', 'pwd_discount_enabled',
                'discount_vat_exempt', 'manual_qr_enabled', 'manual_qr_label', 'paymongo_enabled',
            ])->all(),
            'tax_rate_bps' => $this->toBps($data['tax_rate']),
            'discount_rate_bps' => $this->toBps($data['discount_rate']),
            'service_charge_bps' => $this->toBps($data['service_charge']),
        ]);

        if (filled($data['paymongo_secret_key'] ?? null)) {
            $merchant->paymongo_secret_key = $data['paymongo_secret_key'];
        } elseif ($request->boolean('remove_paymongo_key')) {
            $merchant->paymongo_secret_key = null;
        }

        $oldQrPath = $merchant->manual_qr_image_path;

        if ($request->hasFile('manual_qr_image')) {
            $merchant->manual_qr_image_path = $request->file('manual_qr_image')
                ->store('payment-qr/'.$merchant->id, 'public');
        } elseif ($request->boolean('remove_manual_qr_image')) {
            $merchant->manual_qr_image_path = null;
        }

        $merchant->save();

        if ($oldQrPath && $oldQrPath !== $merchant->manual_qr_image_path) {
            Storage::disk('public')->delete($oldQrPath);
        }

        return back()->with('success', 'Settings saved. Registers pick them up on their next sync.');
    }

    private function toBps(string|int|float $percent): int
    {
        return (int) round((float) $percent * 100);
    }

    /**
     * Enough to recognise the saved key (mode + last 4), never the key.
     */
    private function keyHint(Merchant $merchant): ?string
    {
        $key = $merchant->paymongo_secret_key;

        if (blank($key)) {
            return null;
        }

        $mode = str_starts_with($key, 'sk_live_') ? 'sk_live_' : 'sk_test_';

        return $mode.'••••'.substr($key, -4);
    }
}

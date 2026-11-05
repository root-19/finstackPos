<?php

namespace App\Http\Controllers\Pos;

use App\Http\Controllers\Controller;
use App\Models\PaymentIntent;
use App\Services\PayMongo;
use Illuminate\Http\Client\HttpClientException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Dynamic QR Ph through the store's own PayMongo account. The POS shows the
 * QR, then polls until the payment succeeds. Requires being online.
 */
class QrPaymentController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount_cents' => ['required', 'integer', 'min:100', 'max:10000000'],
        ]);

        $merchant = $request->user()->merchant;
        $gateway = PayMongo::forMerchant($merchant);
        abort_if($gateway === null, 422, 'PayMongo is not set up for this store.');

        try {
            $qr = $gateway->createQrPh($validated['amount_cents'], "{$merchant->name} POS sale");
        } catch (HttpClientException $e) {
            Log::warning('PayMongo QR Ph failed', ['merchant' => $merchant->id, 'status' => $e->response->status()]);

            return response()->json([
                'message' => $e->response->json('errors.0.detail') ?? 'PayMongo could not create the QR code.',
            ], 502);
        }

        $intent = new PaymentIntent([
            'provider' => 'paymongo',
            'provider_id' => $qr['id'],
            'amount_cents' => $validated['amount_cents'],
            'status' => $qr['status'],
        ]);
        $intent->merchant()->associate($merchant);
        $intent->save();

        return response()->json([
            'id' => $qr['id'],
            'qr_image' => $qr['qr_image'],
            'amount_cents' => $intent->amount_cents,
        ]);
    }

    /**
     * Current status; asks PayMongo until the payment has succeeded.
     */
    public function show(Request $request, string $providerId): JsonResponse
    {
        // Merchant-scoped: another store's payment id is a 404.
        $intent = PaymentIntent::where('provider_id', $providerId)->firstOrFail();

        if (! $intent->succeeded() && ($gateway = PayMongo::forMerchant($request->user()->merchant))) {
            try {
                $intent->update(['status' => $gateway->intentStatus($providerId)]);
            } catch (HttpClientException) {
                // Keep the last known status; the POS simply polls again.
            }
        }

        return response()->json(['status' => $intent->status]);
    }
}

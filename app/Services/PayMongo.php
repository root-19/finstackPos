<?php

namespace App\Services;

use App\Models\Merchant;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * Minimal PayMongo client for dynamic QR Ph payments.
 *
 * Flow: create a Payment Intent allowing "qrph", create a "qrph" Payment
 * Method, attach it; the intent's next_action.code.image_url is the QR.
 * The intent's status becomes "succeeded" once the customer pays.
 *
 * @see https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api.md
 */
class PayMongo
{
    private const BASE_URL = 'https://api.paymongo.com/v1';

    /** How long the customer has to scan, in seconds (PayMongo allows 60–9000). */
    private const QR_EXPIRY_SECONDS = 600;

    public function __construct(private readonly string $secretKey) {}

    /**
     * A client for the store's own PayMongo account, or null when it hasn't
     * turned PayMongo on or saved a key.
     */
    public static function forMerchant(Merchant $merchant): ?self
    {
        return $merchant->paymongoReady() ? new self($merchant->paymongo_secret_key) : null;
    }

    /**
     * A client for FinstackPOS's own account (subscription payments), or null
     * when PAYMONGO_SECRET_KEY isn't set.
     */
    public static function forPlatform(): ?self
    {
        $key = config('subscriptions.paymongo_secret_key');

        return filled($key) ? new self($key) : null;
    }

    /**
     * @return array{id: string, status: string, qr_image: string}
     *
     * @throws RequestException
     */
    public function createQrPh(int $amountCents, string $description): array
    {
        $intent = $this->client()->post('/payment_intents', ['data' => ['attributes' => [
            'amount' => $amountCents,
            'currency' => 'PHP',
            'payment_method_allowed' => ['qrph'],
            'description' => $description,
        ]]])->throw()->json('data');

        $method = $this->client()->post('/payment_methods', ['data' => ['attributes' => [
            'type' => 'qrph',
            'expiry_seconds' => self::QR_EXPIRY_SECONDS,
        ]]])->throw()->json('data');

        $attached = $this->client()->post("/payment_intents/{$intent['id']}/attach", ['data' => ['attributes' => [
            'payment_method' => $method['id'],
            'client_key' => $intent['attributes']['client_key'],
        ]]])->throw()->json('data');

        $image = (string) data_get($attached, 'attributes.next_action.code.image_url', '');

        return [
            'id' => $attached['id'],
            'status' => $attached['attributes']['status'],
            // The docs call it a Base64 string; make sure it renders as an <img> src.
            'qr_image' => str_starts_with($image, 'data:') ? $image : 'data:image/png;base64,'.$image,
        ];
    }

    /**
     * @throws RequestException
     */
    public function intentStatus(string $intentId): string
    {
        return (string) $this->client()->get("/payment_intents/{$intentId}")
            ->throw()
            ->json('data.attributes.status');
    }

    private function client(): PendingRequest
    {
        return Http::baseUrl(self::BASE_URL)
            ->withBasicAuth($this->secretKey, '')
            ->acceptJson()
            ->asJson()
            ->timeout(15);
    }
}

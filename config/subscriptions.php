<?php

/*
 * FinstackPOS plans. Free stores get the register and catalog; Pro adds the
 * Management modules and unlimited products.
 */

return [
    // Pro price per month, in centavos (₱199.00).
    'price_cents' => (int) env('SUBSCRIPTION_PRICE_CENTS', 19900),

    // Most months that can be bought in one payment.
    'max_months' => 24,

    // Free Pro trial for every new store, in days (0 turns trials off).
    'trial_days' => 14,

    // Products a free store can have.
    'free_product_limit' => 50,

    // FinstackPOS's own PayMongo account (not a store's) receives subscription payments.
    'paymongo_secret_key' => env('PAYMONGO_SECRET_KEY'),
];

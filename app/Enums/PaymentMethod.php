<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case Card = 'card';
    /** E-wallet or the store's own printed QR (GCash, Maya...), confirmed by the cashier. */
    case EWallet = 'ewallet';
    /** Dynamic QR Ph through the store's PayMongo account, confirmed by the gateway. */
    case QrPh = 'qrph';
}

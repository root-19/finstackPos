<?php

namespace App\Http\Controllers\Pos;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PosController extends Controller
{
    /**
     * Display the register. The catalog itself is pulled into IndexedDB by
     * the client so the screen keeps working offline.
     */
    public function index(Request $request): Response
    {
        return Inertia::render('Pos/Index', [
            'merchant' => $request->user()->merchant->posSettings(),
        ]);
    }

    /**
     * The customer-facing screen. It shows only what the register on the
     * same computer sends it (see resources/js/lib/customerDisplay.ts): the
     * store's public details from here, never costs, staff, or credentials.
     */
    public function display(Request $request): Response
    {
        $merchant = $request->user()->merchant;

        return Inertia::render('Pos/CustomerDisplay', [
            'store' => [
                'id' => $merchant->id,
                'name' => $merchant->name,
                'address' => $merchant->address,
                'contact_number' => $merchant->contact_number,
                'currency' => $merchant->currency,
                'receipt_footer' => $merchant->receipt_footer,
            ],
        ]);
    }
}

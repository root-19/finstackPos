<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\PricingController;
use App\Http\Controllers\Admin\StoreController;
use App\Http\Controllers\Admin\SubscriptionPaymentController;
use App\Http\Controllers\Admin\SuggestionController as AdminSuggestionController;
use App\Http\Controllers\Admin\SupportController as AdminSupportController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DemoRequestController;
use App\Http\Controllers\DiningTableController;
use App\Http\Controllers\Inventory\InventoryController;
use App\Http\Controllers\Inventory\RecipeController;
use App\Http\Controllers\Inventory\StockMovementController;
use App\Http\Controllers\Inventory\SupplierController;
use App\Http\Controllers\ModuleController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\Pos\PosController;
use App\Http\Controllers\Pos\QrPaymentController;
use App\Http\Controllers\Pos\SyncController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SaleAdjustmentController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\SuggestionController;
use App\Http\Controllers\SupportController;
use App\Http\Controllers\TableMenuController;
use App\Http\Controllers\TableOrderController;
use App\Http\Controllers\WelcomeController;
use App\Http\Controllers\Workforce\AttendanceController;
use App\Http\Controllers\Workforce\DeductionRuleController;
use App\Http\Controllers\Workforce\EmployeeController;
use App\Http\Controllers\Workforce\MyWorkController;
use App\Http\Controllers\Workforce\PayrollController;
use App\Http\Controllers\Workforce\ScheduleGeneratorController;
use App\Http\Controllers\Workforce\ShiftController;
use App\Support\DesktopRelease;
use App\Support\WebVersion;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', WelcomeController::class)->name('welcome');
// "Book a demo" from the landing page (public; limits in AppServiceProvider and DemoRequestController).
Route::post('/book-demo', [DemoRequestController::class, 'store'])->middleware('throttle:demo-requests')->name('demo.store');

// The Windows desktop app: its page, and the installer itself.
Route::get('/download', fn () => Inertia::render('Download', [
    'desktop' => DesktopRelease::forPage(),
])->withViewData(WelcomeController::meta(
    'Download FinstackPOS for Windows',
    'The FinstackPOS register for Windows: receipts print straight to your thermal printer, with cash drawer and auto-cut.',
    '/download',
)))->name('download');
// The Windows desktop app installer (see App\Support\DesktopRelease): the newest
// one, or a given version (what the updater downloads). Back to the download
// page when there is none.
Route::get('/download/windows/{version?}', function (?string $version = null) {
    $release = $version === null ? DesktopRelease::latest() : DesktopRelease::find($version);

    return $release
        ? response()->download($release['path'], $release['filename'], ['Content-Type' => 'application/vnd.microsoft.portable-executable'])
        : redirect('/download');
})->where('version', '\d+\.\d+\.\d+')->middleware('throttle:30,1')->name('download.windows');

// Installed desktop apps ask this on launch: 200 with the newer signed release
// (Tauri updater format), or 204 when they are up to date.
Route::get('/desktop/update/{target}/{arch}/{current}', function (string $target, string $arch, string $current) {
    $update = $target === 'windows' && $arch === 'x86_64' ? DesktopRelease::update($current) : null;

    return $update ? response()->json($update) : response()->noContent();
})->where('current', '\d+\.\d+\.\d+')->middleware('throttle:60,1')->name('desktop.update');

// Legal drafts, in the landing page's receipt style.
Route::get('/privacy', fn () => Inertia::render('Legal/Privacy')->withViewData(WelcomeController::meta(
    'Privacy Policy (draft) - FinstackPOS',
    'How FinstackPOS handles store, sales and employee data under the Data Privacy Act of 2012 (RA 10173). Draft for legal review.',
    '/privacy',
)))->name('privacy');
Route::get('/terms', fn () => Inertia::render('Legal/Terms')->withViewData(WelcomeController::meta(
    'Terms of Service (draft) - FinstackPOS',
    'The terms for using FinstackPOS, the Free plan and prepaid Pro months. Draft for legal review.',
    '/terms',
)))->name('terms');

// The menu a table's QR code opens on the customer's phone (no login).
Route::prefix('order/{token}')->name('menu.')->group(function () {
    // Every phone on the store's Wi-Fi shares one IP, so these are per IP and
    // generous; each table has its own order limit (TableMenuController).
    Route::get('/', [TableMenuController::class, 'show'])->middleware('throttle:120,1')->name('show');
    Route::get('/state', [TableMenuController::class, 'state'])->middleware('throttle:600,1')->name('state');
    Route::post('/', [TableMenuController::class, 'order'])->middleware('throttle:40,1')->name('order');
    Route::post('/paid', [TableMenuController::class, 'paid'])->middleware('throttle:40,1')->name('paid');
});

Route::get('/dashboard', DashboardController::class)->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::put('/profile/manager-pin', [ProfileController::class, 'updateManagerPin'])->middleware('throttle:10,1')->name('profile.manager-pin');
});

// Store back office. Each area needs a permission from the user's role
// (the owner has them all; see App\Enums\Permission).
Route::middleware(['auth', 'verified', 'merchant'])->group(function () {
    Route::resource('products', ProductController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware(['module:products', 'can:products.manage']);
    Route::resource('categories', CategoryController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware(['module:products', 'can:categories.manage']);

    Route::middleware(['module:sales', 'can:sales.view'])->group(function () {
        Route::get('/sales', [SaleController::class, 'index'])->name('sales.index');
        Route::get('/sales/{sale}', [SaleController::class, 'show'])->name('sales.show');
    });

    // Voids and refunds, from Sales or the register (online only). Who may
    // do them, or needs a manager's PIN, is checked per request.
    // (The register's own "Find receipt" goes through the POS routes, so it
    // keeps working when Sales history is turned off.)
    Route::prefix('sales/{sale}')->name('sales.')->group(function () {
        Route::get('/adjust', [SaleAdjustmentController::class, 'show'])->name('adjust');
        Route::post('/void', [SaleAdjustmentController::class, 'void'])->middleware('throttle:20,1')->name('void');
        Route::post('/refunds', [SaleAdjustmentController::class, 'refund'])->middleware('throttle:20,1')->name('refund');
    });

    // Reports: each report checks the permission of the page its data comes from.
    Route::get('/reports', [ReportController::class, 'index'])->middleware('module:reports')->name('reports.index');

    // Inventory: supplies, ingredients, materials, suppliers, and recipes.
    Route::middleware(['module:inventory', 'can:inventory.manage'])->prefix('inventory')->group(function () {
        Route::get('/', [InventoryController::class, 'index'])->name('inventory.index');
        Route::post('/', [InventoryController::class, 'store'])->name('inventory.store');
        Route::get('/export', [InventoryController::class, 'export'])->name('inventory.export');
        Route::post('/receive', [InventoryController::class, 'receive'])->name('inventory.receive');
        Route::put('/settings', [InventoryController::class, 'settings'])->name('inventory.settings');
        Route::put('/items/{item}', [InventoryController::class, 'update'])->name('inventory.update');
        Route::delete('/items/{item}', [InventoryController::class, 'destroy'])->name('inventory.destroy');
        Route::post('/items/{item}/movements', [InventoryController::class, 'move'])->name('inventory.move');

        Route::get('/history', [StockMovementController::class, 'index'])->name('inventory.movements');
        Route::get('/history/export', [StockMovementController::class, 'export'])->name('inventory.movements.export');

        Route::get('/recipes', [RecipeController::class, 'index'])->name('inventory.recipes');
        Route::put('/recipes/{product}', [RecipeController::class, 'update'])->name('inventory.recipes.update');

        Route::resource('suppliers', SupplierController::class)->only(['index', 'store', 'update', 'destroy']);
    });

    // System details: versions, this device, sync status, desktop app updates.
    Route::get('/system', function () {
        return Inertia::render('System/Index', [
            'web_version' => WebVersion::current(),
            'server_time' => now()->toIso8601String(),
            'desktop_latest' => DesktopRelease::forPage(),
        ]);
    })->name('system.index');

    // Suggest a feature (every plan, anyone in the store).
    Route::get('/suggestions', [SuggestionController::class, 'index'])->name('suggestions.index');
    Route::post('/suggestions', [SuggestionController::class, 'store'])->middleware('throttle:10,1')->name('suggestions.store');

    // Chat with FinstackPOS support (every plan, anyone in the store).
    Route::get('/support', [SupportController::class, 'index'])->name('support.index');
    Route::post('/support', [SupportController::class, 'store'])->middleware('throttle:30,1')->name('support.store');
    Route::get('/support/attachments/{message}', [SupportController::class, 'attachment'])->name('support.attachment');

    // The store's FinstackPOS plan.
    Route::get('/subscription', [SubscriptionController::class, 'index'])->name('subscription.index');
    Route::post('/subscription/trial', [SubscriptionController::class, 'trial'])->middleware('throttle:10,1')->name('subscription.trial');
    Route::post('/subscription/checkout',[SubscriptionController::class, 'checkout'])->middleware('throttle:10,1')->name('subscription.checkout');
    Route::get('/subscription/checkout/{providerId}', [SubscriptionController::class, 'status'])->middleware('throttle:120,1')->name('subscription.status');

    // Branches and what each one earns (owner only, Pro).
    Route::middleware(['module:branches', 'can:settings.manage', 'subscribed'])->group(function () {
        Route::get('/branches', [BranchController::class, 'index'])->name('branches.index');
        Route::post('/branches', [BranchController::class, 'store'])->name('branches.store');
        Route::patch('/branches/staff/{user}', [BranchController::class, 'assign'])->name('branches.assign');
        Route::put('/branches/{branch}', [BranchController::class, 'update'])->name('branches.update');
        Route::delete('/branches/{branch}', [BranchController::class, 'destroy'])->name('branches.destroy');
    });

    Route::middleware(['can:staff.manage', 'subscribed'])->group(function () {
        Route::resource('roles', RoleController::class)->only(['store', 'update', 'destroy']);
        Route::get('/staff', [StaffController::class, 'index'])->name('staff.index');
        Route::post('/staff', [StaffController::class, 'store'])->name('staff.store');
        Route::patch('/staff/{user}', [StaffController::class, 'update'])->name('staff.update');
        Route::delete('/staff/{user}', [StaffController::class, 'destroy'])->name('staff.destroy');
    });

    Route::middleware('can:settings.manage')->group(function () {
        Route::get('/settings', [SettingsController::class, 'edit'])->name('settings.edit');
        Route::put('/settings', [SettingsController::class, 'update'])->name('settings.update');

        // Settings → Customize: which modules this store uses.
        Route::get('/settings/customize', [ModuleController::class, 'edit'])->name('modules.edit');
        Route::put('/settings/customize', [ModuleController::class, 'update'])->name('modules.update');

        // The setup guide with Fin (new stores).
        Route::post('/onboarding/finish', [OnboardingController::class, 'finish'])->name('onboarding.finish');
        Route::post('/onboarding/restart', [OnboardingController::class, 'restart'])->name('onboarding.restart');
    });

    // Tables and their QR codes (taking orders from them is Pro).
    Route::middleware(['module:table_orders', 'can:settings.manage'])->group(function () {
        Route::get('/tables', [DiningTableController::class, 'index'])->name('tables.index');
        Route::post('/tables', [DiningTableController::class, 'store'])->name('tables.store');
        Route::post('/tables/bulk', [DiningTableController::class, 'bulk'])->name('tables.bulk');
        Route::put('/tables/settings', [DiningTableController::class, 'settings'])->name('tables.settings');
        Route::put('/tables/{table}', [DiningTableController::class, 'update'])->name('tables.update');
        Route::post('/tables/{table}/new-code', [DiningTableController::class, 'regenerate'])->name('tables.regenerate');
        Route::delete('/tables/{table}', [DiningTableController::class, 'destroy'])->name('tables.destroy');
    });

    // Orders from the tables' QR codes, on the POS or any staff phone.
    Route::middleware(['module:table_orders', 'can:pos.sell'])->prefix('orders')->name('orders.')->group(function () {
        Route::get('/', [TableOrderController::class, 'index'])->name('index');
        Route::get('/feed', [TableOrderController::class, 'feed'])->middleware('throttle:120,1')->name('feed');
        Route::post('/pause', [TableOrderController::class, 'pause'])->middleware('throttle:30,1')->name('pause');
        Route::patch('/{order}', [TableOrderController::class, 'update'])->middleware('throttle:120,1')->name('update');
    });

    // Employee management. Salaries, government IDs, payroll, and deductions
    // are owner only; scheduling and attendance can be given to a role.
    Route::prefix('team')->middleware('subscribed')->group(function () {
        Route::middleware(['module:employees', 'can:employees.manage'])->group(function () {
            Route::resource('employees', EmployeeController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::post('/employees/{employee}/salary', [EmployeeController::class, 'storeSalary'])->name('employees.salary');
        });

        Route::middleware(['module:scheduling', 'can:schedules.manage'])->group(function () {
            Route::get('/schedule', [ShiftController::class, 'index'])->name('shifts.index');
            Route::post('/shifts', [ShiftController::class, 'store'])->name('shifts.store');
            Route::post('/shifts/publish', [ShiftController::class, 'publish'])->name('shifts.publish');
            Route::post('/shifts/generate/preview', [ScheduleGeneratorController::class, 'preview'])->name('shifts.generate.preview');
            Route::post('/shifts/generate', [ScheduleGeneratorController::class, 'store'])->name('shifts.generate');
            Route::put('/shifts/{shift}', [ShiftController::class, 'update'])->name('shifts.update');
            Route::post('/shifts/{shift}/cancel', [ShiftController::class, 'cancel'])->name('shifts.cancel');
            Route::delete('/shifts/{shift}', [ShiftController::class, 'destroy'])->name('shifts.destroy');
        });

        Route::middleware(['module:attendance', 'can:attendance.manage'])->group(function () {
            Route::get('/attendance', [AttendanceController::class, 'index'])->name('attendance.index');
            Route::post('/attendance', [AttendanceController::class, 'store'])->name('attendance.store');
            Route::post('/attendance/review', [AttendanceController::class, 'review'])->name('attendance.review');
            Route::put('/attendance/{record}', [AttendanceController::class, 'update'])->name('attendance.update');
            Route::get('/attendance/{record}/history', [AttendanceController::class, 'history'])->name('attendance.history');
        });

        Route::middleware(['module:payroll', 'can:payroll.manage'])->group(function () {
            Route::get('/payroll', [PayrollController::class, 'index'])->name('payroll.index');
            Route::post('/payroll', [PayrollController::class, 'store'])->name('payroll.store');
            Route::get('/payroll/{run}', [PayrollController::class, 'show'])->name('payroll.show');
            Route::delete('/payroll/{run}', [PayrollController::class, 'destroy'])->name('payroll.destroy');
            Route::post('/payroll/{run}/recalculate', [PayrollController::class, 'recalculate'])->name('payroll.recalculate');
            Route::post('/payroll/{run}/status', [PayrollController::class, 'transition'])->name('payroll.transition');
            Route::get('/payroll/{run}/export', [PayrollController::class, 'export'])->name('payroll.export');
            Route::post('/payroll/{run}/items/{item}/earnings', [PayrollController::class, 'addEarning'])->name('payroll.earnings.store');
            Route::delete('/payroll/{run}/earnings/{line}', [PayrollController::class, 'removeEarning'])->name('payroll.earnings.destroy');

            Route::resource('deductions', DeductionRuleController::class)
                ->only(['index', 'store', 'update', 'destroy'])
                ->parameters(['deductions' => 'rule']);
        });
    });

    // Every employee's own schedule, time clock, and payslips.
    Route::middleware(['module:employees', 'subscribed'])->group(function () {
        Route::get('/my-work', [MyWorkController::class, 'index'])->name('my-work');
        Route::post('/my-work/clock-in', [MyWorkController::class, 'clockIn'])->middleware('throttle:20,1')->name('my-work.clock-in');
        Route::post('/my-work/clock-out', [MyWorkController::class, 'clockOut'])->middleware('throttle:20,1')->name('my-work.clock-out');
    });
});

// Session-cookie auth (HttpOnly) + CSRF via the XSRF-TOKEN cookie that axios
// sends automatically, so no API token ever has to live in browser storage.
Route::middleware(['auth', 'verified', 'merchant', 'can:pos.sell'])->prefix('pos')->name('pos.')->group(function () {
    // The register's pages follow Settings → Customize. Sync stays open so
    // sales already queued offline always upload.
    Route::get('/', [PosController::class, 'index'])->middleware('module:pos')->name('index');
    Route::get('/display', [PosController::class, 'display'])->middleware('module:pos')->name('display');
    Route::get('/sync/catalog', [SyncController::class, 'catalog'])
        ->middleware('throttle:30,1')
        ->name('sync.catalog');
    Route::post('/sync/sales', [SyncController::class, 'sales'])
        ->middleware('throttle:60,1')
        ->name('sync.sales');
    // "Find receipt", to void or refund from the register.
    Route::get('/receipts', [SaleAdjustmentController::class, 'lookup'])
        ->middleware('throttle:60,1')
        ->name('receipts');

    // Online only: dynamic QR Ph through the store's PayMongo account.
    Route::post('/payments/qrph', [QrPaymentController::class, 'store'])
        ->middleware('throttle:20,1')
        ->name('payments.qrph.store');
    Route::get('/payments/qrph/{providerId}', [QrPaymentController::class, 'show'])
        ->middleware('throttle:120,1')
        ->name('payments.qrph.show');
});

// FinstackPOS administrators (made with `php artisan admin:create`): all stores and plans.
Route::middleware(['auth', 'verified', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', AdminDashboardController::class)->name('dashboard');
    Route::get('/stores', [StoreController::class, 'index'])->name('stores.index');
    Route::get('/stores/{store}', [StoreController::class, 'show'])->name('stores.show');
    Route::post('/stores/{store}/grant', [StoreController::class, 'grant'])->name('stores.grant');
    Route::post('/stores/{store}/end-date', [StoreController::class, 'setEnd'])->name('stores.end-date');
    Route::post('/stores/{store}/end-now', [StoreController::class, 'endNow'])->name('stores.end-now');
    Route::post('/stores/{store}/active', [StoreController::class, 'toggleActive'])->name('stores.active');
    Route::get('/subscriptions', [SubscriptionPaymentController::class, 'index'])->name('subscriptions');
    Route::get('/support', [AdminSupportController::class, 'index'])->name('support.index');
    Route::get('/support/{store}', [AdminSupportController::class, 'show'])->name('support.show');
    Route::post('/support/{store}', [AdminSupportController::class, 'store'])->middleware('throttle:60,1')->name('support.store');
    Route::get('/support/{store}/attachments/{message}', [AdminSupportController::class, 'attachment'])->name('support.attachment');
    Route::get('/suggestions', [AdminSuggestionController::class, 'index'])->name('suggestions.index');
    Route::patch('/suggestions/{suggestion}', [AdminSuggestionController::class, 'update'])->name('suggestions.update');
    Route::get('/pricing', [PricingController::class, 'edit'])->name('pricing');
    Route::put('/pricing', [PricingController::class, 'update'])->name('pricing.update');
});

require __DIR__.'/auth.php';

<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\FeatureSuggestion;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every store's feature suggestions: who sent it, from which store, and the
 * store's plan (free, trial or pro) when they sent it. Admins set a status
 * and an optional note the store sees.
 */
class SuggestionController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'plan' => ['nullable', Rule::in(FeatureSuggestion::PLANS)],
            'status' => ['nullable', Rule::in(array_keys(FeatureSuggestion::STATUSES))],
            'category' => ['nullable', Rule::in(array_keys(FeatureSuggestion::CATEGORIES))],
        ]);

        $all = FeatureSuggestion::withoutGlobalScope('merchant');
        $query = (clone $all)
            ->when($filters['plan'] ?? null, fn ($q, $v) => $q->where('plan', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['category'] ?? null, fn ($q, $v) => $q->where('category', $v));

        return Inertia::render('Admin/Suggestions', [
            'filters' => ['plan' => null, 'status' => null, 'category' => null, ...$filters],
            'categories' => FeatureSuggestion::CATEGORIES,
            'statuses' => FeatureSuggestion::STATUSES,
            'counts' => [
                'total' => (clone $all)->count(),
                'new' => (clone $all)->where('status', 'new')->count(),
                'by_plan' => (clone $all)->selectRaw('plan, count(*) as n')->groupBy('plan')->pluck('n', 'plan'),
            ],
            'suggestions' => $query->with(['merchant:id,name', 'user:id,name,email'])->latest()->latest('id')->paginate(30)->withQueryString()
                ->through(fn (FeatureSuggestion $s) => [
                    'id' => $s->id,
                    'store_id' => $s->merchant_id,
                    'store' => $s->merchant?->name ?? 'Deleted store',
                    'user' => $s->user?->name,
                    'email' => $s->user?->email,
                    'plan' => $s->plan,
                    'category' => $s->category,
                    'title' => $s->title,
                    'details' => $s->details,
                    'status' => $s->status,
                    'admin_note' => $s->admin_note,
                    'created_at' => $s->created_at->toIso8601String(),
                ]),
        ]);
    }

    public function update(Request $request, int $suggestion): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(array_keys(FeatureSuggestion::STATUSES))],
            'admin_note' => ['nullable', 'string', 'max:1000'],
        ]);

        FeatureSuggestion::withoutGlobalScope('merchant')->findOrFail($suggestion)->forceFill($data)->save();

        return back()->with('success', 'Suggestion updated.');
    }
}

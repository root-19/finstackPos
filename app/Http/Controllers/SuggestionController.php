<?php

namespace App\Http\Controllers;

use App\Models\FeatureSuggestion;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Suggest a feature": anyone in a store, on any plan, can send an idea and
 * follow what the FinstackPOS team decided about their store's ideas.
 */
class SuggestionController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Suggestions/Index', [
            'categories' => FeatureSuggestion::CATEGORIES,
            'statuses' => FeatureSuggestion::STATUSES,
            'suggestions' => FeatureSuggestion::query()->with('user:id,name')->latest()->latest('id')->limit(100)->get()
                ->map(fn (FeatureSuggestion $s) => [
                    'id' => $s->id,
                    'category' => $s->category,
                    'title' => $s->title,
                    'details' => $s->details,
                    'status' => $s->status,
                    'admin_note' => $s->admin_note,
                    'by' => $s->user?->name,
                    'created_at' => $s->created_at->toIso8601String(),
                ]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'category' => ['required', Rule::in(array_keys(FeatureSuggestion::CATEGORIES))],
            'title' => ['required', 'string', 'max:120'],
            'details' => ['nullable', 'string', 'max:2000'],
        ]);

        FeatureSuggestion::create([
            ...$data,
            'user_id' => $request->user()->id,
            'plan' => FeatureSuggestion::planOf($request->user()->merchant),
        ]);

        return back()->with('success', 'Thanks! Your suggestion was sent to the FinstackPOS team.');
    }
}

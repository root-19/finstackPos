<?php

namespace App\Http\Controllers;

use App\Http\Requests\CategoryRequest;
use App\Models\Category;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Categories are just names for grouping products; each product carries
 * its own options. Category is merchant-scoped globally.
 */
class CategoryController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Categories/Index', [
            'categories' => Category::query()
                ->withCount('products')
                ->orderBy('name')
                ->get(['id', 'name']),
        ]);
    }

    public function store(CategoryRequest $request): RedirectResponse
    {
        Category::create($request->validated());

        return back()->with('success', 'Category added.');
    }

    public function update(CategoryRequest $request, Category $category): RedirectResponse
    {
        $category->update($request->validated());

        return back()->with('success', 'Category renamed.');
    }

    public function destroy(Category $category): RedirectResponse
    {
        // Builder updates bump updated_at, so POS devices pick this up on sync.
        $category->products()->update(['category_id' => null]);
        $category->delete();

        return back()->with('success', 'Category deleted.');
    }
}

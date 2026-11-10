<?php

namespace App\Http\Requests;

use App\Models\DemoRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** The landing page's "Book a demo" form (public, no login). */
class StoreDemoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $range = DemoRequest::dateRange();

        return [
            'name' => ['required', 'string', 'max:100'],
            'business_name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'string', 'email:rfc', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^\+?[0-9 ()-]{7,30}$/'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.$range['min'], 'before_or_equal:'.$range['max']],
            'time' => ['required', Rule::in(DemoRequest::slots())],
            'notes' => ['nullable', 'string', 'max:1000'],
            // Honeypot: hidden from people; bots that fill it are quietly ignored (see the controller).
            'website' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'date.after_or_equal' => 'Pick a date from tomorrow onwards.',
            'date.before_or_equal' => 'Pick a date within the next '.DemoRequest::MAX_DAYS_AHEAD.' days.',
            'time.in' => 'Pick one of the listed times.',
            'phone.regex' => 'Enter a phone number, e.g. 0917 123 4567.',
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['business_name' => 'business name'];
    }
}

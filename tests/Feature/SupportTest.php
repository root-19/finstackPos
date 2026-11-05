<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\SupportMessage;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function supportOwner(array $merchant = []): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create($merchant));
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function supportAdmin(): User
{
    $admin = User::factory()->create();
    $admin->forceFill(['is_admin' => true, 'merchant_id' => null])->save();

    return $admin;
}

test('a free store writes to support and the administrators see it', function () {
    $owner = supportOwner(['subscribed_until' => null]);
    $admin = supportAdmin();

    $this->actingAs($owner)->get('/support')->assertOk();
    $this->actingAs($owner)->post('/support', ['body' => '  My printer stopped working.  '])->assertRedirect();

    $message = SupportMessage::withoutGlobalScopes()->sole();
    expect($message->body)->toBe('My printer stopped working.')
        ->and($message->from_admin)->toBeFalse()
        ->and($message->merchant_id)->toBe($owner->merchant_id)
        ->and($message->user_id)->toBe($owner->id);

    $this->actingAs($admin)->get('/admin/support')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('Admin/Support/Index')
            ->has('threads', 1)
            ->where('threads.0.store_id', $owner->merchant_id)
            ->where('threads.0.unread', 1)
            ->where('auth.supportUnread', 1));
});

test('an administrator replies, the store reads it, and unread counts follow along', function () {
    $owner = supportOwner();
    $admin = supportAdmin();
    $this->actingAs($owner)->post('/support', ['body' => 'Hello?']);

    // Opening the thread reads the store's message.
    $this->actingAs($admin)->get("/admin/support/{$owner->merchant_id}")
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('Admin/Support/Show')->has('messages', 1));
    expect(SupportMessage::withoutGlobalScopes()->unreadByAdmin()->count())->toBe(0);

    $this->actingAs($admin)->post("/admin/support/{$owner->merchant_id}", ['body' => 'Hi! How can we help?'])->assertRedirect();

    $this->actingAs($owner)->get('/dashboard')
        ->assertInertia(fn ($page) => $page->where('auth.supportUnread', 1));

    $this->actingAs($owner)->get('/support')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('Support/Index')
            ->has('messages', 2)
            ->where('messages.1.from_admin', true)
            ->where('messages.1.sender', 'FinstackPOS support')
            ->where('auth.supportUnread', 0));
});

test('stores only see their own conversation and cannot reach the admin side', function () {
    $owner = supportOwner();
    $other = supportOwner();
    $this->actingAs($other)->post('/support', ['body' => 'Private to the other store']);

    $this->actingAs($owner)->get('/support')
        ->assertInertia(fn ($page) => $page->has('messages', 0));

    $this->actingAs($owner)->get('/admin/support')->assertForbidden();
    $this->actingAs($owner)->post("/admin/support/{$other->merchant_id}", ['body' => 'nope'])->assertForbidden();
});

test('a message must have text and fit the limit', function () {
    $owner = supportOwner();

    $this->actingAs($owner)->from('/support')->post('/support', ['body' => '   '])->assertSessionHasErrors('body');
    $this->actingAs($owner)->from('/support')->post('/support', ['body' => str_repeat('a', 2001)])->assertSessionHasErrors('body');
    expect(SupportMessage::withoutGlobalScopes()->count())->toBe(0);
});

test('a picture or file can be sent, and only its own store and the administrators can open it', function () {
    Storage::fake('local');
    $owner = supportOwner();
    $other = supportOwner();
    $admin = supportAdmin();

    $this->actingAs($owner)->post('/support', [
        'attachment' => UploadedFile::fake()->image('receipt.png', 200, 100),
    ])->assertRedirect()->assertSessionHasNoErrors();

    $message = SupportMessage::withoutGlobalScopes()->sole();
    expect($message->body)->toBe('')
        ->and($message->attachment_name)->toBe('receipt.png')
        ->and($message->attachmentIsImage())->toBeTrue()
        ->and($message->attachment_path)->toStartWith("support/{$owner->merchant_id}/");
    Storage::disk('local')->assertExists($message->attachment_path);

    $this->actingAs($owner)->get('/support')
        ->assertInertia(fn ($page) => $page
            ->where('messages.0.attachment.is_image', true)
            ->where('messages.0.attachment.name', 'receipt.png'));

    $this->actingAs($owner)->get("/support/attachments/{$message->id}")->assertOk()->assertHeader('Content-Type', 'image/png');
    $this->actingAs($other)->get("/support/attachments/{$message->id}")->assertNotFound();
    $this->actingAs($admin)->get("/admin/support/{$owner->merchant_id}/attachments/{$message->id}")->assertOk();
    $this->actingAs($admin)->get("/admin/support/{$other->merchant_id}/attachments/{$message->id}")->assertNotFound();

    // The admin replies with a document.
    $this->actingAs($admin)->post("/admin/support/{$owner->merchant_id}", [
        'body' => 'Here is the guide.',
        'attachment' => UploadedFile::fake()->create('guide.pdf', 50, 'application/pdf'),
    ])->assertRedirect()->assertSessionHasNoErrors();
    expect(SupportMessage::withoutGlobalScopes()->where('from_admin', true)->sole()->attachment_name)->toBe('guide.pdf');
});

test('attachments must be a known type and size, and a message needs text or a file', function () {
    Storage::fake('local');
    $owner = supportOwner();

    $this->actingAs($owner)->from('/support')->post('/support', [
        'attachment' => UploadedFile::fake()->create('virus.exe', 10, 'application/octet-stream'),
    ])->assertSessionHasErrors('attachment');

    $this->actingAs($owner)->from('/support')->post('/support', [
        'attachment' => UploadedFile::fake()->create('big.pdf', 20000, 'application/pdf'),
    ])->assertSessionHasErrors('attachment');

    $this->actingAs($owner)->from('/support')->post('/support', [])->assertSessionHasErrors('body');
    expect(SupportMessage::withoutGlobalScopes()->count())->toBe(0);
});

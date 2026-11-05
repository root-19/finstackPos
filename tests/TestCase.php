<?php

namespace Tests;

use App\Support\Platform;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Platform settings are read once per request; each test starts fresh.
        Platform::flush();
    }
}

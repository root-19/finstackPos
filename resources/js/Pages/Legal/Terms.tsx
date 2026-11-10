import LegalDoc from '@/Components/Landing/LegalDoc';

export default function Terms() {
    return (
        <LegalDoc title="Terms of Service" updated="10 November 2026">
            <section>
                <h2>1. The service</h2>
                <p>
                    FinstackPOS is provided by [registered business name], [business address], Philippines. By creating a store you agree
                    to these terms. If you sign up for a business, you confirm you may act for it.
                </p>
            </section>

            <section>
                <h2>2. Plans</h2>
                <ul>
                    <li>Free: no time limit, with a product limit shown on our pricing.</li>
                    <li>Pro: bought in advance by the month with QR Ph. The price is the monthly price times the months you buy. It does not renew by itself.</li>
                    <li>Free trial: new stores may get Pro free for a number of days, when a trial is offered. No payment is needed for the trial.</li>
                    <li>When Pro ends, the store goes back to Free. Your records are kept; Pro-only pages stop working until you buy Pro again.</li>
                    <li>Refunds: [refund policy to be decided].</li>
                </ul>
            </section>

            <section>
                <h2>3. Your account and your team</h2>
                <ul>
                    <li>Keep your password private. You are responsible for what happens under your store's accounts.</li>
                    <li>The store owner decides what each staff role can do, and is responsible for the employee and customer information the store enters.</li>
                </ul>
            </section>

            <section>
                <h2>4. Receipts and taxes</h2>
                <p>
                    FinstackPOS prints itemized sales receipts. It is not yet accredited by the Bureau of Internal Revenue (BIR). Check
                    with your Revenue District Office before using its receipts as official receipts. Payroll deductions (SSS,
                    PhilHealth, Pag-IBIG, withholding tax) use rates you can edit; check them against current rules.
                </p>
            </section>

            <section>
                <h2>5. Payments</h2>
                <p>
                    QR Ph payments at your register go through your own PayMongo account and PayMongo's terms and fees. GCash, Maya and
                    bank QR payments go straight to you; the cashier confirms them.
                </p>
            </section>

            <section>
                <h2>6. Fair use</h2>
                <p>Do not use FinstackPOS for anything illegal, to break into other stores' data, or to overload the service.</p>
            </section>

            <section>
                <h2>7. Availability</h2>
                <p>
                    We work to keep FinstackPOS running, but we cannot promise it will never be down. The register keeps selling offline
                    and syncs when the connection returns. [Limits of liability to be written by counsel.]
                </p>
            </section>

            <section>
                <h2>8. Your data</h2>
                <p>Your store's records belong to your store. See the Privacy Policy for how we handle personal information.</p>
            </section>

            <section>
                <h2>9. Changes and law</h2>
                <p>
                    We may update these terms and will say so in the app before changes take effect. These terms are governed by the laws
                    of the Philippines. [Venue for disputes to be confirmed by counsel.]
                </p>
            </section>

            <section>
                <h2>10. Contact</h2>
                <p>[email address], or the Support chat inside the app.</p>
            </section>
        </LegalDoc>
    );
}

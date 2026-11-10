import LegalDoc from '@/Components/Landing/LegalDoc';

export default function Privacy() {
    return (
        <LegalDoc title="Privacy Policy" updated="10 November 2026">
            <section>
                <h2>1. Who we are</h2>
                <p>
                    FinstackPOS is a point of sale, inventory and payroll app operated by [registered business name], [business address],
                    Philippines. This policy explains how we handle personal information under the Data Privacy Act of 2012 (Republic Act
                    No. 10173), its Implementing Rules and Regulations, and issuances of the National Privacy Commission (NPC).
                </p>
                <p>Data Protection Officer: [name], [email address].</p>
            </section>

            <section>
                <h2>2. Our role</h2>
                <p>
                    For your own account, we are the personal information controller. For the information a store enters about its
                    employees and customers, the store is the controller and FinstackPOS processes it on the store's behalf and on its
                    instructions.
                </p>
            </section>

            <section>
                <h2>3. What we collect</h2>
                <ul>
                    <li>Account details: name, email address and a hashed password.</li>
                    <li>Demo requests: the name, business, email, mobile number, preferred schedule and notes you send with the Book a demo form, used only to schedule the demo.</li>
                    <li>Store records: products, prices, stock, suppliers, sales, and the cashier who made each sale.</li>
                    <li>Senior Citizen and PWD discounts: the ID number and name the cashier records on the sale.</li>
                    <li>
                        Employee records (Pro): names, schedules, attendance, pay, and SSS, PhilHealth, Pag-IBIG and TIN numbers. Government
                        ID numbers are stored encrypted and only the store owner can see them.
                    </li>
                    <li>Table orders: the items ordered from a table's QR code, the table they came from, and any note the customer types.</li>
                    <li>
                        Payments: for Pro months and for QR Ph sales, the payment reference and status from PayMongo. We do not receive or
                        store e-wallet or bank login details.
                    </li>
                    <li>Technical data: a session cookie to keep you signed in, a security token against forged requests, and sales saved on your device while offline.</li>
                </ul>
            </section>

            <section>
                <h2>4. Why we use it</h2>
                <ul>
                    <li>To provide the app: selling, receipts, inventory, scheduling, attendance and payroll.</li>
                    <li>To process Pro payments and keep track of your plan.</li>
                    <li>To answer support messages.</li>
                    <li>To keep the service secure and to meet legal obligations.</li>
                </ul>
                <p>We rely on the performance of our contract with you, legal obligations, and our legitimate interest in running a secure service. [Legal basis to be confirmed by counsel.]</p>
            </section>

            <section>
                <h2>5. Who we share it with</h2>
                <ul>
                    <li>PayMongo, to process QR Ph payments.</li>
                    <li>[Hosting provider], which stores the app's data.</li>
                    <li>Authorities, when the law requires it.</li>
                </ul>
                <p>We do not sell personal information and we do not use advertising trackers.</p>
            </section>

            <section>
                <h2>6. How we protect it</h2>
                <ul>
                    <li>Each store's records are kept separate from every other store.</li>
                    <li>Staff only see the pages their role allows; salaries and government IDs stay with the owner.</li>
                    <li>Government ID numbers are encrypted in the database.</li>
                    <li>Sign-in uses HttpOnly session cookies, not tokens stored in the browser.</li>
                </ul>
            </section>

            <section>
                <h2>7. How long we keep it</h2>
                <p>[Retention periods to be set, including the BIR record-keeping period for sales records and what happens after an account is closed.]</p>
            </section>

            <section>
                <h2>8. Your rights</h2>
                <p>
                    Under RA 10173 you have the right to be informed, to access, to object, to correct, to erasure or blocking, to data
                    portability, to damages, and to file a complaint with the National Privacy Commission. Employees and customers of a
                    store should contact that store first; we will help the store respond.
                </p>
            </section>

            <section>
                <h2>9. Contact</h2>
                <p>Write to our Data Protection Officer at [email address], or use the Support chat inside the app.</p>
            </section>
        </LegalDoc>
    );
}

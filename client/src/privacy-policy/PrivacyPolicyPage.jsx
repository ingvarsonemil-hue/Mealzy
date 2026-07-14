import * as React from 'react';
import LegalLayout from '@/legal/LegalLayout';

/* LEGAL TEXT — copied verbatim from public/privacy-policy.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const TOC = [
  { id: 'what-data-we-collect', label: 'What data we collect' },
  { id: 'how-we-use-your-data', label: 'How we use your data' },
  { id: 'anthropic-claude-api', label: 'Anthropic Claude API' },
  { id: 'stripe', label: 'Stripe' },
  { id: 'cookies-analytics', label: 'Cookies & analytics' },
  { id: 'hosting-infrastructure', label: 'Hosting & infrastructure' },
  { id: 'data-retention', label: 'Data retention' },
  { id: 'deleting-your-account', label: 'Deleting your account' },
  { id: 'contact', label: 'Contact' }
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="Last updated: June 2026" toc={TOC}>
      <p className="lead">
        Mealzy is built by a solo founder. This policy explains plainly what data we collect, how
        it is used, and what your rights are.
      </p>

      <section id="what-data-we-collect">
        <h2>What data we collect</h2>
        <ul>
          <li>Your name and email address when you create an account</li>
          <li>
            Your dietary profile: goals, calorie targets, allergies, dietary preferences, budget,
            and cooking preferences
          </li>
          <li>Meal plans you generate and save</li>
          <li>
            Basic usage events (e.g. page views, plan generations) for analytics — stored in our
            database, not shared with third parties
          </li>
          <li>
            A truncated, partial IP address (the last 8 characters only) logged against page
            views, demo plan generations, free-limit events, and referral visits. This is kept for
            abuse prevention and basic analytics — we do not retain your full IP address, and it
            is not used to identify individuals.
          </li>
        </ul>
      </section>

      <section id="how-we-use-your-data">
        <h2>How we use your data</h2>
        <ul>
          <li>To generate personalised meal plans using the AI model described below</li>
          <li>To maintain your account and remember your preferences</li>
          <li>To send you transactional emails (password reset, plan reminders) if you opt in</li>
          <li>To improve the product based on aggregated, anonymous usage patterns</li>
          <li>
            To enforce the free-plan limit of 3 meal plans per 30 days (Pro accounts have no
            limit)
          </li>
        </ul>
      </section>

      <section id="anthropic-claude-api">
        <h2>Anthropic Claude API</h2>
        <p>
          When you generate a meal plan, your dietary profile (goals, calorie targets, allergies,
          preferences) is sent to Anthropic's Claude API to produce the plan. We do not send your
          name or email to Anthropic. Anthropic's use of API data is governed by their{' '}
          <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener">
            privacy policy
          </a>
          . Anthropic does not use API inputs to train their models by default.
        </p>
      </section>

      <section id="stripe">
        <h2>Stripe</h2>
        <p>
          Payments are processed by Stripe. When you upgrade to Pro, your payment details go
          directly to Stripe — Mealzy never sees or stores your card number. Stripe's privacy
          policy is available at{' '}
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener">
            stripe.com/privacy
          </a>
          .
        </p>
      </section>

      <section id="cookies-analytics">
        <h2>Cookies &amp; analytics</h2>
        <p>
          We use one httpOnly cookie to keep you signed in (a JWT session token). No tracking
          cookies are set until you accept analytics in the cookie banner. Once accepted, we load
          Google Analytics to help us understand how Mealzy is used and improve the product. It
          does not receive your dietary profile or meal plan content.
        </p>
      </section>

      <section id="hosting-infrastructure">
        <h2>Hosting &amp; infrastructure</h2>
        <p>
          Mealzy's application server is hosted on Render, in Render's default US data center
          (Oregon, USA) unless we've configured otherwise. Our database runs on Turso (libSQL),
          hosted on AWS in the eu-west-1 region (Ireland). If you are in the EEA/UK, this means
          your account and profile data are stored in the EU, while application processing and
          logs may pass through US infrastructure; see Render's{' '}
          <a href="https://render.com/privacy" target="_blank" rel="noopener">
            privacy policy
          </a>{' '}
          and Turso's{' '}
          <a href="https://turso.tech/privacy-policy" target="_blank" rel="noopener">
            privacy policy
          </a>{' '}
          for details on their respective safeguards.
        </p>
      </section>

      <section id="data-retention">
        <h2>Data retention</h2>
        <p>
          Your data is stored in our database for as long as your account is active. We do not
          sell, rent, or share your personal data with any third parties for marketing purposes.
        </p>
      </section>

      <section id="deleting-your-account">
        <h2>Deleting your account</h2>
        <p>
          You can request full deletion of your account and all associated data by emailing{' '}
          <a href="mailto:support@mealzy.org">support@mealzy.org</a>. We will delete your data
          within 30 days of receiving your request.
        </p>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p>
          Questions about this policy? Email{' '}
          <a href="mailto:support@mealzy.org">support@mealzy.org</a>.
        </p>
      </section>
    </LegalLayout>
  );
}

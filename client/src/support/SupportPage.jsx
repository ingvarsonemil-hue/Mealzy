import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/marketing/PageHero';
import { Input, Label } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

/* PAGE COPY — copied verbatim from public/support.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const CATEGORIES = [
  {
    heading: 'Account',
    faqs: [
      {
        q: 'I forgot my password. How do I reset it?',
        a: "You can reset your password from the sign-in page — click Forgot password and we'll email you a reset link.",
        search: "I forgot my password. How do I reset it? You can reset your password from the sign-in page — click Forgot password and we'll email you a reset link."
      },
      {
        q: 'How do I change my goal, diet, or calorie target?',
        a: <>Go to <a href="settings.html">Settings</a> and update your profile. Your next meal plan will use the new settings automatically.</>,
        search: 'How do I change my goal, diet, or calorie target? Go to Settings and update your profile. Your next meal plan will use the new settings automatically.'
      },
      {
        q: 'Can I try Mealzy without an account?',
        a: <>Yes — the homepage has a free demo that generates a 5-day plan with no signup. You get 3 free plans per month. To save plans and generate more, create a free account at <a href="index.html">mealzy.org</a>.</>,
        search: 'Can I try Mealzy without an account? Yes — the homepage has a free demo that generates a 5-day plan with no signup. You get 3 free plans per month. To save plans and generate more, create a free account at mealzy.org.'
      }
    ]
  },
  {
    heading: 'Meal Plans',
    faqs: [
      {
        q: "The calories in my plan don't match my target.",
        a: <>Check your calorie target in <a href="settings.html">Settings</a>. Make sure it's set correctly, then regenerate your plan. If the plan is still off by more than 200 kcal, email us — that's a bug.</>,
        search: "The calories in my plan don't match my target. Check your calorie target in Settings. Make sure it's set correctly, then regenerate your plan. If the plan is still off by more than 200 kcal, email us — that's a bug."
      },
      {
        q: "My plan includes foods I can't eat.",
        a: <>Go to <a href="settings.html">Settings</a> and update your dietary preferences. Select all restrictions that apply (vegan, gluten-free, etc.). Then regenerate your plan. If a restricted ingredient keeps appearing, email us with your account email and the specific ingredient — that's a bug we'll fix.</>,
        search: "My plan includes foods I can't eat. Go to Settings and update your dietary preferences. Select all restrictions that apply (vegan, gluten-free, etc.). Then regenerate your plan. If a restricted ingredient keeps appearing, email us with your account email and the specific ingredient — that's a bug we'll fix."
      },
      {
        q: "How do I swap a meal I don't like?",
        a: 'Click on any meal in your plan and select "Swap this meal." The AI will replace just that one meal with something different. You can swap as many meals as you like.',
        search: 'How do I swap a meal I don\'t like? Click on any meal in your plan and select "Swap this meal." The AI will replace just that one meal with something different. You can swap as many meals as you like.'
      },
      {
        q: 'My plan disappeared after I closed the app.',
        a: <>Log in and check your <a href="dashboard.html">Dashboard</a> — your latest plan is saved automatically. If it's missing, email us with your account email and the date you generated the plan.</>,
        search: "My plan disappeared after I closed the app. Log in and check your Dashboard — your latest plan is saved automatically. If it's missing, email us with your account email and the date you generated the plan."
      }
    ]
  },
  {
    heading: 'Pro & Billing',
    faqs: [
      {
        q: 'What does Pro include?',
        a: <>Pro gives you unlimited meal plans, grocery list export, PDF download, Mia the AI nutrition coach, detailed macros per meal, and streak rewards. It's $8/month or $96/year. See the full comparison at <a href="pricing.html">pricing</a>.</>,
        search: "What does Pro include? Pro gives you unlimited meal plans, grocery list export, PDF download, Mia the AI nutrition coach, detailed macros per meal, and streak rewards. It's $8/month or $96/year. See the full comparison at pricing."
      },
      {
        q: "I paid but I'm still on the free plan.",
        a: <>Pro usually activates within 60 seconds. If it hasn't after 5 minutes, <a href="mailto:support@mealzy.org">email our support team</a> with your payment confirmation email — we'll activate it manually within a few hours.</>,
        search: "I paid but I'm still on the free plan. Pro usually activates within 60 seconds. If it hasn't after 5 minutes, email our support team with your payment confirmation email — we'll activate it manually within a few hours."
      },
      {
        q: 'How do I cancel my subscription?',
        a: <>Go to <a href="settings.html">Settings</a> and scroll to the Subscription section. You'll keep Pro access until the end of your current billing period. Your plans and data are never deleted.</>,
        search: "How do I cancel my subscription? Go to Settings and scroll to the Subscription section. You'll keep Pro access until the end of your current billing period. Your plans and data are never deleted."
      },
      {
        q: 'Can I get a refund?',
        a: <>Yes — we offer a full refund within 7 days of subscribing if you haven't found it useful. <a href="mailto:support@mealzy.org">Email our support team</a> with your request and payment confirmation.</>,
        search: "Can I get a refund? Yes — we offer a full refund within 7 days of subscribing if you haven't found it useful. Email our support team with your request and payment confirmation."
      }
    ]
  },
  {
    heading: 'AI Coach (Mia)',
    faqs: [
      {
        q: 'Where is the AI coach?',
        a: <>Mia is a Pro feature. Once you're on Pro, she appears in the <a href="ai-coach.html">AI Coach</a> section of your dashboard. She knows your profile and can answer nutrition questions, explain your meal plan, and help you stay on track.</>,
        search: "Where is the AI coach? Mia is a Pro feature. Once you're on Pro, she appears in the AI Coach section of your dashboard. She knows your profile and can answer nutrition questions, explain your meal plan, and help you stay on track."
      },
      {
        q: "Is Mia's advice medically accurate?",
        a: 'Mia is an AI assistant providing general nutrition guidance — not a doctor or registered dietitian. For medical nutrition advice, always consult a qualified healthcare professional. If you spot a specific error in her advice, please report it to us.',
        search: "Is Mia's advice medically accurate? Mia is an AI assistant providing general nutrition guidance — not a doctor or registered dietitian. For medical nutrition advice, always consult a qualified healthcare professional. If you spot a specific error in her advice, please report it to us."
      }
    ]
  }
];

export default function SupportPage() {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <PageHero
          title="Help & Support"
          lede="Find answers to common questions below. If you don't find what you need, email us — we reply within 24 hours."
        />

        <div className="mx-auto max-w-prose px-4 pb-16 pt-10 sm:px-5">
          <div role="search" aria-label="Search support articles" className="mb-10">
            <Label htmlFor="faqSearch" className="sr-only">Search FAQ</Label>
            <Input
              id="faqSearch" type="search" placeholder="Search help articles"
              value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {CATEGORIES.map((cat) => {
            const visible = cat.faqs.filter((f) => !q || f.search.toLowerCase().includes(q));
            if (!visible.length) return null;
            return (
              <div key={cat.heading}>
                <h2 className="mt-10 border-b border-border-warm pb-2 font-display text-[1.3rem] font-bold italic text-foreground first:mt-0">
                  {cat.heading}
                </h2>
                <dl>
                  {visible.map((f) => (
                    <React.Fragment key={f.q}>
                      <dt className="mt-6 text-[0.92rem] font-semibold">{f.q}</dt>
                      <dd className="mb-2 mt-1.5 text-[0.88rem] leading-[1.7] text-muted-fg">{f.a}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            );
          })}

          <div className="mt-14 rounded-lg border border-border-warm bg-cream p-8 text-center">
            <h2 className="font-display text-xl font-bold italic">Still need help?</h2>
            <p className="mt-2 mb-5 text-muted-fg">Email us directly and we'll reply within 24 hours on weekdays.</p>
            <Button href="mailto:support@mealzy.org?subject=Mealzy Support">Email support@mealzy.org</Button>
            <p className="mt-4 text-[0.82rem] text-muted-fg">When reporting a bug, include: your account email, what you were doing, and what happened instead.</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import LegalPage, { LEGAL_CONTACT, P, Section, Ul } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — Akli" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="24 November 2026">
      <div style={{ marginTop: 24 }}>
        <P>
          Akli is a meal-prep delivery service run by {LEGAL_CONTACT.company}, based in {LEGAL_CONTACT.place}. This policy explains
          what personal information the Akli app and website (app.akli-lb.org) collect, why we collect it, who sees it, and the
          choices you have. By using Akli you agree to this policy.
        </P>
      </div>

      <Section title="What we collect">
        <Ul>
          <li><strong>Account details.</strong> Your first and last name, email address, phone number and date of birth. Your password is kept by our sign-in provider in scrambled form, so we cannot read it.</li>
          <li><strong>Body and nutrition details you choose to give us.</strong> Sex, height, weight, activity level, goal and diet type, plus figures calculated from them such as your BMI and your calorie and macro targets, the allergens you declare, and the recipes you like, dislike or exclude. This is health-related information. We use it only to build your meal plan and keep your allergens out of it.</li>
          <li><strong>Food diary.</strong> The foods you log by search, barcode scan or chat, and the messages you type to the food diary assistant.</li>
          <li><strong>Delivery details.</strong> The addresses you save (the written address and map coordinates), your delivery slots, and notes such as whether you need cutlery.</li>
          <li><strong>Orders and payments.</strong> Your meal plans, orders and delivery status, wallet balance and transactions, promo codes used, cancellation requests, and the payment method you chose (cash, Whish or Neo) with its amount and status. We do not store card numbers or bank details.</li>
          <li><strong>Usage data.</strong> A random visitor ID kept on your device, the pages you view, your device type, browser and operating system, and how you reached us (for example a campaign link). Once you sign in, this is linked to your account. The app contains no third-party advertising trackers.</li>
          <li><strong>Camera.</strong> Barcode scanning in the food diary uses your camera on your device. Pictures are not saved or uploaded; only the barcode number is looked up.</li>
          <li><strong>Location.</strong> If you tap &ldquo;use my location&rdquo; when adding an address, the app reads your phone&rsquo;s location once to place a pin. We keep the address you confirm, not a history of where you have been.</li>
          <li><strong>Notifications.</strong> If you allow them, a device token so we can send you order updates. You can switch notifications off in your phone settings at any time.</li>
        </Ul>
      </Section>

      <Section title="How we use it">
        <Ul>
          <li>To create your account, build your meal plan, prepare and deliver your orders, and take payment.</li>
          <li>To contact you about your orders, including by WhatsApp, and to give you support.</li>
          <li>To warn you about allergens, and to keep your nutrition targets and food diary working.</li>
          <li>To understand how the app is used, fix problems and prevent fraud or abuse.</li>
          <li>To meet our legal, tax and accounting obligations.</li>
        </Ul>
        <P>We do not sell your personal information, and we do not use it for third-party advertising.</P>
      </Section>

      <Section title="Who we share it with">
        <Ul>
          <li><strong>Our kitchen and delivery team</strong> see what they need to prepare and deliver your order: your name, phone number, address, delivery notes, what you ordered, and the allergens you declared.</li>
          <li><strong>Service providers that process data for us:</strong> Supabase (our database and sign-in, hosted in Europe, Paris region), Vercel (website hosting), Heroku (runs our meal-plan solver, which receives your account ID and dates), Resend (sends our emails), and Anthropic (powers the food diary assistant; it receives only the chat messages you type, not your name, phone number or address).</li>
          <li><strong>Lookup services:</strong> OpenStreetMap (address search and map pins; it receives the text you search or the pin&rsquo;s coordinates), Open Food Facts and USDA FoodData Central (food and barcode searches, with no personal details), and Google Fonts (loads the app&rsquo;s typefaces, so Google can see your IP address).</li>
          <li><strong>Payment providers</strong> such as Whish and Neo, if you choose to pay with them, under their own terms.</li>
          <li><strong>Authorities,</strong> when the law requires it.</li>
        </Ul>
      </Section>

      <Section title="Where it is stored">
        <P>
          Your data is stored with Supabase in Europe. Some of our other providers may process data in other countries, including
          the United States. By using Akli you accept that your information may be handled outside Lebanon.
        </P>
      </Section>

      <Section title="How long we keep it">
        <P>We keep your information while your account is open.</P>
        <P>
          When you delete your account (Profile, then Delete account) we permanently remove your name, email, phone number,
          date of birth, saved addresses, body and nutrition details, allergens, preferences, food diary, assistant chats and
          notification tokens. Order, delivery and payment records are kept without any link to you, because we need them for
          accounting and tax.
        </P>
      </Section>

      <Section title="Your choices and rights">
        <Ul>
          <li>You can view and change your details in your Profile at any time.</li>
          <li>You can delete your account yourself in the app, or ask us to do it.</li>
          <li>You can ask us for a copy of your information, or to correct it, by contacting us below.</li>
          <li>If you live somewhere with data-protection laws (for example Lebanon&rsquo;s Law No. 81 of 2018, or the EU and UK GDPR), you have the rights those laws give you, including the right to complain to your local authority.</li>
        </Ul>
      </Section>

      <Section title="Security">
        <P>
          Akli uses encrypted connections, and access to your data is limited by database access rules and staff roles. No system is
          perfectly secure, so please choose a strong password and keep it private.
        </P>
      </Section>

      <Section title="Children">
        <P>Akli is not meant for anyone under 16. If you believe a child has given us information, contact us and we will delete it.</P>
      </Section>

      <Section title="Changes to this policy">
        <P>If we change this policy we will update the date above, and tell you in the app if the change is important.</P>
      </Section>

      <Section title="Contact us">
        <P>
          Questions or requests about your information: WhatsApp {LEGAL_CONTACT.whatsapp}, or email{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </P>
      </Section>
    </LegalPage>
  );
}

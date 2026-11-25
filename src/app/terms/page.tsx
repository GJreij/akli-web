import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { LEGAL_CONTACT, P, Section, Ul } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Use — Akli" };

// Cancellation, refund and wallet specifics are deliberately left to the app so
// they can change without editing these terms.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="25 November 2026">
      <div style={{ marginTop: 24 }}>
        <P>
          These terms apply when you use the Akli app and website (app.akli-lb.org). Akli is a meal-prep delivery service run by{" "}
          {LEGAL_CONTACT.company}, based in {LEGAL_CONTACT.place}. By creating an account or placing an order, you agree to them.
          Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your information.
        </P>
      </div>

      <Section title="Your account">
        <Ul>
          <li>You must be at least 16 and give us accurate information.</li>
          <li>Keep your password private. You are responsible for what happens on your account.</li>
          <li>We may suspend an account that is used to abuse the service, other customers or our team.</li>
          <li>You can delete your account at any time from your Profile.</li>
        </Ul>
      </Section>

      <Section title="Meal plans, nutrition and allergens">
        <P>
          Your plan is generated from the details you give us. Calorie and macro targets are estimates to help you plan your
          eating; they are not medical advice. If you have a medical condition, are pregnant, or follow a medical diet, talk to
          your doctor or dietitian first.
        </P>
        <P>
          We show the main allergens found in each recipe and warn you about the allergens you declare. Our kitchen handles
          ingredients such as nuts, gluten, dairy and sesame, so we cannot guarantee that a meal is free of traces. If you have a
          severe allergy, contact us before you order.
        </P>
      </Section>

      <Section title="Orders and delivery">
        <Ul>
          <li>We deliver only to the areas and delivery slots shown in the app. The earliest delivery date you can pick is shown when you order.</li>
          <li>Prices, delivery fees, discounts and any minimums are shown at checkout, before you confirm.</li>
          <li>Someone needs to be available to receive the delivery at your address and slot. Please keep your address and phone number up to date.</li>
          <li>We may close the kitchen on certain days. Those days are shown in the app and cannot be ordered.</li>
        </Ul>
      </Section>

      <Section title="Payment and wallet">
        <P>
          You can pay by cash, Whish or Neo, and you can use credit in your Akli wallet toward an order. Wallet credit is applied
          to your orders as shown in the app.
        </P>
      </Section>

      <Section title="Changes and cancellations">
        <P>
          You can ask to change or cancel an upcoming delivery from your Orders page. The conditions, such as cut-off times, are
          shown in the app when you make a request. We review each request, and the app tells you the outcome.
        </P>
      </Section>

      <Section title="Using Akli properly">
        <P>
          Do not misuse the app, try to break or scrape it, or use it to harass our team or other customers. Food-diary and chat
          features exist for logging what you eat; they are not a substitute for professional advice.
        </P>
      </Section>

      <Section title="Our responsibility">
        <P>
          We take care to prepare and deliver your meals safely and on time. To the extent the law allows, we are not liable for
          indirect or consequential losses, and our total liability for an order is limited to what you paid for it. Nothing in
          these terms limits any right you have that cannot be limited by law.
        </P>
      </Section>

      <Section title="Changes to these terms">
        <P>We may update these terms. The date above shows the latest version, and we will tell you in the app about important changes.</P>
      </Section>

      <Section title="Governing law and contact">
        <P>
          These terms are governed by the laws of Lebanon. Questions: WhatsApp {LEGAL_CONTACT.whatsapp}, or email{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </P>
      </Section>
    </LegalPage>
  );
}

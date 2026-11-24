import type { Metadata } from "next";
import LegalPage, { LEGAL_CONTACT, P, Section, Ul } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Delete your account — Akli" };

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your Akli account" updated="24 November 2026">
      <div style={{ marginTop: 24 }}>
        <P>You can delete your Akli account yourself in the app, or ask us to do it for you.</P>
      </div>

      <Section title="In the app">
        <Ul>
          <li>Sign in, open <strong>Profile</strong>, scroll to <strong>Delete account</strong>, and follow the steps.</li>
          <li>You need to have no upcoming deliveries (cancel them from your Orders page first) and your wallet needs to be at zero. If you have credit left, message us and we will refund it first.</li>
        </Ul>
      </Section>

      <Section title="Without the app">
        <P>
          Message us on WhatsApp at {LEGAL_CONTACT.whatsapp}, or email{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>, from the phone number or email address on your
          account. We will confirm it is you, delete the account and tell you when it is done.
        </P>
      </Section>

      <Section title="What is deleted, and what is kept">
        <Ul>
          <li><strong>Deleted:</strong> your name, email, phone number, date of birth, saved addresses, body and nutrition details, allergens, recipe preferences, food diary, assistant chats, and any notification tokens. You are signed out everywhere and can no longer log in.</li>
          <li><strong>Kept, without any link to you:</strong> past orders, deliveries and payment records, because we need them for accounting and tax.</li>
        </Ul>
      </Section>
    </LegalPage>
  );
}

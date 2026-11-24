import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { LEGAL_CONTACT, P, Section, Ul } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Help and contact — Akli" };

export default function SupportPage() {
  return (
    <LegalPage title="Help and contact" updated="24 November 2026">
      <div style={{ marginTop: 24 }}>
        <P>The fastest way to reach us is WhatsApp. We reply to orders, deliveries and account questions there.</P>
        <P>
          <strong>WhatsApp:</strong>{" "}
          <a href="https://wa.me/96181567192">{LEGAL_CONTACT.whatsapp}</a>
          <br />
          <strong>Email:</strong> <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>
        </P>
      </div>

      <Section title="Common questions">
        <Ul>
          <li><strong>Change or cancel a delivery.</strong> Open <strong>Orders</strong> in the app and request the change there. We review it and the app shows you the outcome.</li>
          <li><strong>Allergies.</strong> Add your allergens in <strong>Profile</strong> and we will warn you before you order. If you have a severe allergy, message us before ordering.</li>
          <li><strong>Wallet credit or a refund.</strong> Message us on WhatsApp and we will sort it out.</li>
          <li><strong>Delivery area and times.</strong> Akli delivers in Lebanon. The areas and delivery slots you can pick are shown when you order.</li>
          <li><strong>Delete your account.</strong> See <Link href="/delete-account">how to delete your account</Link>.</li>
        </Ul>
      </Section>

      <Section title="More">
        <P>
          <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Use</Link>
        </P>
      </Section>
    </LegalPage>
  );
}

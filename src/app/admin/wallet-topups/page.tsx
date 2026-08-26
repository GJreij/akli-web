import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, C } from "@/components/admin/ui";
import WalletTopupRow, { type PendingTopup } from "./WalletTopupRow";

type RawRequest = {
  id: number;
  user_id: string;
  amount: number;
  payment_note: string | null;
  requested_at: string;
};

export default async function WalletTopupsPage() {
  const supabase = await createClient();

  const requestsRes = await supabase
    .from("wallet_topup_request")
    .select("id, user_id, amount, payment_note, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  const requests = (requestsRes.data ?? []) as RawRequest[];

  if (requests.length === 0) {
    return (
      <div style={{ padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <PageHeader title="Wallet top-ups" />
          <Section>
            <p style={{ margin: 0, fontSize: 13, color: C.light }}>No pending wallet top-up requests.</p>
          </Section>
        </div>
      </div>
    );
  }

  const userIds = [...new Set(requests.map(r => r.user_id))];
  const usersRes = await supabase.from("user").select("id, name, last_name, phone_number").in("id", userIds);
  const users = (usersRes.data ?? []) as { id: string; name: string | null; last_name: string | null; phone_number: string | null }[];
  const userMap = new Map(users.map(u => [u.id, u]));

  const pending: PendingTopup[] = requests.map(r => {
    const user = userMap.get(r.user_id);
    return {
      id: r.id,
      user_id: r.user_id,
      amount: r.amount,
      payment_note: r.payment_note,
      requested_at: r.requested_at,
      clientName: user ? `${user.name ?? ""} ${user.last_name ?? ""}`.trim() || "Unknown client" : "Unknown client",
      clientPhone: user?.phone_number ?? null,
    };
  });

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <PageHeader title="Wallet top-ups" />
        <Section title={`Pending review (${pending.length})`}>
          {pending.map(req => <WalletTopupRow key={req.id} req={req} />)}
        </Section>
      </div>
    </div>
  );
}

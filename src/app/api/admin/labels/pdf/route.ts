import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { fetchLabelsForRange } from "@/lib/labels";
import { generateLabelComments } from "@/lib/labelComments";
import LabelPdfDocument, { type LabelPdfOptions, type PaperSize, type Orientation } from "@/components/admin/labels/LabelPdfDocument";

// AI comments add ~20-40s per run (batches run in parallel, plus one
// rewrite pass); 120s leaves headroom for a big week of labels.
export const maxDuration = 120;

const PAPER_SIZES: PaperSize[] = ["A3", "A4", "A5", "LETTER"];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileRes = await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileRes.data?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { start, end, userIds, options } = body as {
    start?: string;
    end?: string;
    userIds?: string[];
    options?: Partial<LabelPdfOptions>;
  };

  if (!start || !end) {
    return NextResponse.json({ error: "start and end dates are required" }, { status: 400 });
  }

  const paperSize = PAPER_SIZES.includes(options?.paperSize as PaperSize) ? (options!.paperSize as PaperSize) : "A4";
  const orientation = ORIENTATIONS.includes(options?.orientation as Orientation) ? (options!.orientation as Orientation) : "portrait";
  const marginMm = Number(options?.marginMm);
  const labelWidthMm = Number(options?.labelWidthMm);
  const labelHeightMm = Number(options?.labelHeightMm);

  const resolvedOptions: LabelPdfOptions = {
    paperSize,
    orientation,
    marginMm: Number.isFinite(marginMm) && marginMm >= 0 ? marginMm : 0,
    labelWidthMm: Number.isFinite(labelWidthMm) && labelWidthMm > 0 ? labelWidthMm : 52,
    labelHeightMm: Number.isFinite(labelHeightMm) && labelHeightMm > 0 ? labelHeightMm : 52,
    stroke: options?.stroke !== false,
    includeComments: options?.includeComments !== false,
  };

  const labels = await fetchLabelsForRange(supabase, start, end, userIds && userIds.length > 0 ? userIds : undefined);

  if (labels.length === 0) {
    return NextResponse.json({ error: "No labels found for the selected range/clients" }, { status: 404 });
  }

  // Comments are a nice-to-have: if generation fails the PDF still prints,
  // and the header tells the form to warn the admin.
  let commentsFailed = 0;
  if (resolvedOptions.includeComments && process.env.ANTHROPIC_API_KEY) {
    const { comments, failedBatches } = await generateLabelComments(supabase, labels, user.id);
    comments.forEach((c, i) => { if (c) labels[i].comment = c; });
    commentsFailed = failedBatches;
  } else if (resolvedOptions.includeComments) {
    commentsFailed = 1;
  }

  const buffer = await renderToBuffer(LabelPdfDocument({ labels, options: resolvedOptions }));

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="labels_${start}_to_${end}.pdf"`,
      ...(commentsFailed > 0 ? { "X-Label-Comments-Failed": String(commentsFailed) } : {}),
    },
  });
}

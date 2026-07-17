import { Document, Page, View, Text, Font, StyleSheet } from "@react-pdf/renderer";
import type { LabelData } from "@/lib/labels";

Font.register({
  family: "Playfair Display",
  fonts: [
    { src: "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vUDQ.ttf", fontWeight: 500 },
    { src: "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKebukDQ.ttf", fontWeight: 600 },
  ],
});

export type PaperSize = "A3" | "A4" | "A5" | "LETTER";
export type Orientation = "portrait" | "landscape";

export interface LabelPdfOptions {
  paperSize: PaperSize;
  orientation: Orientation;
  marginMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  stroke: boolean;
}

const PAPER_SIZES_MM: Record<PaperSize, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  LETTER: [215.9, 279.4],
};

const MM_TO_PT = 2.834645669;
const mm = (v: number) => v * MM_TO_PT;

const PRIMARY = "#063330";
const OFF_WHITE = "#eee9e6";
const MUTED = "#5c5c5c";

export function computeGrid(options: LabelPdfOptions) {
  const [baseW, baseH] = PAPER_SIZES_MM[options.paperSize];
  const [pageWidthMm, pageHeightMm] = options.orientation === "landscape" ? [baseH, baseW] : [baseW, baseH];

  const usableWidthMm = pageWidthMm - 2 * options.marginMm;
  const usableHeightMm = pageHeightMm - 2 * options.marginMm;

  const cols = Math.max(1, Math.floor(usableWidthMm / options.labelWidthMm));
  const rows = Math.max(1, Math.floor(usableHeightMm / options.labelHeightMm));

  return { pageWidthMm, pageHeightMm, cols, rows, perPage: cols * rows };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function LabelCell({ label, widthMm, heightMm, stroke }: { label: LabelData; widthMm: number; heightMm: number; stroke: boolean }) {
  const scale = Math.min(widthMm / 70, heightMm / 50);
  const styles = StyleSheet.create({
    cell: {
      width: mm(widthMm),
      height: mm(heightMm),
      backgroundColor: OFF_WHITE,
      border: stroke ? "0.5pt solid " + PRIMARY : "none",
      padding: mm(3 * scale),
      display: "flex",
      flexDirection: "column",
    },
    wordmark: {
      fontFamily: "Playfair Display",
      fontWeight: 600,
      fontSize: 32 * scale,
      color: PRIMARY,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 6 * scale,
      color: MUTED,
      textAlign: "center",
      marginTop: 1,
    },
    rule: {
      borderBottom: "0.5pt solid " + PRIMARY,
      marginVertical: 3 * scale,
    },
    mealType: {
      fontFamily: "Playfair Display",
      fontWeight: 500,
      fontSize: 13 * scale,
      color: PRIMARY,
      textAlign: "center",
    },
    row: {
      fontSize: 8 * scale,
      color: PRIMARY,
      marginBottom: 1.5 * scale,
    },
    bold: { fontWeight: 700 },
    macroLine: {
      fontSize: 8 * scale,
      color: PRIMARY,
      textAlign: "center",
    },
  });

  return (
    <View style={styles.cell} wrap={false}>
      <Text style={styles.wordmark}>akli</Text>
      <Text style={styles.subtitle}>Personalised nutrition. Precision macros.</Text>
      <View style={styles.rule} />
      <Text style={styles.mealType}>{label.meal_type}</Text>
      <View style={styles.rule} />
      <Text style={styles.row}>
        <Text style={styles.bold}>For : </Text>
        {label.client_name} {label.client_last_name}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.bold}>Recipe: </Text>
        {label.recipe_name}
      </Text>
      <View style={styles.rule} />
      <Text style={styles.macroLine}>
        {label.kcal} kcal   P {label.protein}   C {label.carbs}   F {label.fat}
      </Text>
      <View style={styles.rule} />
      <Text style={styles.row}>
        <Text style={styles.bold}>Production: </Text>
        {label.production_date}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.bold}>Batch Code: </Text>
        {label.batch_code}
      </Text>
    </View>
  );
}

export default function LabelPdfDocument({ labels, options }: { labels: LabelData[]; options: LabelPdfOptions }) {
  const { pageWidthMm, pageHeightMm, perPage } = computeGrid(options);
  const pages = chunk(labels, perPage);

  return (
    <Document>
      {pages.map((pageLabels, pageIndex) => (
        <Page
          key={pageIndex}
          size={{ width: mm(pageWidthMm), height: mm(pageHeightMm) }}
          style={{ padding: mm(options.marginMm) }}
          wrap={false}
        >
          <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap" }} wrap={false}>
            {pageLabels.map((label, i) => (
              <LabelCell key={i} label={label} widthMm={options.labelWidthMm} heightMm={options.labelHeightMm} stroke={options.stroke} />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}

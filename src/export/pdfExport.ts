// Plan → PDF (Phase 7). Snapshots the live Konva stage, lays it on A4
// landscape with the garden name, a timestamp, and a scale bar derived
// from the current viewport zoom.
//
// v0.1 has no real pixels-per-foot reference (the §6.2 scale_reference
// is optional and unset), so the legend is in *canvas units* — honest
// and correct relative to the viewport. A foot-calibrated legend is a
// v0.2 item (see DECISIONS ADR-012).

import { jsPDF } from "jspdf";
import { stageRegistry } from "../canvas/stageRegistry";

const A4_LANDSCAPE = { w: 297, h: 210 }; // mm
const MARGIN = 14;

function niceRound(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return nice * pow;
}

export interface PdfExportArgs {
  gardenName: string;
  viewportScale: number;
}

/** Build the plan PDF; returns the raw bytes. Throws if no stage. */
export function buildPlanPdf({ gardenName, viewportScale }: PdfExportArgs): Uint8Array {
  const stage = stageRegistry.current;
  if (!stage) throw new Error("Canvas not ready for export.");

  const stageW = stage.width();
  const stageH = stage.height();
  if (stageW < 1 || stageH < 1) throw new Error("Canvas has no size to export.");

  const dataUrl = stage.toDataURL({ pixelRatio: 2 });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(gardenName || "Garden plan", MARGIN, MARGIN);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `Exported ${new Date().toLocaleString()}`,
    A4_LANDSCAPE.w - MARGIN,
    MARGIN,
    { align: "right" },
  );
  doc.setTextColor(0);

  // Fit the snapshot into the area below the title, above the legend.
  const topY = MARGIN + 6;
  const bottomReserve = 18;
  const maxW = A4_LANDSCAPE.w - MARGIN * 2;
  const maxH = A4_LANDSCAPE.h - topY - bottomReserve;
  const ratio = Math.min(maxW / stageW, maxH / stageH);
  const imgW = stageW * ratio;
  const imgH = stageH * ratio;
  doc.addImage(dataUrl, "PNG", MARGIN, topY, imgW, imgH);

  // Scale bar. The image is `imgW` mm wide and spans
  // `stageW / viewportScale` canvas units. Pick a nice unit count near
  // a quarter of the view and draw a proportional bar.
  const unitsAcross = stageW / Math.max(viewportScale, 0.0001);
  const barUnits = niceRound(unitsAcross / 4);
  const barMm = (barUnits / unitsAcross) * imgW;
  const barY = topY + imgH + 8;
  doc.setLineWidth(0.6);
  doc.line(MARGIN, barY, MARGIN + barMm, barY);
  doc.line(MARGIN, barY - 1.5, MARGIN, barY + 1.5);
  doc.line(MARGIN + barMm, barY - 1.5, MARGIN + barMm, barY + 1.5);
  doc.setFontSize(9);
  doc.text(`${barUnits} canvas units`, MARGIN + barMm + 4, barY + 1);

  return new Uint8Array(doc.output("arraybuffer"));
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BrainliftData } from '@shared/schema';

export function usePDFExport() {
  const downloadBrainliftPDF = (data: BrainliftData) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = 14;
    const marginRight = 14;
    const maxWidth = pageWidth - marginLeft - marginRight;
    let y = 20;

    doc.setFontSize(20);
    doc.setTextColor(30, 58, 95);
    const titleLines = doc.splitTextToSize(data.title, maxWidth);
    doc.text(titleLines, marginLeft, y);
    y += titleLines.length * 8 + 4;

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    const descLines = doc.splitTextToSize(data.description, maxWidth);
    doc.text(descLines, marginLeft, y);
    y += descLines.length * 5 + 3;

    if (data.author) {
      doc.setTextColor(13, 148, 136);
      doc.text(`By ${data.author}`, marginLeft, y);
      y += 8;
    } else {
      y += 3;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Summary', marginLeft, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`Total Facts: ${data.summary.totalFacts}  |  Mean Score: ${data.summary.meanScore}`, marginLeft, y);
    y += 5;
    doc.text(`Highly Verified (5/5): ${data.summary.score5Count}  |  With Contradictions: ${data.summary.contradictionCount}`, marginLeft, y);
    y += 10;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Facts', marginLeft, y);
    y += 4;

    const sortedFacts = [...data.facts].sort((a, b) => b.score - a.score || a.originalId.localeCompare(b.originalId));

    autoTable(doc, {
      startY: y,
      head: [['Fact ID', 'Fact (as written)', 'Correctness (1-5)', 'Verification Notes']],
      body: sortedFacts.map(f => {
        const scoreLabel = f.score === 5 ? 'Verified' : f.score === 4 ? 'Mostly Verified' : f.score === 3 ? 'Partially Verified' : f.score === 2 ? 'Weakly Verified' : 'Not Verified';
        const contradictionNote = f.contradicts ? ` [Contradicts: ${f.contradicts}]` : '';
        return [
          f.originalId,
          f.fact,
          `${f.score} - ${scoreLabel}`,
          (f.note || 'No verification notes') + contradictionNote,
        ];
      }),
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 55 },
        2: { cellWidth: 28 },
        3: { cellWidth: 'auto' },
      },
      margin: { left: marginLeft, right: marginRight },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Contradiction Clusters', marginLeft, y);
    y += 4;

    if (data.contradictionClusters.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Cluster', 'Tension', 'Status', 'Fact IDs', 'Claims']],
        body: data.contradictionClusters.map(c => [
          c.name,
          c.tension,
          c.status,
          (c.factIds as string[]).join(', '),
          (c.claims as string[]).join('; '),
        ]),
        styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [245, 158, 11], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 45 },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 'auto' },
        },
        margin: { left: marginLeft, right: marginRight },
      });
    } else {
      y += 4;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('No contradictions identified in this analysis.', marginLeft, y);
    }

    doc.save(`${data.slug}-brainlift.pdf`);
  };

  return { downloadBrainliftPDF };
}

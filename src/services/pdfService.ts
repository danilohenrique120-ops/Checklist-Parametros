import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChecklistRecord, ReactorMetadata } from '../types/bioreactor';
import { SCALE_SPECS } from '../constants/reactorConfig';

export interface PDFReportOptions {
  reactor?: ReactorMetadata;
  records: ChecklistRecord[];
  title?: string;
  generatedBy?: string;
  includeDeviationsSummary?: boolean;
}

export function generateBioreactorPDFReport(options: PDFReportOptions): jsPDF {
  const { reactor, records, title, generatedBy = 'Sistema BioTrack' } = options;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BIOTRACK · RELATÓRIO DE MONITORAMENTO E RASTREABILIDADE', 14, 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('CONTROLE DE ESPECIFICAÇÃO DE BIORREATORES INDUSTRIAIS (GMP / BPF)', 14, 19);

  doc.text(`Emissão: ${dateStr} ${timeStr} | Operador: ${generatedBy}`, 196, 19, { align: 'right' });

  // 2. Report Overview Box
  let currentY = 32;

  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(14, currentY, 182, 24, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const reportMainTitle = title || (reactor ? `Biorreator ${reactor.tag} (${reactor.scale})` : 'Relatório Geral Consolidado');
  doc.text(reportMainTitle, 18, currentY + 7);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  const totalRecords = records.length;
  const nominalRecords = records.filter((r) => r.isFullyNominal).length;
  const deviationRecords = totalRecords - nominalRecords;
  const complianceRate = totalRecords > 0 ? ((nominalRecords / totalRecords) * 100).toFixed(1) : '100';

  if (reactor) {
    doc.text(`Escala: ${reactor.scale}  |  Lote Atual: ${reactor.currentBatch || 'N/A'}  |  Total de Checklists: ${totalRecords}`, 18, currentY + 14);
    doc.text(`Taxa de Conformidade: ${complianceRate}% (${nominalRecords} Nominais, ${deviationRecords} com Desvio)`, 18, currentY + 19);
  } else {
    doc.text(`Consolidado de Biorreatores (Tanques 1 ao 16)  |  Total de Registros: ${totalRecords}`, 18, currentY + 14);
    doc.text(`Taxa Global de Conformidade: ${complianceRate}% (${nominalRecords} Nominais, ${deviationRecords} com Desvio)`, 18, currentY + 19);
  }

  if (deviationRecords === 0) {
    doc.setFillColor(220, 252, 231); // emerald-100
    doc.setTextColor(22, 101, 52); // emerald-800
    doc.roundedRect(155, currentY + 4, 36, 7, 1.5, 1.5, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('STATUS: 100% NOMINAL', 173, currentY + 8.5, { align: 'center' });
  } else {
    doc.setFillColor(254, 242, 242); // rose-100
    doc.setTextColor(153, 27, 27); // rose-800
    doc.roundedRect(148, currentY + 4, 43, 7, 1.5, 1.5, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`STATUS: ${deviationRecords} DESVIO(S)`, 169.5, currentY + 8.5, { align: 'center' });
  }

  currentY += 28;

  // 3. Parameter Averages & Specification Table
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const avgTemp = avg(records.map((r) => r.temperature));
  const avgDO = avg(records.map((r) => r.dissolvedOxygen));
  const avgAgit = avg(records.map((r) => r.agitation));
  const avgPress = avg(records.map((r) => r.pressure));
  const avgAir = avg(records.map((r) => r.airflow));

  const scaleToUse = reactor ? reactor.scale : '100L';
  const specs = SCALE_SPECS[scaleToUse];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. MÉDIAS DOS PARÂMETROS & CRITÉRIOS DE ESPECIFICAÇÃO (DELTAS)', 14, currentY);

  const specRows = [
    ['Temperatura', `${avgTemp.toFixed(2)} °C`, '30.0 °C', '± 2.0 °C', '28.0 °C a 32.0 °C'],
    ['Oxigênio Dissolvido', `${avgDO.toFixed(2)} %`, scaleToUse === '100L' || scaleToUse === '5000L' ? 'Curva 4 fases' : 'Livre', '-', scaleToUse === '100L' || scaleToUse === '5000L' ? 'Tabela de Fases (2-58h)' : 'Registro livre'],
    ['Agitação', `${avgAgit.toFixed(1)} RPM`, `${specs.agitation.target} RPM`, 'Sem delta', `${specs.agitation.target} RPM (Fixo)`],
    ['Pressão', `${avgPress.toFixed(2)} bar`, `${specs.pressure.target.toFixed(1)} bar`, '± 0.5 bar', `${(specs.pressure.min ?? 0).toFixed(1)} a ${(specs.pressure.max ?? 0).toFixed(1)} bar`],
    ['Vazão de Ar', `${avgAir.toFixed(1)} L/min`, `${specs.airflow.target} L/min`, '± 10 L/min', `${specs.airflow.min} a ${specs.airflow.max} L/min`],
  ];

  autoTable(doc, {
    startY: currentY + 2,
    head: [['Parâmetro', 'Média Calculada', 'Alvo (Setpoint)', 'Delta Aceitável', 'Faixa Nominal']],
    body: specRows,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      1: { fontStyle: 'bold', textColor: [29, 78, 216] },
    },
    styles: {
      cellPadding: 1.5,
    },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore
  currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : currentY + 36;

  // 4. Checklist Records Table
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. HISTÓRICO DE LEITURAS DE CHECKLIST & RASTREABILIDADE', 14, currentY);

  const tableHead = [
    [
      'Data/Hora',
      'Reator',
      'Lote',
      'Operador',
      'Idade (h)',
      'Temp (°C)',
      'O2 Sonda (%)',
      'Agit (RPM)',
      'Pressão (bar)',
      'Vazão (L/min)',
      'Conformidade',
    ],
  ];

  const tableRows = records.map((rec) => {
    return [
      `${rec.date.split('-').reverse().join('/')} ${rec.time}`,
      rec.reactorTag,
      rec.batchId || '-',
      rec.operatorName,
      `${rec.processHours}h`,
      `${rec.temperature.toFixed(1)}${rec.isTemperatureNominal ? '' : ' ⚠️'}`,
      `${rec.dissolvedOxygen.toFixed(1)}${rec.isDONominal ? '' : ' ⚠️'}`,
      `${rec.agitation}${rec.isAgitationNominal ? '' : ' ⚠️'}`,
      `${rec.pressure.toFixed(2)}${rec.isPressureNominal ? '' : ' ⚠️'}`,
      `${rec.airflow}${rec.isAirflowNominal ? '' : ' ⚠️'}`,
      rec.isFullyNominal ? 'NOMINAL' : `DESVIO (${rec.deviationsCount})`,
    ];
  });

  autoTable(doc, {
    startY: currentY + 2,
    head: tableHead,
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 6.8,
      textColor: [30, 41, 59],
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left' },
      3: { halign: 'left' },
      10: { fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 10) {
        if (data.cell.raw && String(data.cell.raw).startsWith('DESVIO')) {
          data.cell.styles.textColor = [185, 28, 28]; // red
        } else {
          data.cell.styles.textColor = [22, 101, 52]; // green
        }
      }
    },
    styles: {
      cellPadding: 1.6,
    },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore
  let finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : currentY + 60;

  if (finalY > 240) {
    doc.addPage();
    finalY = 20;
  }

  // 5. Observations / Deviations Log if any
  const deviations = records.filter((r) => !r.isFullyNominal || (r.notes && r.notes.length > 0));
  if (deviations.length > 0) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('REGISTRO DE OCORRÊNCIAS / AÇÕES CORRETIVAS', 14, finalY);

    const devBody = deviations.map((d) => [
      `${d.date.split('-').reverse().join('/')} ${d.time}`,
      d.reactorTag,
      d.operatorName,
      d.deviationNotes || 'Parâmetros nominais',
      d.notes || '-',
    ]);

    autoTable(doc, {
      startY: finalY + 2,
      head: [['Data/Hora', 'Reator', 'Operador', 'Desvio Detectado', 'Ação / Observação']],
      body: devBody,
      theme: 'grid',
      headStyles: {
        fillColor: [100, 116, 139],
        textColor: [255, 255, 255],
        fontSize: 6.8,
      },
      bodyStyles: {
        fontSize: 6.5,
        textColor: [30, 41, 59],
      },
      styles: {
        cellPadding: 1.4,
      },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : finalY + 30;
  }

  if (finalY > 250) {
    doc.addPage();
    finalY = 24;
  }

  // 6. Sign-off Blocks
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('TERMO DE RESPONSABILIDADE & RASTREABILIDADE TÉCNICA', 14, finalY);

  const sigY = finalY + 16;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);

  doc.line(14, sigY, 68, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Operador de Bioprocessos', 14, sigY + 4);
  doc.text(generatedBy, 14, sigY + 8);

  doc.line(78, sigY, 132, sigY);
  doc.text('Supervisor de Fermentação', 78, sigY + 4);
  doc.text('Assinatura / Data', 78, sigY + 8);

  doc.line(142, sigY, 196, sigY);
  doc.text('Garantia da Qualidade (QA/QC)', 142, sigY + 4);
  doc.text('Homologação de Lote', 142, sigY + 8);

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `BioTrack GMP · Documento gerado eletronicamente para fins de auditoria e rastreabilidade · Página ${i} de ${pageCount}`,
      105,
      290,
      { align: 'center' }
    );
  }

  return doc;
}

export function downloadBioreactorPDF(options: PDFReportOptions, filename?: string) {
  const doc = generateBioreactorPDFReport(options);
  const reactorTag = options.reactor ? options.reactor.tag : 'TODOS';
  const fname = filename || `Relatorio_BioTrack_${reactorTag}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}

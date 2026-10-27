import * as XLSX from 'xlsx';
import { ChecklistRecord, ScaleVolume } from '../types/bioreactor';
import {
  REACTORS,
  SCALE_SPECS,
  getDOPhaseForHours,
  validateChecklistValues,
} from '../constants/reactorConfig';

export interface ExcelExportOptions {
  records: ChecklistRecord[];
  selectedReactorId: number | 'all';
}

function autoFitColumns(rows: Record<string, any>[]): XLSX.ColInfo[] {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (const row of rows) {
      const val = row[key] !== undefined && row[key] !== null ? String(row[key]) : '';
      if (val.length > maxLen) {
        maxLen = val.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 55) };
  });
}

function formatDateBR(dateStr: string): string {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  return dateStr.split('-').reverse().join('/');
}

function buildDetailedRows(list: ChecklistRecord[]) {
  const sorted = [...list].sort(
    (a, b) =>
      a.reactorId - b.reactorId ||
      (a.batchId || '').localeCompare(b.batchId || '') ||
      a.processHours - b.processHours ||
      a.timestamp - b.timestamp
  );

  return sorted.map((rec) => {
    const specs = SCALE_SPECS[rec.scale];
    const doPhase = getDOPhaseForHours(rec.scale, rec.processHours);
    const valCheck = validateChecklistValues(rec.scale, {
      temperature: rec.temperature,
      dissolvedOxygen: rec.dissolvedOxygen,
      agitation: rec.agitation,
      pressure: rec.pressure,
      airflow: rec.airflow,
      processHours: rec.processHours,
    });

    const mapStatus = (sem: string) => {
      if (sem === 'nominal') return 'DENTRO DA FAIXA';
      if (sem === 'warning') return 'PRÓXIMO AO LIMITE';
      if (sem === 'critical') return 'FORA DA FAIXA';
      return 'LIVRE';
    };

    return {
      'ID Registro': rec.id,
      'Data do Check': formatDateBR(rec.date),
      'Horário do Check': rec.time,
      'Data Inoculação': rec.inoculationDate ? formatDateBR(rec.inoculationDate) : '-',
      'Horário Inoculação': rec.inoculationTime || '-',
      'Tempo em Cultivo (h)': rec.processHours,
      'Biorreator': rec.reactorTag,
      'Escala': rec.scale,
      'Lote / Batelada': rec.batchId || '-',
      'Ciclo do Lote': rec.archived ? 'Encerrado / Arquivado' : 'Ativo',
      'Operador': rec.operatorName,
      'Temperatura (°C)': Number(rec.temperature.toFixed(2)),
      'Alvo Temp (°C)': 30.0,
      'Faixa Temp (°C)': '28.0 a 32.0',
      'Status Temperatura': mapStatus(valCheck.tempSemaphore),
      'Oxigênio Dissolvido (%)': Number(rec.dissolvedOxygen.toFixed(2)),
      'Fase O2': doPhase ? `${doPhase.phase} (${doPhase.intervalHours})` : 'Sem curva tabelada',
      'Faixa O2 (%)': doPhase
        ? `${doPhase.o2ProbeMin.toFixed(2)}% a ${doPhase.o2ProbeMax.toFixed(2)}%`
        : 'Registro Livre',
      'Status O2': mapStatus(valCheck.doSemaphore),
      'Agitação (RPM)': rec.agitation,
      'Alvo Agitação (RPM)': specs.agitation.target,
      'Status Agitação': mapStatus(valCheck.agitSemaphore),
      'Pressão (bar)': Number(rec.pressure.toFixed(2)),
      'Alvo Pressão (bar)': Number(specs.pressure.target.toFixed(2)),
      'Faixa Pressão (bar)': `${(specs.pressure.min ?? 0).toFixed(2)} a ${(specs.pressure.max ?? 0).toFixed(2)}`,
      'Status Pressão': mapStatus(valCheck.presSemaphore),
      'Vazão de Ar (L/min)': rec.airflow,
      'Alvo Vazão (L/min)': specs.airflow.target,
      'Faixa Vazão (L/min)': `${specs.airflow.min} a ${specs.airflow.max}`,
      'Status Vazão': mapStatus(valCheck.airSemaphore),
      'Conformidade Geral': valCheck.isFullyNominal ? 'CONFORME' : 'FORA DA FAIXA',
      'Qtd Desvios': valCheck.deviationsCount,
      'Detalhamento dos Desvios':
        valCheck.deviations.length > 0 ? valCheck.deviations.join(' | ') : 'Nenhum desvio',
      'Observações / Ação Corretiva': rec.notes || '-',
      'Assinatura Eletrônica': rec.operatorSignature || `OP-${rec.operatorName.split(' ')[0].toUpperCase()}`,
    };
  });
}

export function exportStratifiedExcel({ records, selectedReactorId }: ExcelExportOptions): void {
  const wb = XLSX.utils.book_new();

  // Escopo principal (se um reator estiver filtrado, prioriza na 1ª visualização, mas mantém estratificação completa)
  const scopedRecords =
    selectedReactorId === 'all'
      ? records
      : records.filter((r) => r.reactorId === selectedReactorId);

  const calcStats = (vals: number[]) => {
    if (vals.length === 0) return { avg: 0, min: 0, max: 0 };
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      avg: Number((sum / vals.length).toFixed(2)),
      min: Number(Math.min(...vals).toFixed(2)),
      max: Number(Math.max(...vals).toFixed(2)),
    };
  };

  // =========================================================================
  // ABA 1: 1_Resumo_Parametros (Consolidado de Precisão e Médias)
  // =========================================================================
  const totalScoped = scopedRecords.length;
  const tempStats = calcStats(scopedRecords.map((r) => r.temperature));
  const o2Stats = calcStats(scopedRecords.map((r) => r.dissolvedOxygen));
  const agitStats = calcStats(scopedRecords.map((r) => r.agitation));
  const pressStats = calcStats(scopedRecords.map((r) => r.pressure));
  const airStats = calcStats(scopedRecords.map((r) => r.airflow));

  const countNominal = (fn: (r: ChecklistRecord) => boolean) => scopedRecords.filter(fn).length;

  const summaryRows = [
    {
      'Parâmetro Monitorado': 'Temperatura',
      'Unidade': '°C',
      'Total de Checklists': totalScoped,
      'Dentro da Faixa (Qtd)': countNominal((r) => r.isTemperatureNominal),
      'Fora da Faixa (Qtd)': totalScoped - countNominal((r) => r.isTemperatureNominal),
      'Precisão / Conformidade (%)':
        totalScoped > 0
          ? Number(((countNominal((r) => r.isTemperatureNominal) / totalScoped) * 100).toFixed(1))
          : 100,
      'Média Calculada': tempStats.avg,
      'Mínimo Registrado': tempStats.min,
      'Máximo Registrado': tempStats.max,
      'Especificação Técnica (Alvo & Delta)': 'Alvo 30,0 °C | Delta ± 2,0 °C (28,0 a 32,0 °C em todas as escalas)',
    },
    {
      'Parâmetro Monitorado': 'Oxigênio Dissolvido',
      'Unidade': '% O2',
      'Total de Checklists': totalScoped,
      'Dentro da Faixa (Qtd)': countNominal((r) => r.isDONominal),
      'Fora da Faixa (Qtd)': totalScoped - countNominal((r) => r.isDONominal),
      'Precisão / Conformidade (%)':
        totalScoped > 0
          ? Number(((countNominal((r) => r.isDONominal) / totalScoped) * 100).toFixed(1))
          : 100,
      'Média Calculada': o2Stats.avg,
      'Mínimo Registrado': o2Stats.min,
      'Máximo Registrado': o2Stats.max,
      'Especificação Técnica (Alvo & Delta)': 'Tabelas de 4 fases para 100L e 5000L (2h a 58h) | Livre para 500L e 3000L',
    },
    {
      'Parâmetro Monitorado': 'Agitação',
      'Unidade': 'RPM',
      'Total de Checklists': totalScoped,
      'Dentro da Faixa (Qtd)': countNominal((r) => r.isAgitationNominal),
      'Fora da Faixa (Qtd)': totalScoped - countNominal((r) => r.isAgitationNominal),
      'Precisão / Conformidade (%)':
        totalScoped > 0
          ? Number(((countNominal((r) => r.isAgitationNominal) / totalScoped) * 100).toFixed(1))
          : 100,
      'Média Calculada': agitStats.avg,
      'Mínimo Registrado': agitStats.min,
      'Máximo Registrado': agitStats.max,
      'Especificação Técnica (Alvo & Delta)': 'Sem delta (Fixo): 100L = 95 RPM | 500L = 117 RPM | 3000L e 5000L = 200 RPM',
    },
    {
      'Parâmetro Monitorado': 'Pressão',
      'Unidade': 'bar',
      'Total de Checklists': totalScoped,
      'Dentro da Faixa (Qtd)': countNominal((r) => r.isPressureNominal),
      'Fora da Faixa (Qtd)': totalScoped - countNominal((r) => r.isPressureNominal),
      'Precisão / Conformidade (%)':
        totalScoped > 0
          ? Number(((countNominal((r) => r.isPressureNominal) / totalScoped) * 100).toFixed(1))
          : 100,
      'Média Calculada': pressStats.avg,
      'Mínimo Registrado': pressStats.min,
      'Máximo Registrado': pressStats.max,
      'Especificação Técnica (Alvo & Delta)':
        'Delta ± 0,05 bar: 100L = 0,10 (0,05-0,15) | 500L = 0,20 (0,15-0,25) | 3000L = 0,30 (0,25-0,35) | 5000L = 0,50 (0,45-0,55)',
    },
    {
      'Parâmetro Monitorado': 'Vazão de Ar',
      'Unidade': 'L/min',
      'Total de Checklists': totalScoped,
      'Dentro da Faixa (Qtd)': countNominal((r) => r.isAirflowNominal),
      'Fora da Faixa (Qtd)': totalScoped - countNominal((r) => r.isAirflowNominal),
      'Precisão / Conformidade (%)':
        totalScoped > 0
          ? Number(((countNominal((r) => r.isAirflowNominal) / totalScoped) * 100).toFixed(1))
          : 100,
      'Média Calculada': airStats.avg,
      'Mínimo Registrado': airStats.min,
      'Máximo Registrado': airStats.max,
      'Especificação Técnica (Alvo & Delta)':
        'Delta ± 10 L/min: 100L = 85 (75-95) | 500L = 220 (210-230) | 3000L e 5000L = 800 (790-810)',
    },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = autoFitColumns(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, '1_Resumo_Parametros');

  // =========================================================================
  // ABA 2: 2_Estratificado_Por_Lote (Agrupamento por Lote / Biorreator)
  // =========================================================================
  const batchMap = new Map<string, ChecklistRecord[]>();
  for (const r of records) {
    const key = `${r.reactorId}__${r.batchId || 'SEM-LOTE'}`;
    const arr = batchMap.get(key) || [];
    arr.push(r);
    batchMap.set(key, arr);
  }

  const batchRows: Record<string, any>[] = [];
  batchMap.forEach((recs) => {
    const sorted = [...recs].sort((a, b) => a.processHours - b.processHours || a.timestamp - b.timestamp);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const reactorMeta = REACTORS.find((item) => item.id === first.reactorId);
    const n = sorted.length;
    const nomCount = sorted.filter((i) => i.isFullyNominal).length;
    const devCount = n - nomCount;

    batchRows.push({
      'Biorreator': first.reactorTag,
      'Equipamento': reactorMeta?.name || `Biorreator ${first.reactorId}`,
      'Escala': first.scale,
      'Lote / Batelada': first.batchId || '-',
      'Status do Lote': first.archived ? 'Encerrado / Arquivado' : 'Ativo',
      'Qtd Checklists': n,
      'Início Registros': `${formatDateBR(first.date)} ${first.time} (${first.processHours}h)`,
      'Último Registro': `${formatDateBR(last.date)} ${last.time} (${last.processHours}h)`,
      'Média Temp (°C)': calcStats(sorted.map((i) => i.temperature)).avg,
      'Média O2 (%)': calcStats(sorted.map((i) => i.dissolvedOxygen)).avg,
      'Média Agitação (RPM)': calcStats(sorted.map((i) => i.agitation)).avg,
      'Média Pressão (bar)': calcStats(sorted.map((i) => i.pressure)).avg,
      'Média Vazão (L/min)': calcStats(sorted.map((i) => i.airflow)).avg,
      'Leituras Dentro da Faixa': nomCount,
      'Leituras Fora da Faixa': devCount,
      'Conformidade do Lote (%)': Number(((nomCount / n) * 100).toFixed(1)),
    });
  });

  batchRows.sort((a, b) => String(a['Biorreator']).localeCompare(String(b['Biorreator'])));
  const wsBatches = XLSX.utils.json_to_sheet(batchRows);
  wsBatches['!cols'] = autoFitColumns(batchRows);
  XLSX.utils.book_append_sheet(wb, wsBatches, '2_Estratificado_Por_Lote');

  // =========================================================================
  // ABA 3: 3_Base_Completa_Checklists (Todas as Leituras Ponto a Ponto)
  // =========================================================================
  const allDetailedRows = buildDetailedRows(records);
  const wsAll = XLSX.utils.json_to_sheet(allDetailedRows);
  wsAll['!cols'] = autoFitColumns(allDetailedRows);
  XLSX.utils.book_append_sheet(wb, wsAll, '3_Base_Completa_Checklists');

  // =========================================================================
  // ABA 4: 4_Apenas_Desvios (Estratificação de Não-Conformidades)
  // =========================================================================
  const deviationRecords = records.filter((r) => !r.isFullyNominal);
  const deviationRows =
    deviationRecords.length > 0
      ? buildDetailedRows(deviationRecords)
      : [
          {
            'Status': 'Nenhum desvio fora da faixa registrado até o momento (100% de Conformidade).',
          },
        ];
  const wsDeviations = XLSX.utils.json_to_sheet(deviationRows);
  wsDeviations['!cols'] = autoFitColumns(deviationRows);
  XLSX.utils.book_append_sheet(wb, wsDeviations, '4_Apenas_Desvios');

  // =========================================================================
  // ABAS 5 a 8: Estratificação por Escala (100L, 500L, 3000L, 5000L)
  // =========================================================================
  const scales: ScaleVolume[] = ['100L', '500L', '3000L', '5000L'];
  scales.forEach((sc, idx) => {
    const scaleRecs = records.filter((r) => r.scale === sc);
    const rows =
      scaleRecs.length > 0
        ? buildDetailedRows(scaleRecs)
        : [
            {
              'Escala': sc,
              'Status': `Nenhum checklist registrado para a escala ${sc}.`,
            },
          ];
    const wsScale = XLSX.utils.json_to_sheet(rows);
    wsScale['!cols'] = autoFitColumns(rows);
    XLSX.utils.book_append_sheet(wb, wsScale, `${idx + 5}_Escala_${sc}`);
  });

  const scopeTag =
    selectedReactorId === 'all'
      ? 'TODOS'
      : `BR-${String(selectedReactorId).padStart(2, '0')}`;
  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Checklist_Parametros_Processo_${scopeTag}_${dateTag}.xlsx`);
}

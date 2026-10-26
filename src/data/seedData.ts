import { ChecklistRecord } from '../types/bioreactor';
import { getScaleByReactorId, validateChecklistValues } from '../constants/reactorConfig';

export const INITIAL_OPERATORS = [
  'Matheus Henrique',
  'Vinicius Zanetti',
  'Gustavo Conti',
  'Valdelir Pires',
  'Willian Lins',
  'Uanderson da Silva',
  'Felipe',
  'Nathan',
];

function createRecord(
  id: string,
  reactorId: number,
  batchId: string,
  operatorName: string,
  date: string,
  time: string,
  processHours: number,
  temp: number,
  doVal: number,
  standardCurve: number | undefined,
  agit: number,
  press: number,
  air: number,
  notes: string = '',
  archived: boolean = false
): ChecklistRecord {
  const scale = getScaleByReactorId(reactorId);
  const tag = `BR-${String(reactorId).padStart(2, '0')}`;
  const validation = validateChecklistValues(scale, {
    temperature: temp,
    dissolvedOxygen: doVal,
    standardCurveO2: standardCurve,
    agitation: agit,
    pressure: press,
    airflow: air,
    processHours,
  });

  const timestamp = new Date(`${date}T${time}:00`).getTime();

  return {
    id,
    reactorId,
    reactorTag: tag,
    scale,
    batchId,
    operatorName,
    date,
    time,
    timestamp,
    processHours,
    archived,
    temperature: temp,
    dissolvedOxygen: doVal,
    standardCurveO2: standardCurve,
    agitation: agit,
    pressure: press,
    airflow: air,
    isTemperatureNominal: validation.isTemperatureNominal,
    isPressureNominal: validation.isPressureNominal,
    isAgitationNominal: validation.isAgitationNominal,
    isAirflowNominal: validation.isAirflowNominal,
    isDONominal: validation.isDONominal,
    isFullyNominal: validation.isFullyNominal,
    deviationsCount: validation.deviationsCount,
    deviationNotes: validation.deviations.length > 0 ? validation.deviations.join('; ') : undefined,
    operatorSignature: `OP-${operatorName.split(' ')[0].toUpperCase()}`,
    notes,
  };
}

export const SEED_CHECKLISTS: ChecklistRecord[] = [
  // BR-01 (100L) - Batelada L-100-24A - Leituras a cada 2 horas (Ativa, contém 1 desvio de temperatura corrigido)
  createRecord('chk-101', 1, 'L-100-24A', 'Matheus Henrique', '2026-09-29', '06:00', 2, 30.0, 22.30, undefined, 95, 0.10, 85, 'Início da batelada 100L. Sondas calibradas.'),
  createRecord('chk-102', 1, 'L-100-24A', 'Matheus Henrique', '2026-09-29', '08:00', 4, 30.1, 22.25, undefined, 95, 0.11, 85, 'Fase inicial estável.'),
  createRecord('chk-103', 1, 'L-100-24A', 'Vinicius Zanetti', '2026-09-29', '10:00', 6, 30.0, 22.18, undefined, 95, 0.10, 86, 'Parâmetros nominais.'),
  createRecord('chk-104', 1, 'L-100-24A', 'Vinicius Zanetti', '2026-09-29', '12:00', 8, 29.9, 22.10, undefined, 95, 0.12, 85, 'Amostragem de controle realizada.'),
  createRecord('chk-105', 1, 'L-100-24A', 'Gustavo Conti', '2026-09-29', '14:00', 10, 30.2, 22.04, undefined, 95, 0.10, 84, 'Cultivo em fase inicial normal.'),
  createRecord('chk-106', 1, 'L-100-24A', 'Gustavo Conti', '2026-09-29', '16:00', 12, 30.1, 21.98, undefined, 95, 0.11, 85, 'Consumo de O2 dentro do esperado.'),
  createRecord('chk-107', 1, 'L-100-24A', 'Valdelir Pires', '2026-09-29', '18:00', 14, 30.0, 21.94, undefined, 95, 0.10, 85, 'Final da fase inicial.'),
  createRecord('chk-108', 1, 'L-100-24A', 'Willian Lins', '2026-09-29', '20:00', 16, 30.2, 21.60, undefined, 95, 0.11, 86, 'Entrada na fase de aceleração.'),
  createRecord('chk-109', 1, 'L-100-24A', 'Willian Lins', '2026-09-29', '22:00', 18, 30.3, 21.40, undefined, 95, 0.12, 85, 'Crescimento celular acelerado.'),
  createRecord('chk-110', 1, 'L-100-24A', 'Uanderson da Silva', '2026-09-30', '00:00', 20, 30.1, 21.15, undefined, 95, 0.10, 85, 'Monitoramento noturno sem desvios.'),
  createRecord('chk-111', 1, 'L-100-24A', 'Felipe', '2026-09-30', '02:00', 22, 32.4, 20.85, undefined, 95, 0.12, 85, 'Alerta: temperatura atingiu 32.4°C (limite máx 32.0°C). Chiller ajustado.'),
  createRecord('chk-112', 1, 'L-100-24A', 'Matheus Henrique', '2026-09-30', '04:00', 24, 30.2, 20.60, undefined, 95, 0.11, 85, 'Ação corretiva efetiva: temperatura estabilizada em 30.2°C.'),

  // BR-02 (100L) - Batelada L-100-24B (Ciclo completo 2h a 58h a cada 2h)
  createRecord('chk-01', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-28', '08:00', 2, 30.1, 22.32, undefined, 95, 0.11, 85, 'Início de cultivo após inoculação. Sondas calibradas.'),
  createRecord('chk-01b', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-28', '10:00', 4, 30.0, 22.26, undefined, 95, 0.10, 85, 'Leitura de 4h nominal.'),
  createRecord('chk-01c', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-28', '12:00', 6, 30.0, 22.19, undefined, 95, 0.10, 84, 'Leitura de 6h nominal.'),
  createRecord('chk-02', 2, 'L-100-24B', 'Vinicius Zanetti', '2026-09-28', '14:00', 8, 30.0, 22.12, undefined, 95, 0.10, 84, 'Fase inicial estável. Amostragem de biomassa retirada.'),
  createRecord('chk-02b', 2, 'L-100-24B', 'Vinicius Zanetti', '2026-09-28', '16:00', 10, 29.9, 22.05, undefined, 95, 0.11, 85, 'Estabilidade térmica mantida.'),
  createRecord('chk-02c', 2, 'L-100-24B', 'Gustavo Conti', '2026-09-28', '18:00', 12, 30.0, 21.99, undefined, 95, 0.11, 86, 'Preparação para transição de fase.'),
  createRecord('chk-03', 2, 'L-100-24B', 'Gustavo Conti', '2026-09-28', '20:00', 14, 29.9, 21.95, undefined, 95, 0.11, 86, 'Transição para aceleração celular. Controle de pH estável.'),
  createRecord('chk-03b', 2, 'L-100-24B', 'Valdelir Pires', '2026-09-28', '22:00', 16, 30.1, 21.62, undefined, 95, 0.12, 85, 'Início da fase de aceleração (16h).'),
  createRecord('chk-03c', 2, 'L-100-24B', 'Willian Lins', '2026-09-29', '00:00', 18, 30.1, 21.42, undefined, 95, 0.12, 85, 'Consumo de O2 em rampa nominal.'),
  createRecord('chk-04', 2, 'L-100-24B', 'Willian Lins', '2026-09-29', '02:00', 20, 30.2, 21.20, undefined, 95, 0.13, 85, 'Fase de aceleração confirmada.'),
  createRecord('chk-04b', 2, 'L-100-24B', 'Uanderson da Silva', '2026-09-29', '04:00', 22, 30.1, 20.95, undefined, 95, 0.11, 86, 'Aeração constante em 86 L/min.'),
  createRecord('chk-04c', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-29', '06:00', 24, 30.0, 20.78, undefined, 95, 0.10, 86, '24h de cultivo completadas.'),
  createRecord('chk-05', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-29', '08:00', 26, 30.1, 20.60, undefined, 95, 0.09, 87, 'Aceleração vigorosa. Sem espuma excessiva.'),
  createRecord('chk-05b', 2, 'L-100-24B', 'Felipe', '2026-09-29', '10:00', 28, 30.0, 20.42, undefined, 95, 0.10, 86, 'Sonda O2 verificada.'),
  createRecord('chk-05c', 2, 'L-100-24B', 'Vinicius Zanetti', '2026-09-29', '12:00', 30, 29.9, 20.25, undefined, 95, 0.10, 85, 'Regime nominal.'),
  createRecord('chk-06', 2, 'L-100-24B', 'Vinicius Zanetti', '2026-09-29', '14:00', 32, 29.8, 20.10, undefined, 95, 0.10, 85, 'Final da fase de aceleração.'),
  createRecord('chk-06b', 2, 'L-100-24B', 'Gustavo Conti', '2026-09-29', '16:00', 34, 30.1, 19.20, undefined, 95, 0.11, 86, 'Entrada na fase de maior demanda (34h).'),
  createRecord('chk-06c', 2, 'L-100-24B', 'Gustavo Conti', '2026-09-29', '18:00', 36, 30.2, 18.40, undefined, 95, 0.12, 86, 'Demanda metabólica elevada.'),
  createRecord('chk-07', 2, 'L-100-24B', 'Valdelir Pires', '2026-09-29', '20:00', 38, 30.3, 17.50, undefined, 95, 0.12, 86, 'Fase de maior demanda. Oxigênio dentro da faixa.'),
  createRecord('chk-07b', 2, 'L-100-24B', 'Valdelir Pires', '2026-09-29', '22:00', 40, 30.2, 16.80, undefined, 95, 0.13, 87, 'Temperatura controlada pela camisa de água.'),
  createRecord('chk-07c', 2, 'L-100-24B', 'Willian Lins', '2026-09-30', '00:00', 42, 30.1, 16.00, undefined, 95, 0.13, 87, 'Biomassa em alta densidade.'),
  createRecord('chk-08', 2, 'L-100-24B', 'Willian Lins', '2026-09-30', '02:00', 44, 30.2, 15.20, undefined, 95, 0.14, 88, 'Pico de densidade óptica.'),
  createRecord('chk-08b', 2, 'L-100-24B', 'Uanderson da Silva', '2026-09-30', '04:00', 46, 30.0, 14.75, undefined, 95, 0.12, 86, 'Consumo máximo estabilizado.'),
  createRecord('chk-08c', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-30', '06:00', 48, 30.0, 14.50, undefined, 95, 0.11, 85, 'Conclusão da fase de maior demanda.'),
  createRecord('chk-09', 2, 'L-100-24B', 'Matheus Henrique', '2026-09-30', '08:00', 50, 30.0, 14.80, undefined, 95, 0.10, 85, 'Início da fase de recuperação (50h).'),
  createRecord('chk-09b', 2, 'L-100-24B', 'Nathan', '2026-09-30', '10:00', 52, 30.1, 15.50, undefined, 95, 0.10, 85, 'Recuperação gradual de O2 dissolvido.'),
  createRecord('chk-10', 2, 'L-100-24B', 'Nathan', '2026-09-30', '12:00', 54, 30.1, 16.20, undefined, 95, 0.11, 85, 'Curva de recuperação final dentro dos padrões.'),
  createRecord('chk-10b', 2, 'L-100-24B', 'Vinicius Zanetti', '2026-09-30', '14:00', 56, 30.0, 16.65, undefined, 95, 0.10, 85, 'Estabilização pré-colheita.'),
  createRecord('chk-10c', 2, 'L-100-24B', 'Vinicius Zanetti', '2026-09-30', '16:00', 58, 30.0, 16.90, undefined, 95, 0.10, 85, 'Batelada finalizada em 58h com 100% de conformidade.'),

  // BR-12 (5000L) - Batelada L-5K-09B (Escala industrial 5000L)
  createRecord('chk-11', 12, 'L-5K-09B', 'Valdelir Pires', '2026-09-28', '08:00', 2, 30.0, 22.85, undefined, 200, 0.50, 800, 'Batelada 5000L iniciada.'),
  createRecord('chk-11b', 12, 'L-5K-09B', 'Valdelir Pires', '2026-09-28', '12:00', 6, 30.1, 22.40, undefined, 200, 0.51, 800, 'Fase inicial nominal.'),
  createRecord('chk-12', 12, 'L-5K-09B', 'Uanderson da Silva', '2026-09-28', '16:00', 10, 30.1, 21.85, undefined, 200, 0.52, 795, 'Fase inicial com dissipação térmica controlada.'),
  createRecord('chk-12b', 12, 'L-5K-09B', 'Uanderson da Silva', '2026-09-28', '20:00', 14, 30.0, 21.40, undefined, 200, 0.50, 798, 'Fim da fase inicial 5000L.'),
  createRecord('chk-13', 12, 'L-5K-09B', 'Felipe', '2026-09-29', '00:00', 18, 29.9, 20.10, undefined, 200, 0.48, 805, 'Fase de aceleração.'),
  createRecord('chk-14', 12, 'L-5K-09B', 'Matheus Henrique', '2026-09-29', '08:00', 26, 30.2, 18.20, undefined, 200, 0.53, 800, 'Aceleração contínua. Pressão interna estável em 0.53 bar.'),
  createRecord('chk-15', 12, 'L-5K-09B', 'Nathan', '2026-09-29', '18:00', 36, 30.0, 16.80, undefined, 200, 0.50, 802, 'Maior demanda. Oxigênio sonda em 16.8%.'),
  createRecord('chk-16', 12, 'L-5K-09B', 'Willian Lins', '2026-09-30', '02:00', 44, 30.1, 17.10, undefined, 200, 0.51, 805, 'Maior demanda metabólica sustentada.'),
  createRecord('chk-17', 12, 'L-5K-09B', 'Matheus Henrique', '2026-09-30', '10:00', 52, 29.9, 17.20, undefined, 200, 0.49, 798, 'Trecho final avaliado.'),

  // BR-08 (500L) - Batelada L-500-18B
  createRecord('chk-18', 8, 'L-500-18B', 'Gustavo Conti', '2026-09-29', '08:00', 2, 30.0, 21.8, undefined, 117, 0.21, 220, 'Início de batelada 500L.'),
  createRecord('chk-18b', 8, 'L-500-18B', 'Gustavo Conti', '2026-09-29', '10:00', 4, 30.0, 21.5, undefined, 117, 0.22, 220, 'Alvo agitação 117 RPM verificado no inversor.'),
  createRecord('chk-19', 8, 'L-500-18B', 'Vinicius Zanetti', '2026-09-29', '12:00', 6, 30.2, 20.8, undefined, 117, 0.20, 222, 'Vazão de ar calibrada em 222 L/min.'),
  createRecord('chk-20', 8, 'L-500-18B', 'Felipe', '2026-09-29', '14:00', 8, 29.8, 19.4, undefined, 117, 0.23, 218, 'Crescimento exponencial uniforme.'),

  // BR-15 (3000L) - Batelada L-3K-12A
  createRecord('chk-21', 15, 'L-3K-12A', 'Willian Lins', '2026-09-29', '08:00', 2, 30.1, 21.4, undefined, 200, 0.31, 800, 'Alvo 200 RPM, pressão 0.31 bar.'),
  createRecord('chk-22', 15, 'L-3K-12A', 'Matheus Henrique', '2026-09-29', '10:00', 4, 30.0, 20.9, undefined, 200, 0.30, 804, 'Sem desvios detectados.'),
  createRecord('chk-23', 15, 'L-3K-12A', 'Nathan', '2026-09-29', '12:00', 6, 30.2, 19.5, undefined, 200, 0.32, 795, 'Operação nominal.'),

  // Exemplo de Lote Encerrado / Arquivado (BR-03 · L-100-23Z) para demonstrar Arquivo Histórico
  createRecord('chk-arch-1', 3, 'L-100-23Z', 'Uanderson da Silva', '2026-09-20', '08:00', 2, 30.0, 22.28, undefined, 95, 0.10, 85, 'Início do lote L-100-23Z.', true),
  createRecord('chk-arch-2', 3, 'L-100-23Z', 'Uanderson da Silva', '2026-09-20', '20:00', 14, 30.1, 21.95, undefined, 95, 0.11, 85, 'Transição fase inicial concluída.', true),
  createRecord('chk-arch-3', 3, 'L-100-23Z', 'Valdelir Pires', '2026-09-21', '12:00', 30, 30.0, 20.35, undefined, 95, 0.10, 86, 'Fase de aceleração nominal.', true),
  createRecord('chk-arch-4', 3, 'L-100-23Z', 'Matheus Henrique', '2026-09-22', '02:00', 44, 30.1, 15.80, undefined, 95, 0.11, 85, 'Maior demanda metabólica concluída.', true),
  createRecord('chk-arch-5', 3, 'L-100-23Z', 'Matheus Henrique', '2026-09-22', '14:00', 56, 30.0, 16.40, undefined, 95, 0.10, 85, 'Lote encerrado e homologado pelo QA.', true),
];

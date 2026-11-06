import React, { useState, useEffect, useRef } from 'react';
import { ChecklistRecord, SemaphoreLevel } from '../types/bioreactor';
import {
  REACTORS,
  SCALE_SPECS,
  getDOPhaseForHours,
  getScaleByReactorId,
  validateChecklistValues,
} from '../constants/reactorConfig';
import { INITIAL_OPERATORS } from '../data/seedData';
import {
  X,
  CheckCircle,
  AlertTriangle,
  Activity,
  Check,
  AlertCircle,
  UserPlus,
  Clock,
  Mic,
  MicOff,
  Sparkles,
} from 'lucide-react';

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: ChecklistRecord) => void;
  initialReactorId?: number;
  operators?: string[];
  onAddOperator?: (newOperator: string) => void;
  existingRecords?: ChecklistRecord[];
  editingRecord?: ChecklistRecord | null;
}

function getLocalDateYYYYMMDD(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeHHMM(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDefaultInoculationDateTime(now: Date = new Date()): {
  inocDate: string;
  inocTime: string;
} {
  // Define 06:00 como horário padrão de inoculação (se antes das 06:00, usa o dia anterior)
  const defaultInoc = new Date(now.getTime());
  if (defaultInoc.getHours() < 6) {
    defaultInoc.setDate(defaultInoc.getDate() - 1);
  }
  defaultInoc.setHours(6, 0, 0, 0);
  return {
    inocDate: getLocalDateYYYYMMDD(defaultInoc),
    inocTime: '06:00',
  };
}

function parseNumericInput(raw: string, fallback = 0): number {
  const cleaned = String(raw ?? '').trim().replace(',', '.');
  if (!cleaned || cleaned === '-' || cleaned === '.') return fallback;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normaliza números falados por extenso em português para dígitos antes da extração por Regex
function normalizePortugueseSpokenNumbers(rawText: string): string {
  let text = rawText.toLowerCase();

  // Compostos comuns de centenas/dezenas
  const hundredsMap: Record<string, number> = {
    cento: 100,
    duzentos: 200,
    trezentos: 300,
    quatrocentos: 400,
    quinhentos: 500,
    seiscentos: 600,
    setecentos: 700,
    oitocentos: 800,
    novecentos: 900,
  };
  const tensMap: Record<string, number> = {
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
    sessenta: 60,
    setenta: 70,
    oitenta: 80,
    noventa: 90,
  };
  const unitsMap: Record<string, number> = {
    zero: 0,
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    três: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    meia: 6,
    sete: 7,
    oito: 8,
    nove: 9,
  };
  const teensMap: Record<string, number> = {
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14,
    catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezessete: 17,
    dezoito: 18,
    dezenove: 19,
  };

  // Centena + dezena + unidade (ex: "cento e cinquenta e cinco")
  text = text.replace(
    /\b(cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\s+e\s+(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\s+e\s+(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)\b/gi,
    (_, h, t, u) =>
      String(
        (hundredsMap[h.toLowerCase()] || 0) +
          (tensMap[t.toLowerCase()] || 0) +
          (unitsMap[u.toLowerCase()] || 0)
      )
  );

  // Centena + dezena/teen/unidade (ex: "cento e cinquenta", "cento e dezessete")
  text = text.replace(
    /\b(cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\s+e\s+(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)\b/gi,
    (_, h, rest) => {
      const rKey = rest.toLowerCase();
      const val = tensMap[rKey] ?? teensMap[rKey] ?? unitsMap[rKey] ?? 0;
      return String((hundredsMap[h.toLowerCase()] || 0) + val);
    }
  );

  // Dezena + unidade (ex: "trinta e dois", "vinte e um")
  text = text.replace(
    /\b(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\s+e\s+(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)\b/gi,
    (_, t, u) => String((tensMap[t.toLowerCase()] || 0) + (unitsMap[u.toLowerCase()] || 0))
  );

  // Palavras isoladas de centenas, dezenas, teens e unidades
  const singleWords: Record<string, string> = {
    cem: '100',
    duzentos: '200',
    trezentos: '300',
    quatrocentos: '400',
    quinhentos: '500',
    seiscentos: '600',
    setecentos: '700',
    oitocentos: '800',
    novecentos: '900',
    vinte: '20',
    trinta: '30',
    quarenta: '40',
    cinquenta: '50',
    sessenta: '60',
    setenta: '70',
    oitenta: '80',
    noventa: '90',
    dez: '10',
    onze: '11',
    doze: '12',
    treze: '13',
    quatorze: '14',
    catorze: '14',
    quinze: '15',
    dezesseis: '16',
    dezessete: '17',
    dezoito: '18',
    dezenove: '19',
    zero: '0',
    um: '1',
    uma: '1',
    dois: '2',
    duas: '2',
    tres: '3',
    três: '3',
    quatro: '4',
    cinco: '5',
    seis: '6',
    sete: '7',
    oito: '8',
    nove: '9',
  };

  text = text.replace(
    /\b(cem|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)\b/gi,
    (match) => singleWords[match.toLowerCase()] ?? match
  );

  // Converte "30 vírgula 5" ou "0 ponto 25" em "30.5" / "0.25"
  text = text.replace(/(\d+)\s*(?:v[ií]rgula|ponto|,)\s*(\d+)/gi, '$1.$2');

  return text;
}

export const ChecklistModal: React.FC<ChecklistModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialReactorId = 1,
  operators = INITIAL_OPERATORS,
  onAddOperator,
  existingRecords = [],
  editingRecord = null,
}) => {
  const [reactorId, setReactorId] = useState<number>(initialReactorId);
  const [operatorName, setOperatorName] = useState<string>(operators[0] || INITIAL_OPERATORS[0]);
  const [isCustomOperatorMode, setIsCustomOperatorMode] = useState<boolean>(false);
  const [customOperatorInput, setCustomOperatorInput] = useState<string>('');

  const [date, setDate] = useState<string>(() => getLocalDateYYYYMMDD());
  const [time, setTime] = useState<string>(() => getLocalTimeHHMM());
  const [inoculationDate, setInoculationDate] = useState<string>(
    () => getDefaultInoculationDateTime().inocDate
  );
  const [inoculationTime, setInoculationTime] = useState<string>(
    () => getDefaultInoculationDateTime().inocTime
  );
  const [batchId, setBatchId] = useState<string>('');

  // String inputs for smooth typing (supports 1, 2, or 3+ decimal places without browser step rejection)
  const [tempInput, setTempInput] = useState<string>('30');
  const [doInput, setDoInput] = useState<string>('21');
  const [noDOProbe, setNoDOProbe] = useState<boolean>(false);
  const [agitInput, setAgitInput] = useState<string>('95');
  const [presInput, setPresInput] = useState<string>('0.1');
  const [airInput, setAirInput] = useState<string>('85');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Estados do Comando de Voz Nativo (Sem IA)
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceFilledFields, setVoiceFilledFields] = useState<string[]>([]);
  const [voiceStatusMsg, setVoiceStatusMsg] = useState<string>('');
  const recognitionRef = useRef<any>(null);
  const isListeningIntendedRef = useRef<boolean>(false);
  const accumulatedFinalTranscriptRef = useRef<string>('');
  const voiceSpokenFieldsSetRef = useRef<Set<string>>(new Set());

  const temperature = parseNumericInput(tempInput, 0);
  const dissolvedOxygen = parseNumericInput(doInput, 0);
  const agitation = parseNumericInput(agitInput, 0);
  const pressure = parseNumericInput(presInput, 0);
  const airflow = parseNumericInput(airInput, 0);

  const scale = getScaleByReactorId(reactorId);
  const specs = SCALE_SPECS[scale];
  const activeReactor = REACTORS.find((r) => r.id === reactorId);

  // Helper para buscar inoculação recente da batelada ativa deste biorreator
  const resolveInoculationForReactor = (targetReactorId: number, refNow: Date) => {
    const activeReactorRecords = existingRecords
      .filter((r) => r.reactorId === targetReactorId && !r.archived)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (activeReactorRecords.length > 0) {
      const latest = activeReactorRecords[0];
      if (latest.inoculationDate && latest.inoculationTime) {
        const inocTs = new Date(`${latest.inoculationDate}T${latest.inoculationTime}:00`).getTime();
        const elapsedHours = (refNow.getTime() - inocTs) / (1000 * 60 * 60);
        // Reaproveita a inoculação se estiver dentro de uma janela ativa recente (até 120h)
        if (!isNaN(elapsedHours) && elapsedHours >= -24 && elapsedHours <= 120) {
          return {
            inocDate: latest.inoculationDate,
            inocTime: latest.inoculationTime,
            batch: latest.batchId,
          };
        }
      }
    }
    const fallback = getDefaultInoculationDateTime(refNow);
    const r = REACTORS.find((item) => item.id === targetReactorId);
    const sc = getScaleByReactorId(targetReactorId);
    return {
      inocDate: fallback.inocDate,
      inocTime: fallback.inocTime,
      batch: r?.currentBatch || `L-${sc}-24A`,
    };
  };

  // Encerra o microfone ao fechar o modal ou desmontar
  const stopVoiceRecognition = () => {
    isListeningIntendedRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignora erro se já estiver parado
      }
      recognitionRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopVoiceRecognition();
    }
    return () => {
      stopVoiceRecognition();
    };
  }, [isOpen]);

  // Interpretador local de voz (100% determinístico via Regex, sem uso de API de IA)
  const applyVoiceCommandsFromText = (rawFullTranscript: string) => {
    const normalized = normalizePortugueseSpokenNumbers(rawFullTranscript);
    const cleanAscii = stripAccents(normalized);
    const detected = new Set<string>(voiceSpokenFieldsSetRef.current);

    // 1. Biorreator / Tanque (1 a 16)
    const reactorMatches = [
      ...cleanAscii.matchAll(/(?:biorreator|reator|tanque|br)\s*(?:numero\s*)?0*(\d{1,2})\b/gi),
    ];
    if (reactorMatches.length > 0) {
      const lastMatch = reactorMatches[reactorMatches.length - 1];
      const parsedId = parseInt(lastMatch[1], 10);
      if (parsedId >= 1 && parsedId <= 16) {
        setReactorId((prevId) => {
          if (prevId !== parsedId) {
            const sc = getScaleByReactorId(parsedId);
            const sp = SCALE_SPECS[sc];
            // Atualiza os alvos padrão da escala apenas se ainda não foram ditados por voz
            if (!detected.has('Agitação')) setAgitInput(String(sp.agitation.target));
            if (!detected.has('Pressão')) setPresInput(String(sp.pressure.target));
            if (!detected.has('Vazão')) setAirInput(String(sp.airflow.target));
            const resolved = resolveInoculationForReactor(parsedId, new Date());
            if (!detected.has('Inoculação')) {
              setInoculationDate(resolved.inocDate);
              setInoculationTime(resolved.inocTime);
            }
          }
          return parsedId;
        });
        detected.add('Tanque');
      }
    }

    // 2. Número da OP / Ordem de Produção / Lote
    const opMatches = [
      ...cleanAscii.matchAll(
        /\b(?:numero\s+da\s+op|ordem\s+de\s+producao|op|lote)\s*[:\-]?\s*([a-z0-9][a-z0-9\s\-]{0,18})/gi
      ),
    ];
    if (opMatches.length > 0) {
      const lastOpRaw = opMatches[opMatches.length - 1][1];
      // Corta caso o usuário já tenha emendado a próxima palavra-chave
      const stopWordsRegex =
        /\b(operador|nome|responsavel|temperatura|oxigenio|sem\s+sonda|agitacao|pressao|vazao|observac|justificativa|acao|inoculacao|horario|hora|tanque|biorreator|reator)\b/i;
      const cutOp = lastOpRaw.split(stopWordsRegex)[0].trim();
      // Remove espaços entre números falados separadamente (ex: "10 70 387" -> "1070387")
      const compactOp = cutOp.replace(/\s+/g, '').toUpperCase();
      if (compactOp) {
        setBatchId(compactOp);
        detected.add('Nº da OP');
      }
    }

    // 3. Operador / Nome
    const opNameMatches = [
      ...normalized.matchAll(
        /\b(?:operador|operadora|respons[aá]vel|nome)\s+([a-záàâãéèêíïóôõöúçñ]+(?:\s+[a-záàâãéèêíïóôõöúçñ]+)?)/gi
      ),
    ];
    if (opNameMatches.length > 0) {
      const rawSpokenName = opNameMatches[opNameMatches.length - 1][1];
      const stopWords =
        /\b(temperatura|oxig[eê]nio|sem|agita[cç][aã]o|press[aã]o|vaz[aã]o|op|ordem|lote|tanque|biorreator|reator|observa[cç][aã]o|hor[aá]rio|data|inocula[cç][aã]o)\b/i;
      const cleanedName = rawSpokenName.split(stopWords)[0].trim();

      if (cleanedName.length >= 2) {
        const spokenAscii = stripAccents(cleanedName.toLowerCase());
        const matchedExisting = operators.find((op) => {
          const opAscii = stripAccents(op.toLowerCase());
          return (
            opAscii === spokenAscii ||
            opAscii.startsWith(spokenAscii) ||
            opAscii.includes(spokenAscii)
          );
        });

        if (matchedExisting) {
          setIsCustomOperatorMode(false);
          setOperatorName(matchedExisting);
        } else {
          // Capitaliza cada palavra e coloca no modo de novo operador
          const formattedNew = cleanedName
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          setIsCustomOperatorMode(true);
          setCustomOperatorInput(formattedNew);
        }
        detected.add('Operador');
      }
    }

    // 4. Horário de Inoculação / Horário do Check (opcional)
    const inocTimeMatches = [
      ...cleanAscii.matchAll(
        /\binoculacao\s+(?:as\s+)?(\d{1,2})(?:\s*(?:horas?\s*(?:e\s*)?|:)\s*(\d{1,2}))?/gi
      ),
    ];
    if (inocTimeMatches.length > 0) {
      const m = inocTimeMatches[inocTimeMatches.length - 1];
      const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const mm = m[2] ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
      setInoculationTime(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
      detected.add('Inoculação');
    }

    const checkTimeMatches = [
      ...cleanAscii.matchAll(
        /\b(?:horario\s+do\s+check|hora\s+do\s+check)\s+(?:as\s+)?(\d{1,2})(?:\s*(?:horas?\s*(?:e\s*)?|:)\s*(\d{1,2}))?/gi
      ),
    ];
    if (checkTimeMatches.length > 0) {
      const m = checkTimeMatches[checkTimeMatches.length - 1];
      const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const mm = m[2] ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
      setTime(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
      detected.add('Horário');
    }

    // 5. Temperatura
    const tempMatches = [
      ...cleanAscii.matchAll(/\b(?:temperatura|temp)\s*(?:de\s*|em\s*)?(-?\d+(?:\.\d+)?)/gi),
    ];
    if (tempMatches.length > 0) {
      const val = tempMatches[tempMatches.length - 1][1];
      setTempInput(val);
      detected.add('Temperatura');
    }

    // 6. Oxigênio Dissolvido ou "Sem Sonda"
    if (/\bsem\s+sonda\b/i.test(cleanAscii)) {
      setNoDOProbe(true);
      detected.add('O2 (Sem Sonda)');
    } else if (/\bcom\s+sonda\b/i.test(cleanAscii)) {
      setNoDOProbe(false);
    }

    const doMatches = [
      ...cleanAscii.matchAll(
        /\b(?:oxigenio(?:\s+dissolvido)?|o2|od)\s*(?:de\s*|em\s*)?(\d+(?:\.\d+)?)/gi
      ),
    ];
    if (doMatches.length > 0 && !/\boxigenio\s+sem\s+sonda\b/i.test(cleanAscii)) {
      const val = doMatches[doMatches.length - 1][1];
      setNoDOProbe(false);
      setDoInput(val);
      detected.add('Oxigênio');
    }

    // 7. Agitação (RPM)
    const agitMatches = [
      ...cleanAscii.matchAll(/\b(?:agitacao|rpm)\s*(?:de\s*|em\s*)?(\d+(?:\.\d+)?)/gi),
    ];
    if (agitMatches.length > 0) {
      const val = agitMatches[agitMatches.length - 1][1];
      setAgitInput(val);
      detected.add('Agitação');
    }

    // 8. Pressão (bar)
    const presMatches = [
      ...cleanAscii.matchAll(/\b(?:pressao)\s*(?:de\s*|em\s*)?(\d+(?:\.\d+)?)/gi),
    ];
    if (presMatches.length > 0) {
      const val = presMatches[presMatches.length - 1][1];
      setPresInput(val);
      detected.add('Pressão');
    }

    // 9. Vazão de Ar (L/min)
    const airMatches = [
      ...cleanAscii.matchAll(/\b(?:vazao(?:\s+de\s+ar)?)\s*(?:de\s*|em\s*)?(\d+(?:\.\d+)?)/gi),
    ];
    if (airMatches.length > 0) {
      const val = airMatches[airMatches.length - 1][1];
      setAirInput(val);
      detected.add('Vazão');
    }

    // 10. Observações / Justificativa / Ação Corretiva
    const notesMatches = [
      ...rawFullTranscript.matchAll(
        /\b(?:observa[cç][aã]o|observa[cç][oõ]es|justificativa|a[cç][aã]o\s+corretiva)\s*[:\-]?\s*(.+)$/gi
      ),
    ];
    if (notesMatches.length > 0) {
      const noteText = notesMatches[notesMatches.length - 1][1].trim();
      if (noteText) {
        setNotes(noteText.charAt(0).toUpperCase() + noteText.slice(1));
        detected.add('Observações');
      }
    }

    voiceSpokenFieldsSetRef.current = detected;
    setVoiceFilledFields(Array.from(detected));
    if (errorMsg) setErrorMsg('');
  };

  const handleToggleVoiceCommand = async () => {
    if (isListening) {
      stopVoiceRecognition();
      setVoiceStatusMsg('Microfone pausado. Confira os valores preenchidos e clique em Salvar.');
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setVoiceStatusMsg(
        'Seu navegador não suporta reconhecimento de voz nativo. Utilize o Google Chrome, Edge ou Safari.'
      );
      return;
    }

    // Solicita acesso ao microfone explicitamente no clique do usuário para evitar bloqueios silenciosos
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Libera o stream de teste imediatamente para o SpeechRecognition assumir o microfone
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        setVoiceStatusMsg(
          'Permissão do microfone bloqueada. Clique no ícone de cadeado/permissões na barra de endereço do navegador e permita o Microfone.'
        );
        return;
      }
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceStatusMsg('Ouvindo em português... Fale os parâmetros naturalmente.');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let newFinalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            newFinalChunk += ' ' + transcriptChunk;
          } else {
            interim += ' ' + transcriptChunk;
          }
        }

        if (newFinalChunk) {
          accumulatedFinalTranscriptRef.current = (
            accumulatedFinalTranscriptRef.current +
            ' ' +
            newFinalChunk
          ).trim();
        }

        const combinedTranscript = (
          accumulatedFinalTranscriptRef.current +
          ' ' +
          interim
        ).trim();

        setVoiceTranscript(combinedTranscript);
        applyVoiceCommandsFromText(combinedTranscript);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          isListeningIntendedRef.current = false;
          setIsListening(false);
          setVoiceStatusMsg(
            'Acesso ao microfone negado pelo navegador. Permita o uso do microfone na barra de endereço.'
          );
        } else if (event.error === 'no-speech') {
          // Mantém escutando silenciosamente caso haja pausa na fala
        } else {
          setVoiceStatusMsg(`Aviso de áudio (${event.error}). Continue falando ou clique novamente.`);
        }
      };

      recognition.onend = () => {
        // Se o usuário ainda não clicou para parar, reconecta automaticamente para suportar pausas longas
        if (isListeningIntendedRef.current) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      isListeningIntendedRef.current = true;
      recognition.start();
    } catch (e) {
      setIsListening(false);
      setVoiceStatusMsg('Não foi possível iniciar o microfone neste navegador.');
    }
  };

  // Sempre que o modal abrir, preenche os dados do registro em edição OU configura um novo registro com data/hora atual
  useEffect(() => {
    if (!isOpen) return;

    accumulatedFinalTranscriptRef.current = '';
    voiceSpokenFieldsSetRef.current = new Set();
    setVoiceTranscript('');
    setVoiceFilledFields([]);
    setVoiceStatusMsg('');

    if (editingRecord) {
      setReactorId(editingRecord.reactorId);
      setOperatorName(editingRecord.operatorName);
      setIsCustomOperatorMode(false);
      setCustomOperatorInput('');
      setDate(editingRecord.date);
      setTime(editingRecord.time);

      if (editingRecord.inoculationDate && editingRecord.inoculationTime) {
        setInoculationDate(editingRecord.inoculationDate);
        setInoculationTime(editingRecord.inoculationTime);
      } else {
        const recTs = editingRecord.timestamp || Date.now();
        const estInoc = new Date(recTs - (editingRecord.processHours || 0) * 3600 * 1000);
        setInoculationDate(getLocalDateYYYYMMDD(estInoc));
        setInoculationTime(getLocalTimeHHMM(estInoc));
      }

      setBatchId(editingRecord.batchId || '');
      setTempInput(String(editingRecord.temperature ?? 30));
      setDoInput(String(editingRecord.dissolvedOxygen ?? 21));
      setNoDOProbe(Boolean(editingRecord.noDOProbe));
      setAgitInput(String(editingRecord.agitation ?? 95));
      setPresInput(String(editingRecord.pressure ?? 0.1));
      setAirInput(String(editingRecord.airflow ?? 85));
      setNotes(editingRecord.notes || '');
      setErrorMsg('');
    } else {
      const now = new Date();
      setDate(getLocalDateYYYYMMDD(now));
      setTime(getLocalTimeHHMM(now));
      setReactorId(initialReactorId);

      const sc = getScaleByReactorId(initialReactorId);
      const sp = SCALE_SPECS[sc];
      setTempInput('30');
      setDoInput('21');
      setNoDOProbe(false);
      setAgitInput(String(sp.agitation.target));
      setPresInput(String(sp.pressure.target));
      setAirInput(String(sp.airflow.target));

      const resolved = resolveInoculationForReactor(initialReactorId, now);
      setInoculationDate(resolved.inocDate);
      setInoculationTime(resolved.inocTime);
      setBatchId('');
      setNotes('');
      setErrorMsg('');
    }
  }, [isOpen, initialReactorId, editingRecord]);

  useEffect(() => {
    if (
      !editingRecord &&
      !operators.includes(operatorName) &&
      operators.length > 0 &&
      !isCustomOperatorMode
    ) {
      setOperatorName(operators[0]);
    }
  }, [operators, operatorName, isCustomOperatorMode, editingRecord]);

  // Quando o operador troca o biorreator dentro do modal aberto, atualiza alvos e inoculação do tanque
  const handleReactorChange = (newReactorId: number) => {
    setReactorId(newReactorId);
    const sc = getScaleByReactorId(newReactorId);
    const sp = SCALE_SPECS[sc];
    setAgitInput(String(sp.agitation.target));
    setPresInput(String(sp.pressure.target));
    setAirInput(String(sp.airflow.target));

    const checkDateObj = new Date(`${date}T${time}:00`);
    const refDate = isNaN(checkDateObj.getTime()) ? new Date() : checkDateObj;
    const resolved = resolveInoculationForReactor(newReactorId, refDate);
    setInoculationDate(resolved.inocDate);
    setInoculationTime(resolved.inocTime);
    setErrorMsg('');
  };

  if (!isOpen) return null;

  // Cálculo automático do Tempo de Cultivo (processHours) a partir da Data/Hora de Inoculação e Data/Hora do Checklist
  const inocTimestamp = new Date(`${inoculationDate}T${inoculationTime}:00`).getTime();
  const checkTimestamp = new Date(`${date}T${time}:00`).getTime();
  const rawDiffHours =
    !isNaN(inocTimestamp) && !isNaN(checkTimestamp)
      ? (checkTimestamp - inocTimestamp) / (1000 * 60 * 60)
      : 0;
  const isInoculationAfterCheck = rawDiffHours < 0;
  const processHours = Math.max(0, Number(rawDiffHours.toFixed(1)));

  // Formatação amigável (ex: 14h 30min)
  const formatElapsedDuration = (hoursFloat: number) => {
    const totalMinutes = Math.max(0, Math.round(hoursFloat * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m > 0 ? `${h}h ${m}min (${hoursFloat.toFixed(1)}h)` : `${h}h (${hoursFloat.toFixed(1)}h)`;
  };

  // Validation in real-time with 3-tier color semaphore
  const validation = validateChecklistValues(scale, {
    temperature,
    dissolvedOxygen: noDOProbe ? 0 : dissolvedOxygen,
    noDOProbe,
    agitation,
    pressure,
    airflow,
    processHours,
  });

  const doPhase = getDOPhaseForHours(scale, processHours);

  // Helper for dark mode semaphore card classes
  const getSemaphoreCardStyle = (level: SemaphoreLevel) => {
    switch (level) {
      case 'nominal':
        return 'bg-emerald-950/35 border-emerald-500/60 ring-1 ring-emerald-500/20';
      case 'warning':
        return 'bg-amber-950/40 border-amber-500/70 ring-1 ring-amber-500/25';
      case 'critical':
        return 'bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/30';
      case 'free':
      default:
        return 'bg-[#131C2E]/80 border-slate-700/80';
    }
  };

  const getSemaphoreInputStyle = (level: SemaphoreLevel) => {
    switch (level) {
      case 'nominal':
        return 'border-emerald-500/60 text-emerald-100 bg-[#080C14] focus:ring-emerald-500';
      case 'warning':
        return 'border-amber-500/70 text-amber-100 bg-[#080C14] focus:ring-amber-500';
      case 'critical':
        return 'border-rose-500 text-rose-100 bg-[#080C14] focus:ring-rose-500';
      case 'free':
      default:
        return 'border-slate-700 text-slate-100 bg-[#080C14] focus:ring-cyan-500';
    }
  };

  const renderSemaphoreBadge = (level: SemaphoreLevel) => {
    if (level === 'nominal') {
      return (
        <span className="font-semibold text-emerald-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          Dentro da Faixa
        </span>
      );
    }
    if (level === 'warning') {
      return (
        <span className="font-semibold text-amber-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Próximo ao Limite
        </span>
      );
    }
    if (level === 'critical') {
      return (
        <span className="font-bold text-rose-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
          FORA DA FAIXA
        </span>
      );
    }
    return (
      <span className="font-medium text-slate-400 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
        Registro Livre
      </span>
    );
  };

  const handleConfirmCustomOperator = () => {
    const trimmed = customOperatorInput.trim();
    if (!trimmed) return;
    if (onAddOperator) {
      onAddOperator(trimmed);
    }
    setOperatorName(trimmed);
    setCustomOperatorInput('');
    setIsCustomOperatorMode(false);
  };

  const effectiveOperatorName = isCustomOperatorMode
    ? customOperatorInput.trim() || operatorName
    : operatorName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    stopVoiceRecognition();
    const finalOperator =
      (isCustomOperatorMode ? customOperatorInput.trim() : operatorName.trim()) || 'Operador';

    if (!batchId.trim()) {
      setErrorMsg('Por favor, preencha o Numero da OP (campo obrigatório).');
      return;
    }

    if (isCustomOperatorMode && !customOperatorInput.trim()) {
      setErrorMsg(
        'Por favor, digite o nome do novo operador ou selecione um nome da lista suspensa.'
      );
      return;
    }

    if (!date || !time || !inoculationDate || !inoculationTime) {
      setErrorMsg('Por favor, preencha a data e o horário do check e da inoculação.');
      return;
    }

    if (isInoculationAfterCheck) {
      setErrorMsg(
        'A Data/Horário de Inoculação não pode ser posterior à Data/Horário do Checklist atual.'
      );
      return;
    }

    if (
      !tempInput.trim() ||
      !presInput.trim() ||
      !agitInput.trim() ||
      !airInput.trim() ||
      (!noDOProbe && !doInput.trim())
    ) {
      setErrorMsg('Por favor, preencha todos os parâmetros numéricos obrigatórios do processo.');
      return;
    }

    if (!validation.isFullyNominal && !notes.trim()) {
      setErrorMsg(
        'Atenção GMP: Como há parâmetro(s) em VERMELHO (fora da faixa aceitável), é obrigatório preencher a justificativa ou ação corretiva tomada.'
      );
      return;
    }

    const newRecord: ChecklistRecord = {
      id: editingRecord ? editingRecord.id : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reactorId,
      reactorTag: `BR-${String(reactorId).padStart(2, '0')}`,
      scale,
      batchId: batchId.trim(),
      operatorName: finalOperator,
      date,
      time,
      timestamp: !isNaN(checkTimestamp) ? checkTimestamp : Date.now(),
      inoculationDate,
      inoculationTime,
      processHours,
      archived: editingRecord ? Boolean(editingRecord.archived) : false,
      temperature,
      dissolvedOxygen: noDOProbe ? 0 : dissolvedOxygen,
      noDOProbe: noDOProbe || undefined,
      agitation,
      pressure,
      airflow,
      isTemperatureNominal: validation.isTemperatureNominal,
      isPressureNominal: validation.isPressureNominal,
      isAgitationNominal: validation.isAgitationNominal,
      isAirflowNominal: validation.isAirflowNominal,
      isDONominal: validation.isDONominal,
      isFullyNominal: validation.isFullyNominal,
      deviationsCount: validation.deviationsCount,
      deviationNotes: validation.deviations.length > 0 ? validation.deviations.join('; ') : undefined,
      operatorSignature: `OP-${finalOperator.split(' ')[0].toUpperCase()}`,
      notes: notes.trim(),
    };

    setIsCustomOperatorMode(false);
    setCustomOperatorInput('');
    setErrorMsg('');
    onSave(newRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-[#0F1624] rounded-2xl shadow-2xl border border-slate-700/80 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header (Sempre visível no topo) */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-[#080C14] text-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/15 rounded-lg text-cyan-400 border border-cyan-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                {editingRecord
                  ? `Editar Checklist · ${editingRecord.reactorTag} (${editingRecord.date.split('-').reverse().slice(0, 2).join('/')} ${editingRecord.time})`
                  : 'Novo Checklist de Parâmetros de Biorreator'}
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Sinalização visual inteligente por cores (Verde: Nominal · Amarelo: Borda · Vermelho: Fora da Faixa)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão Principal de Comando por Voz no Topo do Modal */}
            <button
              type="button"
              onClick={handleToggleVoiceCommand}
              title={
                isListening
                  ? 'Clique para pausar o preenchimento por voz'
                  : 'Clique para falar todos os parâmetros pelo microfone'
              }
              className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-600 text-white shadow-[0_0_24px_rgba(225,29,72,0.75)] ring-2 ring-rose-400 animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.55)] border border-blue-400/40'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>Ouvindo... (Clique p/ Parar)</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Ativar Comando de Voz</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Painel de Comando de Voz em Destaque no Topo do Formulário */}
          <div
            className={`rounded-xl p-4 border transition-all ${
              isListening
                ? 'bg-blue-950/40 border-blue-500/70 ring-2 ring-blue-500/30'
                : 'bg-[#080C14] border-blue-500/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleVoiceCommand}
                  title={isListening ? 'Pausar microfone' : 'Clique no microfone para falar'}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.7)] animate-pulse'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_16px_rgba(37,99,235,0.5)]'
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      Preenchimento Automático por Voz (Clique no Microfone ao lado)
                    </span>
                    {isListening && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full">
                        Microfone Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {voiceStatusMsg ||
                      'Clique no ícone do microfone e fale todos os campos em sequência. O sistema preenche sozinho.'}
                  </p>
                </div>
              </div>

              {voiceTranscript && (
                <button
                  type="button"
                  onClick={() => {
                    accumulatedFinalTranscriptRef.current = '';
                    voiceSpokenFieldsSetRef.current = new Set();
                    setVoiceTranscript('');
                    setVoiceFilledFields([]);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-200 underline self-end sm:self-center shrink-0"
                >
                  Limpar transcrição
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/80 font-mono leading-relaxed">
              <strong className="text-blue-400 font-sans">Como falar:</strong>{' '}
              "Tanque 5, OP 1070387, operador Vinicius, temperatura 30,5, oxigênio 21,8{' '}
              <span className="text-slate-500">(ou oxigênio sem sonda)</span>, agitação 150, pressão
              0,30, vazão 100"
            </p>

            {voiceTranscript && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-2">
                <div className="text-xs font-mono text-cyan-200 bg-[#050811]/90 border border-slate-800 rounded-lg px-3 py-2">
                  <span className="text-slate-500 select-none">Fala reconhecida: </span>"
                  {voiceTranscript}"
                </div>

                {voiceFilledFields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Campos preenchidos por voz:</span>
                    {voiceFilledFields.map((field) => (
                      <span
                        key={field}
                        className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full"
                      >
                        ✓ {field}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 1: Identification & Metadata */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 mb-3">
              01. Identificação do Equipamento, Registro & Inoculação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Reactor Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Número do Biorreator *
                </label>
                <select
                  value={reactorId}
                  onChange={(e) => handleReactorChange(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {REACTORS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag} · {r.name} ({r.scale})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Escala: <strong className="text-cyan-400">{scale}</strong>
                </span>
              </div>

              {/* Operator Select + Add New Operator */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 whitespace-nowrap">
                    Nome *
                  </label>
                  {!isCustomOperatorMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomOperatorMode(true);
                        setCustomOperatorInput('');
                      }}
                      className="text-[11px] leading-4 font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 whitespace-nowrap"
                    >
                      <UserPlus className="w-3 h-3 shrink-0" />
                      Novo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomOperatorMode(false);
                        setCustomOperatorInput('');
                      }}
                      className="text-[11px] leading-4 font-semibold text-slate-400 hover:text-slate-200 whitespace-nowrap"
                    >
                      Lista
                    </button>
                  )}
                </div>

                {!isCustomOperatorMode ? (
                  <select
                    value={operatorName}
                    onChange={(e) => {
                      if (e.target.value === '__ADD_NEW__') {
                        setIsCustomOperatorMode(true);
                        setCustomOperatorInput('');
                      } else {
                        setOperatorName(e.target.value);
                      }
                    }}
                    className="w-full text-xs bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {operators.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                    <option value="__ADD_NEW__" className="text-cyan-400 font-semibold">
                      + Digitar um nome novo...
                    </option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customOperatorInput}
                      onChange={(e) => setCustomOperatorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmCustomOperator();
                        }
                      }}
                      placeholder="Digite o novo operador..."
                      autoFocus
                      className="w-full text-xs bg-[#080C14] border border-cyan-500/70 rounded-lg px-2.5 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmCustomOperator}
                      disabled={!customOperatorInput.trim()}
                      className="px-2.5 py-2 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 rounded-lg transition-colors shrink-0"
                      title="Adicionar à lista suspensa"
                    >
                      Add
                    </button>
                  </div>
                )}
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {isCustomOperatorMode
                    ? 'Será adicionado à lista suspensa'
                    : 'Responsável pelo registro'}
                </span>
              </div>

              {/* Date & Time of Checklist */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Data do Check *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Data atual do registro</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Horário do Check *
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Horário atual do registro</span>
              </div>
            </div>

            {/* Batch + Inoculation Date & Time + Automatic Cultivo Hours Calculation */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mt-4 p-3.5 bg-[#080C14]/90 border border-slate-800 rounded-lg">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Numero da OP *
                </label>
                <input
                  type="text"
                  value={batchId}
                  onChange={(e) => {
                    setBatchId(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Digite o número da OP..."
                  required
                  className="w-full text-xs font-mono bg-[#0F1624] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-cyan-300 mb-1">
                  Data de Inoculação *
                </label>
                <input
                  type="date"
                  value={inoculationDate}
                  onChange={(e) => setInoculationDate(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#0F1624] border border-cyan-500/40 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-cyan-300 mb-1">
                  Horário de Inoculação *
                </label>
                <input
                  type="time"
                  value={inoculationTime}
                  onChange={(e) => setInoculationTime(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#0F1624] border border-cyan-500/40 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Automatic Elapsed Cultivation Hours Readout */}
              <div className="sm:col-span-3 flex flex-col justify-between bg-[#131C2E] border border-cyan-500/30 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Tempo em Cultivo:</span>
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div
                  className={`text-sm font-mono font-bold mt-0.5 ${
                    isInoculationAfterCheck ? 'text-rose-400' : 'text-cyan-300'
                  }`}
                >
                  {isInoculationAfterCheck
                    ? 'Data/Hora Inválida'
                    : formatElapsedDuration(processHours)}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {doPhase
                    ? `Fase O2: ${doPhase.phase}`
                    : `Escala ${scale}: O2 livre`}
                </div>
              </div>

              {/* Phase Info Strip below */}
              <div className="sm:col-span-12 pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400">
                  Cálculo automático: <strong className="text-slate-200">Inoculação ({inoculationDate.split('-').reverse().join('/')} às {inoculationTime})</strong> até <strong className="text-slate-200">Check ({date.split('-').reverse().join('/')} às {time})</strong> = <strong className="text-cyan-400 font-mono">{processHours} horas de cultivo</strong>
                </span>
                {doPhase ? (
                  <span className="text-teal-400 font-medium font-mono">
                    Faixa O2 ({doPhase.phase} · {doPhase.intervalHours}): {doPhase.o2ProbeMin}% a {doPhase.o2ProbeMax}%
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Escala {scale}: sem curva tabelada de O2 (registro livre)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Parameters & Realtime Color Semaphore */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold text-slate-400">
                02. Parâmetros do Processo & Semáforo de Faixa Aceitável ({scale})
              </h3>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Nominal
                </span>
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Limite Próximo
                </span>
                <span className="flex items-center gap-1 text-rose-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Fora da Faixa
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Temperatura */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.tempSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Temperatura (°C) *</label>
                  <span className="text-[11px] font-mono text-slate-400">Alvo: 30°C (±2°C)</span>
                </div>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  value={tempInput}
                  onChange={(e) => {
                    setTempInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.tempSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">Aceitável: 28.0 a 32.0 °C</span>
                  {renderSemaphoreBadge(validation.tempSemaphore)}
                </div>
              </div>

              {/* Pressão */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.presSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Pressão (bar) *</label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Alvo: {specs.pressure.target.toFixed(2)} (±0.05)
                  </span>
                </div>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  value={presInput}
                  onChange={(e) => {
                    setPresInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.presSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    Aceitável: {(specs.pressure.min ?? 0).toFixed(2)} a {(specs.pressure.max ?? 0).toFixed(2)} bar
                  </span>
                  {renderSemaphoreBadge(validation.presSemaphore)}
                </div>
              </div>

              {/* Agitação */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.agitSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Agitação (RPM) *</label>
                  <span className="text-[11px] font-mono text-slate-400">Fixo: {specs.agitation.target} RPM</span>
                </div>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  value={agitInput}
                  onChange={(e) => {
                    setAgitInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.agitSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">Exato: {specs.agitation.target} RPM</span>
                  {renderSemaphoreBadge(validation.agitSemaphore)}
                </div>
              </div>

              {/* Vazão de Ar */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.airSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Vazão de Ar (L/min) *</label>
                  <span className="text-[11px] font-mono text-slate-400">Alvo: {specs.airflow.target} (±10)</span>
                </div>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  value={airInput}
                  onChange={(e) => {
                    setAirInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.airSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    Aceitável: {specs.airflow.min} a {specs.airflow.max} L/min
                  </span>
                  {renderSemaphoreBadge(validation.airSemaphore)}
                </div>
              </div>

              {/* Oxigênio Dissolvido (Sonda %) */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.doSemaphore)}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-bold text-slate-100">
                    Oxigênio Dissolvido (%) {!noDOProbe && '*'}
                  </label>
                  <label
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300 cursor-pointer select-none bg-[#080C14]/90 border border-slate-700/90 hover:border-cyan-500/60 px-2 py-0.5 rounded transition-colors shrink-0"
                    title="Marque quando o biorreator estiver operando sem sonda de O2 para não contabilizar desvio"
                  >
                    <input
                      type="checkbox"
                      checked={noDOProbe}
                      onChange={(e) => {
                        setNoDOProbe(e.target.checked);
                        if (errorMsg) setErrorMsg('');
                      }}
                      className="rounded border-slate-600 bg-slate-900 text-cyan-400 focus:ring-cyan-500 w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                    />
                    Sem sonda
                  </label>
                </div>

                {noDOProbe ? (
                  <div className="w-full text-xs font-mono font-semibold border border-slate-700/80 bg-[#080C14]/70 text-slate-400 rounded-md px-3 py-2 flex items-center justify-between">
                    <span>Sem sonda instalada</span>
                    <span className="text-[10px] text-cyan-400 font-sans">Isento de desvio</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    required
                    value={doInput}
                    onChange={(e) => {
                      setDoInput(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.doSemaphore)}`}
                  />
                )}

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    {noDOProbe
                      ? `${processHours}h · Sem sonda`
                      : doPhase
                      ? `${processHours}h · ${doPhase.o2ProbeMin}% a ${doPhase.o2ProbeMax}%`
                      : `${processHours}h · Escala ${scale} livre`}
                  </span>
                  {noDOProbe ? (
                    <span className="font-semibold text-cyan-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                      Sem Sonda
                    </span>
                  ) : (
                    renderSemaphoreBadge(validation.doSemaphore)
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live Status Banner */}
          {validation.isFullyNominal && validation.warningsCount === 0 ? (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/50 rounded-lg flex items-center gap-2.5 text-xs text-emerald-200">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-emerald-300">Leitura 100% Nominal (Verde):</strong> Todos os parâmetros estão confortavelmente dentro das faixas aceitáveis para o biorreator {activeReactor?.tag} ({scale}).
              </span>
            </div>
          ) : validation.isFullyNominal && validation.warningsCount > 0 ? (
            <div className="p-3.5 bg-amber-950/50 border border-amber-500/60 rounded-lg space-y-1 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Atenção Preventiva (Amarelo): Parâmetro(s) próximo(s) do limite aceitável:</span>
              </div>
              <ul className="list-disc list-inside pl-1 text-[11px] space-y-0.5 text-amber-200">
                {validation.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-3.5 bg-rose-950/60 border-2 border-rose-500/80 rounded-lg space-y-1.5 text-xs text-rose-200">
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>ALERTA VERMELHO: {validation.deviationsCount} parâmetro(s) FORA DA FAIXA ACEITÁVEL:</span>
              </div>
              <ul className="list-disc list-inside pl-1 text-[11px] font-medium space-y-0.5 text-rose-200">
                {validation.deviations.map((dev, i) => (
                  <li key={i}>{dev}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-300 font-semibold pt-1">
                * Preencha obrigatoriamente o campo de Ação Corretiva abaixo para registrar este checklist.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-600 text-white text-xs font-semibold rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 3: Notes & Mandatory Corrective Action if Red */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {validation.isFullyNominal
                ? 'Observações do Turno (Opcional)'
                : 'Justificativa / Ação Corretiva Obrigatória (Parâmetro Fora da Faixa) *'}
            </label>
            <textarea
              rows={2}
              required={!validation.isFullyNominal}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder={
                validation.isFullyNominal
                  ? 'Ex: Sondas verificadas; Batelada operando em regime estacionário...'
                  : 'Descreva obrigatoriamente a ação tomada (ex: Ajuste de válvula de ar, reinicialização do chiller, calibração de sonda)...'
              }
              className={`w-full text-xs bg-[#080C14] border rounded-lg p-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                !validation.isFullyNominal
                  ? 'border-rose-500 focus:ring-rose-500'
                  : 'border-slate-700 focus:ring-cyan-500'
              }`}
            />
          </div>

          {/* Footer Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-400 font-mono">
              Assinatura Eletrônica: OP-{effectiveOperatorName.split(' ')[0]?.toUpperCase() || 'OPERADOR'}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleToggleVoiceCommand}
                className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isListening ? 'Parar Microfone' : 'Falar Parâmetros'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-[#131C2E] border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  validation.isFullyNominal
                    ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                {editingRecord
                  ? 'Salvar Alterações do Checklist'
                  : validation.isFullyNominal
                  ? 'Salvar Checklist Nominal'
                  : 'Registrar com Desvio Justificado'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  BatteryMedium,
  Play,
  Pause,
  Square,
  StepForward,
  RotateCcw,
  Sliders,
  Activity,
  FolderArchive,
  Bot,
  Layers,
  MapPin,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  BookOpen,
  RefreshCw,
  Radio,
  X,
  ChevronUp,
  ShieldCheck,
  CheckCircle2,
  Pickaxe,
  Waves,
  Zap,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { Pseudosection } from './components/Pseudosection';
import { ContactTestView } from './components/ContactTestView';
import { SurveyConfigView } from './components/SurveyConfigView';
import { FilesView } from './components/FilesView';
import { AIAssistantView } from './components/AIAssistantView';
import { AlluvialGoldView } from './components/AlluvialGoldView';
import { RollAlongModal } from './components/RollAlongModal';
import { FieldNotesModal, FieldNote } from './components/FieldNotesModal';
import { ReportModal } from './components/ReportModal';
import { SurveyFinalizedModal } from './components/SurveyFinalizedModal';
import { QuadripolePoint, SequenceConfig } from './utils/ert-math';
import { SuggestedDrillhole, loadAcceptedDrillholes } from './utils/petrophysics';
import { beeper } from './utils/audio-beeper';

interface InstrumentStatus {
  connected: boolean;
  connecting: boolean;
  ssid: string;
  ip: string;
  signalDbm: number;
  firmware: string;
  batteryInternal: number;
  batteryExternal: number;
  gpsStatus: string;
  gpsSatellites: number;
  transmitterPowerW: number;
  maxVoltageVp: number;
  channels: number;
  temperatureC: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'survey' | 'alluvial' | 'contact' | 'config' | 'files' | 'ai'>('survey');
  const [isSunlightMode, setIsSunlightMode] = useState(false);
  const [showChannelsDrawer, setShowChannelsDrawer] = useState(false);

  // Safety interlocks (Transmitter 800 Vp-p arming and Stop confirmation)
  const [isTxArmed, setIsTxArmed] = useState(false);
  const [showArmTxModal, setShowArmTxModal] = useState(false);
  const [showConfirmStopModal, setShowConfirmStopModal] = useState(false);
  const [showRemeasureModal, setShowRemeasureModal] = useState(false);
  const [remeasureThreshold, setRemeasureThreshold] = useState(2.0);

  // Modals
  const [isRollAlongOpen, setIsRollAlongOpen] = useState(false);
  const [isFieldNotesOpen, setIsFieldNotesOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isFinalizedModalOpen, setIsFinalizedModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 4500);
  };

  const [fieldNotes, setFieldNotes] = useState<FieldNote[]>([
    {
      id: '1',
      stationOrElectrode: 'Pica #18',
      timestamp: '10:14',
      text: 'Zona de suelo seco pedregoso; humectado con solución salina.',
      category: 'contact',
    },
    {
      id: '2',
      stationOrElectrode: 'Pica #41',
      timestamp: '10:28',
      text: 'Afloramiento de cuarcitas con fracturas subverticales.',
      category: 'geology',
    },
  ]);

  const [soundMuted, setSoundMuted] = useState(false);

  useEffect(() => {
    beeper.enabled = !soundMuted;
  }, [soundMuted]);

  useEffect(() => {
    if (isSunlightMode) {
      document.body.classList.add('sunlight-mode');
    } else {
      document.body.classList.remove('sunlight-mode');
    }
  }, [isSunlightMode]);

  // Telemetry state
  const [instrument, setInstrument] = useState<InstrumentStatus>({
    connected: true,
    connecting: false,
    ssid: 'SuperSting-R8',
    ip: '192.168.1.1',
    signalDbm: -58,
    firmware: '4.2',
    batteryInternal: 12.6,
    batteryExternal: 12.4,
    gpsStatus: '3D Fix',
    gpsSatellites: 9,
    transmitterPowerW: 200,
    maxVoltageVp: 800,
    channels: 8,
    temperatureC: 28.4,
  });

  // Survey session state
  const [isRunning, setIsRunning] = useState(false);
  const [points, setPoints] = useState<QuadripolePoint[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [lastBatch, setLastBatch] = useState<QuadripolePoint[]>([]);
  const [activeElectrodes, setActiveElectrodes] = useState<{ tx: number[]; rx: number[] }>({
    tx: [],
    rx: [],
  });

  // Survey configuration
  const [config, setConfig] = useState<SequenceConfig & { jobName: string }>({
    jobName: 'MINA-VETA01',
    progId: 'MINAVETA',
    arrayType: 'dd',
    electrodes: 56,
    spacing: 5,
    nMax: 8,
    maxCurrent: 500,
    measureTime: 1.2,
    isIP: true,
    ipCycle: 2,
    minStacks: 2,
    maxStacks: 6,
    stackErrorThreshold: 2.0,
    stackCycles: 4,
    errorThreshold: 2.0,
    miningPreset: 'epithermal_veins',
    transmitterType: 'internal_200w',
    transmitterPowerW: 200,
    maxVoltageVp: 800,
    targetMineralization: 'gold_silver_veins',
    activeMultipliers: [1, 2, 3],
    remoteElectrodeB: {
      distanceM: 1800,
      azimuthDeg: 90,
      resistanceOhm: 320,
      isGrounded: true,
    },
  });

  // Contact test results
  const [contactSummary, setContactSummary] = useState<any | null>(null);
  const [isLoadingContact, setIsLoadingContact] = useState(false);

  // Pseudosection display options
  const [viewMode, setViewMode] = useState<'rho' | 'ip'>('rho');
  const [selectedPoint, setSelectedPoint] = useState<QuadripolePoint | null>(null);
  const [acceptedDrillholes, setAcceptedDrillholes] = useState<SuggestedDrillhole[]>(() =>
    loadAcceptedDrillholes()
  );

  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchState = async () => {
    try {
      const [instRes, surveyRes] = await Promise.all([
        fetch('/api/instrument/status'),
        fetch('/api/survey/state'),
      ]);
      const instData = await instRes.json();
      const surveyData = await surveyRes.json();

      if (instData.status === 'ok') {
        setInstrument(instData.instrument);
        if (instData.contactSummary) {
          setContactSummary((cur: any) => cur ?? instData.contactSummary);
        }
      }
      if (surveyData.status === 'ok') {
        setIsRunning(surveyData.isRunning);
        setCurrentIndex(surveyData.currentIndex);
        setTotalPoints(surveyData.totalPoints);
        setPoints(surveyData.points || []);
        setConfig(surveyData.config);
        setActiveElectrodes(surveyData.activeElectrodes || { tx: [], rx: [] });
        setLastBatch(surveyData.lastBatch || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchState();

    const es = new EventSource('/api/survey/events');
    eventSourceRef.current = es;

    es.addEventListener('shot_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setCurrentIndex(data.currentIndex);
        setTotalPoints(data.totalPoints);
        setActiveElectrodes(data.activeElectrodes || { tx: [], rx: [] });
        setLastBatch(data.batch || []);
        if (data.batch) {
          beeper.playShotBeep();
          setPoints((prev) => {
            const next = [...prev];
            data.batch.forEach((pt: QuadripolePoint, idx: number) => {
              const globalIdx = data.currentIndex - data.batch.length + idx;
              next[globalIdx] = pt;
            });
            return next;
          });
        }
        if (data.batteryInternal) {
          setInstrument((prev) => ({
            ...prev,
            batteryInternal: data.batteryInternal,
            batteryExternal: data.batteryExternal ?? prev.batteryExternal,
          }));
        }
      } catch (err) {
        console.error(err);
      }
    });

    es.addEventListener('survey_started', () => {
      setIsRunning(true);
      fetchState();
    });

    es.addEventListener('survey_paused', () => setIsRunning(false));
    es.addEventListener('survey_stopped', () => {
      setIsRunning(false);
      fetchState();
    });
    es.addEventListener('survey_completed', () => {
      setIsRunning(false);
      beeper.playCompletionChirp();
      fetchState();
    });

    es.addEventListener('remeasure_completed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        fetchState();
        beeper.playShotBeep();
        if (data.remeasuredCount > 0) {
          showToast(`✓ Remedición completada: ${data.remeasuredCount} puntos actualizados. Error reducido a ${data.newAvgErr}%.`, 'success');
        }
      } catch (err) {
        console.error(err);
      }
    });

    es.addEventListener('instrument_state', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setInstrument((prev) => ({ ...prev, ...data }));
      } catch (err) {
        console.error(err);
      }
    });

    es.addEventListener('contact_test_results', (e: MessageEvent) => {
      try {
        const summary = JSON.parse(e.data);
        setContactSummary(summary);
        if (summary.over10k > 0) beeper.playWarningBuzz();
      } catch (err) {
        console.error(err);
      }
    });

    const interval = setInterval(() => {
      fetch('/api/instrument/status')
        .then((r) => r.json())
        .then((d) => {
          if (d.status === 'ok') setInstrument(d.instrument);
        })
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
      es.close();
    };
  }, []);

  const toggleConnection = async () => {
    try {
      const action = instrument.connected ? 'disconnect' : 'connect';
      const res = await fetch('/api/instrument/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setInstrument((prev) => ({ ...prev, connected: data.connected }));
        if (!data.connected) setIsRunning(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartSurvey = async () => {
    try {
      const res = await fetch('/api/survey/start', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setIsRunning(true);
        setIsTxArmed(true);
        beeper.playShotBeep();
        showToast('✓ Adquisición iniciada con Tx Armado (800 Vp-p).', 'info');
        fetchState();
      } else if (data.error) {
        showToast(`Aviso: ${data.error}`, 'warning');
      }
    } catch (e) {
      console.error(e);
      showToast('Error de conexión con el SuperSting.', 'warning');
    }
  };

  const isQcPassed = Boolean(
    contactSummary &&
    (
      Array.isArray(contactSummary.badElectrodes)
        ? contactSummary.badElectrodes.length === 0
        : true
    ) &&
    (
      typeof contactSummary.over5k === 'number'
        ? contactSummary.over5k === 0
        : true
    ) &&
    (
      typeof contactSummary.criticalCount === 'number'
        ? contactSummary.criticalCount === 0
        : true
    )
  );

  const requestStartSurvey = () => {
    if (!isQcPassed) {
      showToast(
        '⚠️ Inyección bloqueada por seguridad: Se requiere verificación de contacto de electrodos (QC Picas < 5.0 kΩ) antes de armar el transmisor.',
        'warning'
      );
      setActiveTab('contact');
      return;
    }
    if (!isTxArmed) {
      setShowArmTxModal(true);
      return;
    }
    handleStartSurvey();
  };

  const handleArmAndStart = () => {
    setIsTxArmed(true);
    setShowArmTxModal(false);
    handleStartSurvey();
  };

  const disarmTx = () => {
    setIsTxArmed(false);
    if (isRunning) {
      handlePauseSurvey();
    }
    showToast('Transmisor desarmado y puesto en modo seguro (0 V).', 'info');
  };

  const handlePauseSurvey = async () => {
    try {
      const res = await fetch('/api/survey/pause', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setIsRunning(false);
        showToast('Adquisición en pausa.', 'info');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const requestStopSurvey = () => {
    if (isRunning || (currentIndex > 0 && currentIndex < totalPoints)) {
      setShowConfirmStopModal(true);
      return;
    }
    executeStopSurvey();
  };

  const executeStopSurvey = async () => {
    setShowConfirmStopModal(false);
    await handleStopSurvey();
    setIsTxArmed(false);
  };

  const handleStopSurvey = async () => {
    try {
      const res = await fetch('/api/survey/stop', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setIsRunning(false);
        setIsTxArmed(false);
        beeper.playCompletionChirp();
        await fetchState();
        setIsFinalizedModalOpen(true);
        showToast(
          `✓ Línea finalizada. ${data.recordedPoints || points.length} puntos guardados en ${data.filename || config.jobName + '.stg'}.`,
          'success'
        );
      }
    } catch (e) {
      console.error(e);
      showToast('Error al comunicar finalización con el instrumento.', 'warning');
    }
  };

  const handleStepSurvey = async () => {
    try {
      const res = await fetch('/api/survey/step', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        beeper.playShotBeep();
        showToast(`Disparo de 8 canales completado (+8 lecturas).`, 'info');
        fetchState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemeasure = async (customThreshold?: number) => {
    const thresh = customThreshold ?? remeasureThreshold;
    try {
      showToast(`Ejecutando remedición (restacking) para puntos con error > ${thresh}%...`, 'info');
      const res = await fetch('/api/survey/remeasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: thresh }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        beeper.playShotBeep();
        await fetchState();
        if (data.remeasuredCount > 0) {
          showToast(
            `✓ Remedición exitosa: ${data.remeasuredCount} puntos recalculados. Error promedio reducido a ${data.newAvgErr}%.`,
            'success'
          );
        } else {
          showToast(
            `✓ Control QC Óptimo: Todos los puntos tienen error < ${data.threshold}%. Sin anomalías detectadas.`,
            'info'
          );
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Error al comunicar con el equipo para remedir.', 'warning');
    }
  };

  const handleResetSurvey = async () => {
    try {
      const res = await fetch('/api/survey/reset', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setCurrentIndex(0);
        setTotalPoints(data.totalPoints);
        setIsRunning(false);
        setIsTxArmed(false);
        showToast('✓ Línea reiniciada para nueva medición.', 'info');
        await fetchState();
      }
    } catch (e) {
      console.error(e);
      showToast('Error al reiniciar la secuencia en el equipo.', 'warning');
    }
  };

  const handleRunContactTest = async () => {
    setIsLoadingContact(true);
    try {
      const res = await fetch('/api/instrument/contact-test', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setContactSummary(data.summary);
        if (data.summary.over10k > 0) beeper.playWarningBuzz();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingContact(false);
    }
  };

  const handleSaveConfig = async (newCfg: SequenceConfig & { jobName: string }) => {
    try {
      const res = await fetch('/api/survey/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setConfig(data.config);
        fetchState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddNote = (note: Omit<FieldNote, 'id' | 'timestamp'>) => {
    const newNote: FieldNote = {
      ...note,
      id: `${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setFieldNotes((prev) => [newNote, ...prev]);
  };

  const handleDeleteNote = (id: string) => {
    setFieldNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleApplyRollAlong = async (newJobName: string) => {
    const updated = { ...config, jobName: newJobName };
    await handleSaveConfig(updated);
  };

  const progressPct = totalPoints > 0 ? Math.round((currentIndex / totalPoints) * 100) : 0;
  const avgError =
    points.length > 0
      ? (points.reduce((acc, p) => acc + (p.err || 0), 0) / points.length).toFixed(2)
      : '0.00';

  return (
    <div
      className={`h-[100dvh] w-full max-h-[100dvh] flex flex-col overflow-hidden select-none transition-colors font-sans ${
        isSunlightMode ? 'bg-[#f8fafc] text-black' : 'bg-[#06090f] text-[#dce7f5]'
      }`}
    >
      {/* 1. Executive Instrument Top Telemetry Bezel (40px) */}
      <header
        className={`h-10 px-2 sm:px-4 flex items-center justify-between border-b shrink-0 z-30 transition-colors shadow-md ${
          isSunlightMode
            ? 'bg-white border-black text-black'
            : 'bg-gradient-to-r from-[#0a101b] via-[#0e1726] to-[#0a101b] border-[#18273e] text-white'
        }`}
      >
        {/* Brand & Connection Instrument Tag */}
        <div className="flex items-center gap-2">
          <div
            className={`px-1.5 py-0.5 rounded flex items-center gap-1.5 font-mono font-bold text-xs border tracking-wider shadow-sm ${
              isSunlightMode
                ? 'bg-black text-white border-black'
                : 'bg-gradient-to-b from-sky-500/20 to-blue-700/30 text-sky-300 border-sky-400/40 shadow-sky-950/40'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="tracking-tighter">R8/IP</span>
          </div>

          <div className="flex flex-col">
            <span className="font-extrabold text-xs tracking-tight uppercase leading-none">SuperSting</span>
            <span className="hidden sm:inline text-[8px] font-mono opacity-50 tracking-widest uppercase">8-CH MULTICHANNEL</span>
          </div>

          {/* Wi-Fi Status Tag */}
          <button
            onClick={toggleConnection}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
              instrument.connected
                ? isSunlightMode
                  ? 'bg-emerald-100 text-emerald-950 border-black'
                  : 'bg-[#092219] text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-950/40'
                : isSunlightMode
                ? 'bg-red-100 text-red-950 border-black'
                : 'bg-[#291017] text-rose-300 border-rose-500/60'
            }`}
            title="Enlace Wi-Fi 802.11b/g con consola SuperSting R8: Calidad Excelente, Distancia estimada ~8-12 m, 54 Mbps"
          >
            {instrument.connected ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="hidden xs:inline">Wi-Fi Excelente ({instrument.signalDbm} dBm · ~10m)</span>
                <span className="xs:hidden">Wi-Fi {instrument.signalDbm}dBm</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-rose-500" />
                <span className="hidden xs:inline">Sin Enlace Wi-Fi</span>
                <span className="xs:hidden">Desconectado</span>
              </>
            )}
          </button>
        </div>

        {/* Center Hardware Telemetry HUD (Tablet / Desktop view) */}
        <div className="hidden md:flex items-center gap-3.5 text-[9.5px] font-mono font-semibold opacity-95">
          <div className="flex items-center gap-1.5" title="Batería principal interna (12.6V nominal, 12.1V bajo carga de inyección) y batería boost externa (12.4V nominal, 11.9V bajo carga)">
            <BatteryMedium className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Bat. Ppal (Int): <strong className="text-emerald-400">{instrument.batteryInternal}V</strong> <span className="text-[8.5px] opacity-75">({(instrument.batteryInternal - 0.48).toFixed(1)}V carga)</span>
              <span className="opacity-40 mx-1">│</span>
              Boost Tx (Ext): <strong className="text-cyan-400">{instrument.batteryExternal}V</strong> <span className="text-[8.5px] opacity-75">({(instrument.batteryExternal - 0.45).toFixed(1)}V carga)</span>
            </span>
          </div>

          <span className="opacity-30">│</span>

          <div className="flex items-center gap-1.5" title="Transmisor interno: potencia máxima nominal 200W, salida instantánea calculada según lazo de corriente, y temperatura de disipador térmico">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>
              TX: <strong>200W máx</strong> <span className="text-[8.5px] text-amber-300">({isRunning ? '178W real' : '0W standby'})</span>
              <span className="opacity-40 mx-1">·</span>
              Disipador: <strong className="text-slate-200">{instrument.temperatureC}°C</strong>
            </span>
          </div>

          <span className="opacity-30">│</span>

          <div className="flex items-center gap-1.5" title="Posicionamiento GNSS diferencial en tiempo real">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>GPS: <strong>{instrument.gpsStatus}</strong> ({instrument.gpsSatellites} Sats)</span>
          </div>
        </div>

        {/* Quick Instrument Utilities (Sunlight Mode, QC, Notes, Sound) */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          {/* Sunlight Mode Toggle Button */}
          <button
            onClick={() => setIsSunlightMode(!isSunlightMode)}
            className={`flex items-center gap-1 px-2 py-1 rounded border font-bold cursor-pointer transition-all ${
              isSunlightMode
                ? 'bg-amber-400 text-black border-black shadow'
                : 'bg-[#101b2c] text-amber-300 border-amber-500/40 hover:bg-[#182942]'
            }`}
            title="Modo Sol Alto Contraste"
          >
            {isSunlightMode ? <Sun className="w-3 h-3 fill-current text-black" /> : <Moon className="w-3 h-3 text-amber-400" />}
            <span className="hidden sm:inline">{isSunlightMode ? 'Sol' : 'Noche'}</span>
          </button>

          {/* Field Notes Modal Button */}
          <button
            onClick={() => setIsFieldNotesOpen(true)}
            className={`px-2 py-1 rounded border font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              isSunlightMode
                ? 'bg-slate-100 border-black text-black'
                : 'bg-[#101b2c] border-[#1d2f4a] text-slate-200 hover:text-white'
            }`}
            title="Libreta de Notas de Terreno"
          >
            <BookOpen className="w-3 h-3 text-amber-400" />
            <span className="hidden lg:inline">Notas ({fieldNotes.length})</span>
          </button>

          {/* QC Campaign Report Modal Button */}
          <button
            onClick={() => setIsReportOpen(true)}
            className={`px-2 py-1 rounded border font-bold flex items-center gap-1 cursor-pointer transition-colors ${
              isSunlightMode
                ? 'bg-emerald-100 border-black text-emerald-950'
                : 'bg-[#0a201b] border-emerald-500/50 text-emerald-300 hover:bg-[#0e2a24]'
            }`}
            title="Certificado de Campaña y Control de Calidad (QC)"
          >
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span className="hidden md:inline">Reporte QC</span>
          </button>

          {/* Sound Mute Toggle */}
          <button
            onClick={() => setSoundMuted(!soundMuted)}
            className={`p-1 rounded border cursor-pointer transition-colors ${
              isSunlightMode ? 'border-black hover:bg-slate-200' : 'border-[#18283e] hover:bg-slate-800'
            }`}
            title={soundMuted ? 'Beeper silenciado' : 'Beeper activo'}
          >
            {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* Floating High-Contrast Toast Notification */}
      {toast && (
        <div className="absolute top-11 inset-x-2 z-50 flex justify-center pointer-events-none animate-in fade-in duration-200">
          <div
            className={`pointer-events-auto px-4 py-2.5 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-mono font-bold max-w-lg ${
              toast.type === 'success'
                ? isSunlightMode
                  ? 'bg-emerald-100 text-emerald-950 border-black ring-1 ring-black'
                  : 'bg-[#081f18] text-emerald-200 border-emerald-400 shadow-emerald-950/70 ring-1 ring-emerald-500/30'
                : toast.type === 'warning'
                ? isSunlightMode
                  ? 'bg-amber-100 text-amber-950 border-black ring-1 ring-black'
                  : 'bg-[#291b0c] text-amber-200 border-amber-400 shadow-amber-950/70 ring-1 ring-amber-500/30'
                : isSunlightMode
                ? 'bg-slate-100 text-slate-950 border-black ring-1 ring-black'
                : 'bg-[#0d1c30] text-cyan-200 border-cyan-400 shadow-cyan-950/70 ring-1 ring-cyan-500/30'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => setToast(null)} className="p-0.5 hover:opacity-75 shrink-0 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Main Executive Stage (Fitted 100% viewport) */}
      <div className="flex-1 min-h-0 flex flex-col p-1 sm:p-2 overflow-hidden">
        {activeTab === 'survey' && (
          <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
            {/* Top Command Context Bar (Single-line mobile fitted) */}
            <div
              className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl border flex items-center justify-between text-[9px] sm:text-[11px] font-mono shrink-0 shadow-sm gap-1.5 overflow-hidden ${
                isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0a101b] border-[#18273e] text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                <span className="font-extrabold text-cyan-400 text-xs sm:text-sm tracking-tight truncate max-w-[85px] xs:max-w-none">
                  {config.jobName}
                </span>
                <span className="opacity-40">│</span>
                <span className="opacity-80 text-[8.5px] sm:text-[10px] whitespace-nowrap">
                  {config.arrayType.toUpperCase()} · {config.electrodes}p
                  <span className="hidden sm:inline"> (Δa={config.spacing}m)</span>
                </span>
                <span className="opacity-40 hidden xs:inline">│</span>
                <button
                  onClick={() => setActiveTab('alluvial')}
                  className="px-1.5 py-0.5 rounded text-[8.5px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                  title="Abrir Análisis Especializado de Oro Aluvial & Paleocanales"
                >
                  <Pickaxe className="w-2.5 h-2.5 text-amber-400" />
                  <span className="hidden xs:inline">Paleocanal</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                {/* High-Voltage Transmitter Safety Interlock Badge */}
                {isTxArmed ? (
                  <button
                    onClick={disarmTx}
                    className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/60 hover:bg-amber-500/30 flex items-center gap-1 cursor-pointer animate-pulse shrink-0"
                    title="Transmisor con alto voltaje activo (800 Vp-p). Clic para desarmar inmediatamente."
                  >
                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                    <span>TX 800V</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowArmTxModal(true)}
                    className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold bg-[#111c2e] text-slate-300 border border-slate-700 hover:border-amber-400/60 flex items-center gap-1 cursor-pointer shrink-0"
                    title="Transmisor en modo seguro (0 V). Clic para armar antes de disparar."
                  >
                    <Shield className="w-2.5 h-2.5 text-slate-400" />
                    <span>TX 0V</span>
                  </button>
                )}

                <span className="opacity-40">│</span>

                <span className="text-[9px] sm:text-[11px]">
                  <strong className="text-cyan-400">{progressPct}%</strong>
                  <span className="hidden xs:inline font-mono opacity-80 text-[8.5px] sm:text-[10px]"> ({currentIndex}/{totalPoints})</span>
                </span>
                <span className="hidden md:inline opacity-40">│</span>
                <span className="hidden md:inline" title="Error cuadrático medio de repetibilidad entre stacks consecutivos (QC de campo)">
                  Stack RMS: <strong className={Number(avgError) > 2 ? 'text-amber-400' : 'text-emerald-400'}>{avgError}%</strong>
                </span>
                <span className="opacity-40">│</span>
                <span
                  className={`font-bold flex items-center gap-1 text-[8.5px] sm:text-[10px] ${
                    isRunning ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRunning ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <span>{isRunning ? 'ADQ' : currentIndex >= totalPoints && totalPoints > 0 ? 'COMPLETO' : 'LISTO'}</span>
                </span>
              </div>
            </div>

            {/* Middle Main Pseudosection Graph (Takes remaining vertical space!) */}
            <Pseudosection
              points={points}
              totalElectrodes={config.electrodes}
              spacing={config.spacing}
              activeElectrodes={activeElectrodes}
              selectedPoint={selectedPoint}
              onSelectPoint={setSelectedPoint}
              viewMode={viewMode}
              onToggleViewMode={setViewMode}
              errorThreshold={config.errorThreshold || 2.0}
              isSunlightMode={isSunlightMode}
              fieldNotes={fieldNotes}
              lastBatch={lastBatch}
              acceptedDrillholes={acceptedDrillholes}
            />

            {/* Bottom Docked Field Control Strip */}
            <div
              className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border flex flex-col gap-1.5 shrink-0 shadow-xl ${
                isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#09101a] border-[#18273e] text-white'
              }`}
            >
              {/* Single-Line Glowing Progress Bar */}
              <div
                className={`w-full h-1 sm:h-1.5 rounded-full overflow-hidden border ${
                  isSunlightMode ? 'bg-slate-200 border-black' : 'bg-[#060b13] border-[#142033]'
                }`}
              >
                <div
                  style={{ width: `${progressPct}%` }}
                  className={`h-full transition-all duration-300 ${
                    isSunlightMode ? 'bg-black' : 'bg-gradient-to-r from-blue-600 via-sky-400 to-emerald-400'
                  }`}
                />
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center justify-between gap-1 sm:gap-1.5">
                {/* Dynamic Main Action Button based on Survey State */}
                {currentIndex >= totalPoints && totalPoints > 0 ? (
                  <button
                    onClick={handleResetSurvey}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 sm:py-2.5 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-extrabold min-h-[38px] sm:min-h-[42px] cursor-pointer btn-tactile border ${
                      isSunlightMode
                        ? 'bg-blue-600 text-white border-black hover:bg-blue-700'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white border-blue-400/60 shadow-lg shadow-blue-950/60'
                    }`}
                    title="Línea finalizada al 100%. Clic para reiniciar secuencia o iniciar nueva línea"
                  >
                    <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
                    <span className="truncate">NUEVA MEDICIÓN / REINICIAR</span>
                  </button>
                ) : !isRunning && currentIndex > 0 ? (
                  <button
                    onClick={requestStartSurvey}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 sm:py-2.5 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-extrabold min-h-[38px] sm:min-h-[42px] cursor-pointer btn-tactile border ${
                      isSunlightMode
                        ? 'bg-emerald-600 text-white border-black hover:bg-emerald-700'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white border-emerald-400/60 shadow-lg shadow-emerald-950/60'
                    }`}
                    title="Reanudar secuencia de disparos pendiente"
                  >
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-white shrink-0" />
                    <span className="truncate">REANUDAR ADQUISICIÓN</span>
                  </button>
                ) : !isRunning ? (
                  <button
                    onClick={requestStartSurvey}
                    disabled={!instrument.connected}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 sm:py-2.5 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-extrabold min-h-[38px] sm:min-h-[42px] cursor-pointer btn-tactile border ${
                      !instrument.connected
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 border-slate-400 cursor-not-allowed'
                        : !isQcPassed
                        ? 'bg-amber-950/40 text-amber-300 border-amber-500/50 hover:bg-amber-900/50'
                        : isSunlightMode
                        ? 'bg-black text-white border-black hover:bg-slate-800'
                        : isTxArmed
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white border-emerald-400/60 shadow-lg shadow-emerald-950/60'
                        : 'bg-gradient-to-r from-amber-700 to-yellow-800 hover:from-amber-600 hover:to-yellow-700 text-white border-amber-400/60 shadow-lg shadow-amber-950/60'
                    }`}
                    title={
                      !isQcPassed
                        ? 'Bloqueo de seguridad: Requiere QC de picas aprobado (< 5.0 kΩ) antes de disparar'
                        : isTxArmed
                        ? 'Iniciar disparos con transmisor armado (800 Vp-p)'
                        : 'Armar transmisor de alto voltaje (800 Vp-p) e iniciar'
                    }
                  >
                    {!isQcPassed ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                        <span className="truncate">INYECCIÓN BLOQUEADA (QC REQUERIDO)</span>
                      </>
                    ) : isTxArmed ? (
                      <>
                        <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-white shrink-0" />
                        <span className="truncate">INICIAR ADQUISICIÓN</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 shrink-0 animate-pulse" />
                        <span className="truncate">ARMAR TX Y DISPARAR</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handlePauseSurvey}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 sm:py-2.5 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-extrabold min-h-[38px] sm:min-h-[42px] cursor-pointer btn-tactile bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 text-white border border-amber-400/60 shadow-lg shadow-amber-950/60"
                    title="Pausar adquisición en curso para inspección"
                  >
                    <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-white shrink-0" />
                    <span className="truncate">PAUSAR ADQUISICIÓN</span>
                  </button>
                )}

                {/* Secondary Fast Burst Buttons */}
                <button
                  onClick={handleStepSurvey}
                  disabled={isRunning}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold min-h-[38px] sm:min-h-[42px] border cursor-pointer btn-tactile flex items-center gap-1 shrink-0 ${
                    isSunlightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-black text-black'
                      : 'bg-[#101b2c] hover:bg-[#182840] border-[#1d2f4a] text-slate-100'
                  }`}
                  title="Disparo manual individual de 8 canales simultáneos"
                >
                  <StepForward className="w-3 h-3 text-sky-400" />
                  <span className="hidden xs:inline">Paso (+8CH)</span>
                  <span className="xs:hidden">+8CH</span>
                </button>

                <button
                  onClick={() => setShowRemeasureModal(true)}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold min-h-[38px] sm:min-h-[42px] border cursor-pointer btn-tactile flex items-center gap-1 shrink-0 ${
                    isSunlightMode
                      ? 'bg-amber-100 hover:bg-amber-200 border-black text-black font-extrabold'
                      : 'bg-[#1e1a14] hover:bg-[#2b241c] border-amber-500/50 text-amber-300'
                  }`}
                  title="Seleccionar y remedir puntos ruidosos con filtro de error configurable"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">Remedir...</span>
                  <span className="sm:hidden">Remedir</span>
                </button>

                {/* Stop Survey Button with Confirmation Protection */}
                <button
                  onClick={requestStopSurvey}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold min-h-[38px] sm:min-h-[42px] border cursor-pointer btn-tactile flex items-center gap-1 shrink-0 ${
                    isSunlightMode
                      ? 'bg-rose-100 hover:bg-rose-200 border-black text-rose-950 font-extrabold'
                      : 'bg-[#241318] hover:bg-[#331b22] border-rose-500/50 text-rose-300'
                  }`}
                  title="Finalizar levantamiento y generar archivo .STG (requiere confirmación si está activo)"
                >
                  <Square className="w-3 h-3 fill-current text-rose-400" />
                  <span className="hidden sm:inline">Fin</span>
                </button>

                {/* Roll-Along Button */}
                <button
                  onClick={() => setIsRollAlongOpen(true)}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold min-h-[38px] sm:min-h-[42px] border cursor-pointer btn-tactile hidden xs:flex items-center gap-1 shrink-0 ${
                    isSunlightMode
                      ? 'bg-slate-100 border-black text-black'
                      : 'bg-[#101b2c] border-[#1d2f4a] text-blue-300 hover:bg-[#182840]'
                  }`}
                  title="Avance de Cable Roll-Along"
                >
                  <RefreshCw className="w-3 h-3 text-blue-400" />
                  <span className="hidden sm:inline">Roll-Along</span>
                  <span className="sm:hidden">Roll</span>
                </button>

                {/* QC Report Modal Button */}
                <button
                  onClick={() => setIsReportOpen(true)}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold min-h-[38px] sm:min-h-[42px] border cursor-pointer btn-tactile hidden md:flex items-center gap-1 shrink-0 ${
                    isSunlightMode
                      ? 'bg-emerald-100 border-black text-emerald-950'
                      : 'bg-[#0a201b] border-emerald-500/50 text-emerald-300 hover:bg-[#0e2a24]'
                  }`}
                  title="Certificado de Campaña y Control de Calidad (QC)"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>QC</span>
                </button>

                {/* 8-Channels Drawer Button */}
                {lastBatch.length > 0 && (
                  <button
                    onClick={() => setShowChannelsDrawer(!showChannelsDrawer)}
                    className={`px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold min-h-[38px] sm:min-h-[42px] border cursor-pointer btn-tactile flex items-center gap-1 shrink-0 ${
                      showChannelsDrawer
                        ? 'bg-blue-600 text-white border-blue-400'
                        : isSunlightMode
                        ? 'bg-slate-100 border-black text-black'
                        : 'bg-[#101b2c] border-[#1d2f4a] text-cyan-400'
                    }`}
                    title="Monitor y osciloscopio de 8 canales simultáneos"
                  >
                    <Radio className="w-3 h-3 text-cyan-400" />
                    <span className="hidden sm:inline">Monitor 8CH</span>
                    <span className="sm:hidden">8CH</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Inner Scrolling for Alluvial Gold, Setup, Contact Test, Files, and AI tabs */}
        {activeTab !== 'survey' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {activeTab === 'alluvial' && (
              <AlluvialGoldView
                points={points}
                totalElectrodes={config.electrodes}
                spacing={config.spacing}
                isSunlightMode={isSunlightMode}
                jobName={config.jobName}
              />
            )}
            {activeTab === 'contact' && (
              <ContactTestView
                isConnected={instrument.connected}
                contactSummary={contactSummary}
                onRunContactTest={handleRunContactTest}
                onUpdateContactSummary={(newSummary) => {
                  setContactSummary(newSummary);
                  if (newSummary.badElectrodes?.length === 0) {
                    beeper.playCompletionChirp();
                    showToast('✓ Contactos corregidos: 0 electrodos críticos. Inyección desbloqueada.', 'success');
                  }
                }}
                onGoToSurvey={() => setActiveTab('survey')}
                isLoadingContact={isLoadingContact}
                isSunlightMode={isSunlightMode}
              />
            )}
            {activeTab === 'config' && (
              <SurveyConfigView
                config={config}
                onSaveConfig={handleSaveConfig}
                onStartSurveyAfterConfig={() => {
                  setActiveTab('survey');
                  requestStartSurvey();
                }}
                isConnected={instrument.connected}
                isSunlightMode={isSunlightMode}
                contactSummary={contactSummary}
                isTxArmed={isTxArmed}
                onGoToContactTest={() => setActiveTab('contact')}
                isRunning={isRunning}
              />
            )}
            {activeTab === 'files' && <FilesView isSunlightMode={isSunlightMode} />}
            {activeTab === 'ai' && (
              <AIAssistantView
                surveyConfig={config}
                pointsCount={points.length}
                contactSummary={contactSummary}
                points={points}
                isSunlightMode={isSunlightMode}
                acceptedDrillholes={acceptedDrillholes}
                onAcceptedDrillholesChange={(drills) => setAcceptedDrillholes(drills)}
              />
            )}
          </div>
        )}
      </div>

      {/* 3. Docked Bottom App Navigation Dock (Ergonomic 48px / Touch targets for field gloves) */}
      <nav
        className={`h-12 px-1 sm:px-2 flex items-center justify-around border-t shrink-0 z-30 shadow-lg ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b13] border-[#152338] text-[#8ca4c3]'
        }`}
      >
        <button
          onClick={() => setActiveTab('survey')}
          className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[48px] text-[9px] xs:text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer relative px-0.5 ${
            activeTab === 'survey'
              ? isSunlightMode
                ? 'text-black bg-amber-200 border-t-2 border-black font-black'
                : 'text-sky-400 bg-sky-500/10 border-t-2 border-sky-400 font-extrabold'
              : isSunlightMode
              ? 'text-black hover:bg-slate-100'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span className="truncate w-full text-center">Adquisición</span>
        </button>

        <button
          onClick={() => setActiveTab('alluvial')}
          className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[48px] text-[9px] xs:text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer relative px-0.5 ${
            activeTab === 'alluvial'
              ? isSunlightMode
                ? 'text-black bg-amber-200 border-t-2 border-black font-black'
                : 'text-amber-400 bg-amber-500/15 border-t-2 border-amber-400 font-extrabold'
              : isSunlightMode
              ? 'text-black hover:bg-slate-100'
              : 'opacity-70 hover:opacity-100 text-amber-300/80 hover:text-amber-300'
          }`}
        >
          <Pickaxe className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="truncate w-full text-center">Oro Aluvial</span>
        </button>

        <button
          onClick={() => setActiveTab('contact')}
          className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[48px] text-[9px] xs:text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer relative px-0.5 ${
            activeTab === 'contact'
              ? isSunlightMode
                ? 'text-black bg-amber-200 border-t-2 border-black font-black'
                : 'text-emerald-400 bg-emerald-500/10 border-t-2 border-emerald-400 font-extrabold'
              : isSunlightMode
              ? 'text-black hover:bg-slate-100'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span className="truncate w-full text-center">QC Picas</span>
          {contactSummary?.badElectrodes?.length > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[48px] text-[9px] xs:text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer relative px-0.5 ${
            activeTab === 'config'
              ? isSunlightMode
                ? 'text-black bg-amber-200 border-t-2 border-black font-black'
                : 'text-purple-400 bg-purple-500/10 border-t-2 border-purple-400 font-extrabold'
              : isSunlightMode
              ? 'text-black hover:bg-slate-100'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span className="truncate w-full text-center">Tendido</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[48px] text-[9px] xs:text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer relative px-0.5 ${
            activeTab === 'files'
              ? isSunlightMode
                ? 'text-black bg-amber-200 border-t-2 border-black font-black'
                : 'text-amber-400 bg-amber-500/10 border-t-2 border-amber-400 font-extrabold'
              : isSunlightMode
              ? 'text-black hover:bg-slate-100'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <FolderArchive className="w-4 h-4 shrink-0" />
          <span className="truncate w-full text-center">Archivos</span>
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full min-h-[48px] text-[9px] xs:text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer relative px-0.5 ${
            activeTab === 'ai'
              ? isSunlightMode
                ? 'text-black bg-amber-200 border-t-2 border-black font-black'
                : 'text-indigo-400 bg-indigo-500/10 border-t-2 border-indigo-400 font-extrabold'
              : isSunlightMode
              ? 'text-black hover:bg-slate-100'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span className="truncate w-full text-center">IA Minera</span>
        </button>
      </nav>

      {/* Floating 8-Channel Oscilloscope Drawer Modal */}
      {showChannelsDrawer && lastBatch.length > 0 && (
        <div className="fixed inset-x-2 bottom-14 z-50 p-3 rounded-2xl border shadow-2xl bg-[#09111d] border-blue-500/40 text-white max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between border-b pb-1.5 mb-2 font-mono text-xs">
            <span className="font-bold flex items-center gap-1.5 text-cyan-400">
              <Radio className="w-4 h-4" />
              Lectura Simultánea 8 Canales (A={lastBatch[0]?.p[0]} B={lastBatch[0]?.p[1]} · {lastBatch[0]?.i} mA)
            </span>
            <button onClick={() => setShowChannelsDrawer(false)} className="p-1 hover:bg-slate-800 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
            {lastBatch.map((pt, idx) => (
              <div key={pt.id} className="p-2 rounded bg-[#0f1b2d] border border-[#1b2b41]">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-cyan-400 font-bold">CH{idx + 1}</span>
                  <span className={pt.err > 2 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{pt.err}%</span>
                </div>
                <div className="text-[11px] font-bold text-amber-300">{pt.rho} Ω·m</div>
                <div className="text-[9px] opacity-75">{pt.v} mV · {pt.p[2]}-{pt.p[3]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roll-Along Modal */}
      <RollAlongModal
        isOpen={isRollAlongOpen}
        onClose={() => setIsRollAlongOpen(false)}
        currentElectrodes={config.electrodes}
        spacing={config.spacing}
        currentJobName={config.jobName}
        isSunlightMode={isSunlightMode}
        onApplyRollAlong={handleApplyRollAlong}
      />

      {/* Field Notes Modal */}
      <FieldNotesModal
        isOpen={isFieldNotesOpen}
        onClose={() => setIsFieldNotesOpen(false)}
        notes={fieldNotes}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        isSunlightMode={isSunlightMode}
        totalElectrodes={config.electrodes}
      />

      {/* QC & Exploration Campaign Certificate Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        config={config}
        points={points}
        contactSummary={contactSummary}
        instrument={instrument}
        isSunlightMode={isSunlightMode}
      />

      {/* Survey Finalized Modal */}
      <SurveyFinalizedModal
        isOpen={isFinalizedModalOpen}
        onClose={() => setIsFinalizedModalOpen(false)}
        config={config}
        points={points}
        currentIndex={currentIndex}
        totalPoints={totalPoints}
        isSunlightMode={isSunlightMode}
        onOpenQCReport={() => setIsReportOpen(true)}
        onGoToFiles={() => setActiveTab('files')}
      />

      {/* High-Voltage Transmitter Arming Interlock Modal */}
      {showArmTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-colors font-sans flex flex-col gap-4 ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0c1424] border-amber-500/50 text-white shadow-amber-950/40 ring-1 ring-amber-500/20'
            }`}
          >
            <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-amber-400 tracking-tight">
                    ENCLAVAMIENTO DE SEGURIDAD
                  </h3>
                  <span className="text-[10px] font-mono text-slate-300">
                    Transmisor SuperSting R8 · Hasta 800 Vp-p
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowArmTxModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-2 leading-relaxed text-slate-200">
              <p className="font-semibold text-amber-300">
                ⚠️ ADVERTENCIA: La inyección de corriente eléctrica en tomografía genera tensiones de hasta 800 V pico a pico con riesgo de descarga.
              </p>
              <div className="p-3 rounded-lg bg-black/40 border border-amber-500/20 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Personal de cuadrilla alejado del tendido de cable</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Resistencia de contacto verificada (&lt; 5.0 kΩ según AGI)</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Sin personas ni ganado en contacto con las picas</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setShowArmTxModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-600 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar (Seguro 0V)
              </button>
              <button
                type="button"
                onClick={handleArmAndStart}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black border border-amber-300 shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>ARMAR TX Y DISPARAR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Survey Active Confirmation Modal */}
      {showConfirmStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-colors font-sans flex flex-col gap-4 ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#140e16] border-rose-500/50 text-white shadow-rose-950/40 ring-1 ring-rose-500/20'
            }`}
          >
            <div className="flex items-center justify-between border-b border-rose-500/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-rose-400 tracking-tight">
                    ¿Finalizar Adquisición Incompleta?
                  </h3>
                  <span className="text-[10px] font-mono text-slate-300">
                    Línea {config.jobName} · {currentIndex} de {totalPoints} lecturas ({progressPct}%)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmStopModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-200">
              Se interrumpirá la secuencia de medición multicanal. El transmisor se apagará inmediatamente y se cerrará el archivo <strong className="font-mono text-cyan-300">{config.jobName}.stg</strong> con los datos adquiridos hasta este momento.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setShowConfirmStopModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-600 hover:bg-slate-800 cursor-pointer"
              >
                Continuar Levantamiento
              </button>
              <button
                type="button"
                onClick={executeStopSurvey}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Confirmar y Finalizar .STG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QC Remeasure (Restacking) Threshold Selection Modal */}
      {showRemeasureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-colors font-sans flex flex-col gap-4 ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#14120e] border-amber-500/50 text-white shadow-amber-950/40 ring-1 ring-amber-500/20'
            }`}
          >
            <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-amber-400 tracking-tight">
                    QC · Remedición de Puntos
                  </h3>
                  <span className="text-[10px] font-mono text-slate-300">
                    Restacking SuperSting R8/IP (+4 ciclos)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowRemeasureModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              La remedición inyecta corriente nuevamente y suma 4 ciclos adicionales de stack a los cuadripolos con dispersión superior al umbral para reducir el error de repetibilidad.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-200 uppercase tracking-wider block">
                Seleccione Umbral de Error Máximo Admisible:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: 1.0, label: '> 1.0%', desc: 'Alta Precisión' },
                  { val: 1.5, label: '> 1.5%', desc: 'Tolerancia Fina' },
                  { val: 2.0, label: '> 2.0%', desc: 'Estándar AGI' },
                  { val: 3.0, label: '> 3.0%', desc: 'Sólo Críticos' },
                ].map((opt) => {
                  const isSelected = remeasureThreshold === opt.val;
                  const matchingCount = points.slice(0, Math.max(currentIndex, points.length)).filter((p) => p.err > opt.val).length;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setRemeasureThreshold(opt.val)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-0.5 ${
                        isSelected
                          ? isSunlightMode
                            ? 'bg-amber-100 border-black ring-2 ring-black font-bold'
                            : 'bg-amber-500/20 border-amber-400 ring-1 ring-amber-400 text-amber-200'
                          : isSunlightMode
                          ? 'bg-slate-100 border-slate-300 hover:border-black'
                          : 'bg-[#1a1712] border-slate-700/80 hover:border-slate-500 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-xs font-mono">{opt.label}</strong>
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-black/40 text-cyan-300">
                          {matchingCount} ptos
                        </span>
                      </div>
                      <span className="text-[10px] opacity-75">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 text-[11px] font-mono flex items-center justify-between">
              <span className="text-slate-400">Puntos a re-apilar (restack):</span>
              <strong className="text-amber-400 text-xs">
                {points.slice(0, Math.max(currentIndex, points.length)).filter((p) => p.err > remeasureThreshold).length} de {Math.max(currentIndex, points.length)}
              </strong>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setShowRemeasureModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-600 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRemeasureModal(false);
                  handleRemeasure(remeasureThreshold);
                }}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black border border-amber-300 shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ejecutar Remedición</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

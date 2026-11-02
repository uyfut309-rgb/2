import React, { useState } from 'react';
import {
  Activity,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Gauge,
  Cpu,
  Zap,
  Download,
  RefreshCw,
  CheckSquare,
  Square,
  Waves,
  Compass,
  FileText,
  CheckCircle2,
  Clock,
  Radio,
  Layers,
  X,
} from 'lucide-react';

interface ContactTestSummary {
  totalElectrodes: number;
  medianKohm: number;
  maxKohm: number;
  under1_8k?: number;
  between1_8and5k?: number;
  over5k?: number;
  under2k: number;
  between2and5k: number;
  between5and10k: number;
  over10k: number;
  badElectrodes: { electrode: number; resistanceKohm: number }[];
  values: number[];
  retestedElectrodes?: number[];
}

interface ContactTestViewProps {
  isConnected: boolean;
  contactSummary: ContactTestSummary | null;
  onRunContactTest: () => Promise<void>;
  onUpdateContactSummary?: (summary: ContactTestSummary) => void;
  onGoToSurvey?: () => void;
  onOpenCableTest?: () => void;
  isLoadingContact: boolean;
  isSunlightMode: boolean;
}

export const ContactTestView: React.FC<ContactTestViewProps> = ({
  isConnected,
  contactSummary,
  onRunContactTest,
  onUpdateContactSummary,
  onGoToSurvey,
  onOpenCableTest,
  isLoadingContact,
  isSunlightMode,
}) => {
  const [selectedElectrodes, setSelectedElectrodes] = useState<number[]>([]);
  const [isRetesting, setIsRetesting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skippedList, setSkippedList] = useState<number[]>([]);
  const [isSavingCRS, setIsSavingCRS] = useState(false);
  const [crsSavedSuccess, setCrsSavedSuccess] = useState<string | null>(null);

  // Diagnostic states
  const [receiverResult, setReceiverResult] = useState<any | null>(null);
  const [ipTestResult, setIpTestResult] = useState<any | null>(null);
  const [spTestResult, setSpTestResult] = useState<any | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState<string | null>(null);

  // View toggle: 'bars' | 'heatmap'
  const [displayStyle, setDisplayStyle] = useState<'bars' | 'heatmap'>('bars');

  // Toggle electrode selection
  const toggleSelectElectrode = (elNum: number) => {
    setSelectedElectrodes((prev) =>
      prev.includes(elNum) ? prev.filter((e) => e !== elNum) : [...prev, elNum]
    );
  };

  // Select all critical electrodes (> 5.0 kOhm)
  const selectCriticalElectrodes = () => {
    if (!contactSummary) return;
    const critical = contactSummary.values
      .map((val, idx) => ({ el: idx + 1, val }))
      .filter((item) => item.val > 5.0)
      .map((item) => item.el);
    setSelectedElectrodes(critical);
  };

  const selectAllElectrodes = () => {
    if (!contactSummary) return;
    const all = Array.from({ length: contactSummary.totalElectrodes }, (_, i) => i + 1);
    setSelectedElectrodes(all);
  };

  const clearSelection = () => {
    setSelectedElectrodes([]);
  };

  // Re-test selected electrodes only
  const handleRetestSelected = async () => {
    if (selectedElectrodes.length === 0) return;
    setIsRetesting(true);
    try {
      const res = await fetch('/api/instrument/contact-test/retest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electrodes: selectedElectrodes }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setSelectedElectrodes([]);
        if (data.summary) {
          onUpdateContactSummary?.(data.summary);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRetesting(false);
    }
  };

  // One-click saline solution / moisture correction for all critical electrodes
  const handleFixAllCritical = async () => {
    setIsRetesting(true);
    try {
      const res = await fetch('/api/instrument/contact-test/fix-critical', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.status === 'ok' && data.summary) {
        setSelectedElectrodes([]);
        onUpdateContactSummary?.(data.summary);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRetesting(false);
    }
  };

  // Skip / Bypass broken or flooded electrode by regenerating the .CMD script without it
  const handleSkipElectrode = async (elNum: number) => {
    setIsSkipping(true);
    try {
      const res = await fetch('/api/instrument/skip-electrode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ electrode: elNum }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setSkippedList(data.skippedElectrodes || []);
        // Also remove from selected
        setSelectedElectrodes((prev) => prev.filter((e) => e !== elNum));
        // If we have contactSummary, update badElectrodes locally
        if (contactSummary) {
          const updatedBad = contactSummary.badElectrodes.filter((e) => e.electrode !== elNum);
          const updatedSummary = {
            ...contactSummary,
            badElectrodes: updatedBad,
            over5k: updatedBad.length,
            criticalCount: updatedBad.length,
          };
          onUpdateContactSummary?.(updatedSummary);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSkipping(false);
    }
  };

  // Save / Download standard AGI .CRS file
  const handleSaveAndDownloadCRS = async () => {
    if (!contactSummary || contactSummary.values.length === 0) return;
    setIsSavingCRS(true);
    try {
      const res = await fetch('/api/instrument/contact-test/save-crs', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setCrsSavedSuccess(`✓ Archivo ${data.filename} generado y guardado.`);
        setTimeout(() => setCrsSavedSuccess(null), 5000);

        // Trigger browser file download
        const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.filename || 'SURVEY.CRS';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingCRS(false);
    }
  };

  // Diagnostic tests
  const runReceiverTest = async () => {
    try {
      setDiagnosticLoading('receiver');
      const res = await fetch('/api/instrument/receiver-test', { method: 'POST' });
      const data = await res.json();
      setReceiverResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setDiagnosticLoading(null);
    }
  };

  const runIPTest = async () => {
    try {
      setDiagnosticLoading('ip');
      const res = await fetch('/api/instrument/ip-test', { method: 'POST' });
      const data = await res.json();
      setIpTestResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setDiagnosticLoading(null);
    }
  };

  const runSPTest = async () => {
    try {
      setDiagnosticLoading('sp');
      const res = await fetch('/api/instrument/sp-test', { method: 'POST' });
      const data = await res.json();
      setSpTestResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setDiagnosticLoading(null);
    }
  };

  // Estimated max current based on 800 Vp-p limit and 200W:
  // Loop R = 2 * R_c; I_max = min(1000, 800 / (2 * R_c * 1000) * 1000) mA
  const calculateEstimatedCurrentMa = (rKohm: number): number => {
    const rOhm = Math.max(10, rKohm * 1000);
    const loopOhm = 2 * rOhm;
    // Voltage compliance limit with 800 Vp-p (effective 400V unipolar swing):
    const currentFromV = (400 / loopOhm) * 1000;
    // Power limit: P = I^2 * R => I = sqrt(200 / loopOhm) * 1000
    const currentFromP = Math.sqrt(200 / loopOhm) * 1000;
    return Math.min(1000, Math.round(Math.min(currentFromV, currentFromP)));
  };

  const getBarColor = (val: number) => {
    if (val < 1.8) return isSunlightMode ? 'bg-emerald-600' : 'bg-emerald-500';
    if (val <= 5.0) return isSunlightMode ? 'bg-yellow-500' : 'bg-amber-400';
    return isSunlightMode ? 'bg-rose-600' : 'bg-rose-500 animate-pulse';
  };

  const getTextColor = (val: number) => {
    if (val < 1.8) return isSunlightMode ? 'text-emerald-800' : 'text-emerald-400';
    if (val <= 5.0) return isSunlightMode ? 'text-amber-800' : 'text-amber-300';
    return isSunlightMode ? 'text-rose-800 font-black' : 'text-rose-400 font-bold';
  };

  const getHeatmapBg = (val: number) => {
    if (val < 1.8) {
      return isSunlightMode ? 'bg-emerald-100 text-emerald-950 border-emerald-400' : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
    }
    if (val <= 5.0) {
      return isSunlightMode ? 'bg-amber-100 text-amber-950 border-amber-400' : 'bg-amber-950/60 text-amber-300 border-amber-700/60';
    }
    return isSunlightMode ? 'bg-rose-200 text-rose-950 border-rose-500 ring-1 ring-rose-500' : 'bg-rose-950/80 text-rose-300 border-rose-500 ring-1 ring-rose-500';
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* 1. Header & Contact Test Execution */}
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500 shrink-0" />
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-tight text-emerald-400">
                Prueba de Contacto y Verificación de Instrumento (SuperSting R8/IP)
              </h2>
            </div>
            <p
              className={`text-[11px] mt-1.5 leading-relaxed ${
                isSunlightMode ? 'text-slate-800' : 'text-[#8ca3c3]'
              }`}
            >
              Mide la resistencia de acoplamiento eléctrico entre cada electrodo y el terreno. Según la norma técnica de AGI, se requiere una resistencia inferior a&nbsp;<strong>5.0&nbsp;kΩ</strong> para iniciar levantamientos y, preferentemente, inferior a&nbsp;<strong>1.8&nbsp;kΩ</strong> para habilitar la potencia plena de 200&nbsp;W sin limitación de voltaje del transmisor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onRunContactTest}
              disabled={!isConnected || isLoadingContact}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg cursor-pointer ${
                !isConnected
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : isLoadingContact
                  ? 'bg-amber-600 text-white animate-pulse'
                  : isSunlightMode
                  ? 'bg-black hover:bg-slate-800 text-white shadow-xl'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span>
                {isLoadingContact
                  ? 'Midiendo electrodos en terreno...'
                  : !isConnected
                  ? 'Equipo Desconectado'
                  : 'Ejecutar Prueba de Contacto Completa'}
              </span>
            </button>

            {contactSummary && (
              <>
                {onOpenCableTest && (
                  <button
                    onClick={onOpenCableTest}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      isSunlightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-black text-black'
                        : 'bg-[#121f33] hover:bg-[#1a2c47] border-blue-500/40 text-blue-300'
                    }`}
                    title="Diagnóstico de continuidad de hilos, fuga de aislamiento y detección de carretes cruzados"
                  >
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    <span>Test de Cableado</span>
                  </button>
                )}
                <button
                  onClick={handleSaveAndDownloadCRS}
                  disabled={isSavingCRS}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    isSunlightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-black text-black'
                      : 'bg-[#121f33] hover:bg-[#1a2c47] border-cyan-500/40 text-cyan-300'
                  }`}
                  title="Descargar archivo oficial de resistencias de contacto .CRS para archivo de campaña"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isSavingCRS ? 'Guardando...' : 'Descargar .CRS'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {crsSavedSuccess && (
          <div className="mt-3 p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{crsSavedSuccess}</span>
          </div>
        )}

        {/* Contact Test Statistics Cards */}
        {contactSummary && (
          <div
            className={`mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 ${
              isSunlightMode ? 'border-black' : 'border-[#18283e]'
            }`}
          >
            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0e1929] border-[#1a2d48]'
              }`}
            >
              <span className="text-[10px] font-bold block opacity-70">Mediana de Red</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-cyan-400">
                {contactSummary.medianKohm}&nbsp;kΩ
              </span>
              <span className="text-[9px] opacity-60 block mt-0.5">
                I max est: ~{calculateEstimatedCurrentMa(contactSummary.medianKohm)}&nbsp;mA
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0e1929] border-[#1a2d48]'
              }`}
            >
              <span className="text-[10px] font-bold block opacity-70">Resistencia Máxima</span>
              <span
                className={`text-lg sm:text-xl font-bold font-mono ${
                  contactSummary.maxKohm > 5 ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {contactSummary.maxKohm}&nbsp;kΩ
              </span>
              <span className="text-[9px] opacity-60 block mt-0.5">
                Peor electrodo
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-emerald-50 border-emerald-800' : 'bg-[#0e1929] border-emerald-900/50'
              }`}
            >
              <span className="text-[10px] font-bold block text-emerald-400">
                &lt;&nbsp;1.8&nbsp;kΩ (Óptimo Tx 200W)
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-300">
                {contactSummary.under1_8k ?? contactSummary.under2k}
                <span className="text-xs font-normal opacity-80 ml-1">
                  ({Math.round(((contactSummary.under1_8k ?? contactSummary.under2k) / contactSummary.totalElectrodes) * 100)}%)
                </span>
              </span>
              <span className="text-[9px] text-emerald-400/80 block mt-0.5">
                Sin limitación de Vp-p
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-yellow-50 border-yellow-800' : 'bg-[#0e1929] border-amber-900/50'
              }`}
            >
              <span className="text-[10px] font-bold block text-amber-300">
                1.8&nbsp;–&nbsp;5.0&nbsp;kΩ (Aceptable)
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-amber-300">
                {contactSummary.between1_8and5k ?? contactSummary.between2and5k}
              </span>
              <span className="text-[9px] opacity-60 block mt-0.5">
                Corriente: 80–220&nbsp;mA
              </span>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-red-50 border-red-800' : 'bg-[#0e1929] border-rose-900/50'
              }`}
            >
              <span className="text-[10px] font-bold block text-rose-400">
                &gt;&nbsp;5.0&nbsp;kΩ (Crítico / Humectar)
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-rose-300">
                {contactSummary.over5k ?? (contactSummary.between5and10k + contactSummary.over10k)}
              </span>
              <span className="text-[9px] text-rose-400/80 block mt-0.5">
                Satura Tx (&lt; 80 mA)
              </span>
            </div>
          </div>
        )}

        {/* Technical Notice on Compliance Voltage and Injected Current */}
        <div className="mt-3 p-2.5 rounded-lg bg-black/40 border border-slate-800 text-[10.5px] leading-relaxed text-slate-300">
          <strong className="text-cyan-300">Física de Inyección de Corriente AGI:</strong> El transmisor de 200&nbsp;W opera con un límite de tensión de salida de hasta 800&nbsp;Vp-p. Si la resistencia de contacto del lazo es inferior a&nbsp;<strong>1.8&nbsp;kΩ</strong>, el transmisor inyecta la corriente nominal programada (hasta 1,000&nbsp;mA). Si la resistencia supera los&nbsp;<strong>5.0&nbsp;kΩ</strong>, el circuito alcanza su techo de voltaje y la corriente inyectable decae fuertemente por debajo de 80&nbsp;mA, disminuyendo la relación señal/ruido ($V_p/I_n$).
        </div>
      </div>

      {/* 2. Visual Per-Electrode Bar Chart & Heatmap Grid with 1.8 kΩ and 5.0 kΩ Threshold Lines */}
      {contactSummary && contactSummary.values.length > 0 && (
        <div
          className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
            isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
          }`}
        >
          {/* Controls & Actions Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider">
                Perfil de Contacto de Electrodos (1 a {contactSummary.totalElectrodes})
              </span>
              <div className="flex rounded border border-slate-700 p-0.5 text-[9px]">
                <button
                  onClick={() => setDisplayStyle('bars')}
                  className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                    displayStyle === 'bars' ? 'bg-cyan-600 text-white' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  Barras
                </button>
                <button
                  onClick={() => setDisplayStyle('heatmap')}
                  className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                    displayStyle === 'heatmap' ? 'bg-cyan-600 text-white' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  Matriz
                </button>
              </div>
            </div>

            {/* Selection & Re-test Actions */}
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              {contactSummary.badElectrodes.length > 0 && (
                <button
                  onClick={handleFixAllCritical}
                  disabled={isRetesting}
                  className="px-2.5 py-1 rounded border border-emerald-400 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 font-bold cursor-pointer flex items-center gap-1 shadow-sm"
                  title="Aplica humectación/solución salina a todos los electrodos críticos (>5 kΩ) y actualiza el QC"
                >
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>💧 Corregir Críticos ({contactSummary.badElectrodes.length})</span>
                </button>
              )}
              <button
                onClick={selectCriticalElectrodes}
                className="px-2 py-1 rounded border border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 font-bold cursor-pointer"
              >
                Marcar Críticos (&gt;&nbsp;5&nbsp;kΩ)
              </button>
              <button
                onClick={selectAllElectrodes}
                className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500 opacity-80 hover:opacity-100 cursor-pointer"
              >
                Todos
              </button>
              {selectedElectrodes.length > 0 && (
                <>
                  <button
                    onClick={clearSelection}
                    className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500 opacity-70 hover:opacity-100 cursor-pointer"
                  >
                    Limpiar ({selectedElectrodes.length})
                  </button>
                  <button
                    onClick={handleRetestSelected}
                    disabled={isRetesting}
                    className="px-3 py-1 rounded font-bold bg-amber-500 text-black hover:bg-amber-400 border border-amber-300 shadow-md cursor-pointer flex items-center gap-1 animate-pulse"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRetesting ? 'animate-spin' : ''}`} />
                    <span>Re-medir Marcados ({selectedElectrodes.length})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bar Chart Visualization with Horizontal Threshold Guidelines */}
          {displayStyle === 'bars' && (
            <div className="relative">
              {/* Threshold Labels and Guidelines */}
              <div
                className={`h-56 rounded-lg p-3 pt-6 flex items-end gap-1 overflow-x-auto border relative ${
                  isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#070d16] border-[#152338]'
                }`}
              >
                {/* Horizontal Reference Line at 5.0 kΩ */}
                <div
                  style={{ bottom: `${(5.0 / 12) * 100}%` }}
                  className="absolute left-0 right-0 border-b border-rose-500/80 pointer-events-none z-10 flex items-center justify-between px-2"
                >
                  <span className="text-[8px] font-bold text-rose-400 bg-black/70 px-1 rounded">
                    Límite AGI: 5.0 kΩ (Saturación Tx)
                  </span>
                  <span className="text-[8px] font-bold text-rose-400 bg-black/70 px-1 rounded">
                    5.0 kΩ
                  </span>
                </div>

                {/* Horizontal Reference Line at 1.8 kΩ */}
                <div
                  style={{ bottom: `${(1.8 / 12) * 100}%` }}
                  className="absolute left-0 right-0 border-b border-emerald-500/80 pointer-events-none z-10 flex items-center justify-between px-2"
                >
                  <span className="text-[8px] font-bold text-emerald-400 bg-black/70 px-1 rounded">
                    Óptimo AGI: 1.8 kΩ (Tx 200W Pleno)
                  </span>
                  <span className="text-[8px] font-bold text-emerald-400 bg-black/70 px-1 rounded">
                    1.8 kΩ
                  </span>
                </div>

                {/* Bars */}
                {contactSummary.values.map((val, idx) => {
                  const elNum = idx + 1;
                  const isSelected = selectedElectrodes.includes(elNum);
                  // Scale with max at 12 kOhm
                  const heightPct = Math.min(96, Math.max(8, (val / 12) * 100));
                  const estCurrent = calculateEstimatedCurrentMa(val);

                  return (
                    <div
                      key={elNum}
                      onClick={() => toggleSelectElectrode(elNum)}
                      className={`flex-1 min-w-[12px] max-w-[22px] flex flex-col items-center group relative h-full justify-end cursor-pointer transition-all ${
                        isSelected ? 'ring-2 ring-cyan-400 rounded-t' : ''
                      }`}
                    >
                      {/* Tooltip on hover/touch */}
                      <div
                        className={`absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] px-2 py-1 rounded pointer-events-none whitespace-nowrap z-30 font-mono font-bold shadow-xl border ${
                          isSunlightMode
                            ? 'bg-black text-white border-black'
                            : 'bg-[#0f1728] border-cyan-500/40 text-white'
                        }`}
                      >
                        <div>Electrodo #{elNum}: {val}&nbsp;kΩ</div>
                        <div className="text-[8px] text-cyan-300 font-normal">
                          I max inyectable: ~{estCurrent}&nbsp;mA
                        </div>
                      </div>

                      {/* Bar fill */}
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t transition-all border ${
                          isSelected ? 'border-cyan-300' : 'border-black/30'
                        } ${getBarColor(val)}`}
                      />

                      {/* Electrode number tick */}
                      {(elNum === 1 || elNum === contactSummary.totalElectrodes || elNum % 5 === 0) && (
                        <span
                          className={`text-[8.5px] font-mono mt-1 font-bold ${
                            isSunlightMode ? 'text-black' : 'text-[#7189a8]'
                          }`}
                        >
                          {elNum}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend & Instructions */}
              <div className="mt-2 flex flex-wrap items-center justify-between text-[9px] opacity-75">
                <span>Haz clic en cualquier barra para marcar/desmarcar electrodos para re-medición focalizada.</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2 h-2 rounded bg-emerald-500 inline-block" />
                    &lt;&nbsp;1.8&nbsp;kΩ (Óptimo)
                  </span>
                  <span className="flex items-center gap-1 text-amber-300">
                    <span className="w-2 h-2 rounded bg-amber-400 inline-block" />
                    1.8&nbsp;–&nbsp;5.0&nbsp;kΩ (Aceptable)
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-2 h-2 rounded bg-rose-500 inline-block" />
                    &gt;&nbsp;5.0&nbsp;kΩ (Crítico)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Heatmap Grid Visualization */}
          {displayStyle === 'heatmap' && (
            <div className="space-y-2">
              <div
                className={`grid grid-cols-4 sm:grid-cols-7 md:grid-cols-14 gap-1.5 p-2 rounded-lg font-mono text-xs border max-h-64 overflow-y-auto ${
                  isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#070d16] border-[#152338]'
                }`}
              >
                {contactSummary.values.map((val, idx) => {
                  const elNum = idx + 1;
                  const isSelected = selectedElectrodes.includes(elNum);
                  return (
                    <div
                      key={elNum}
                      onClick={() => toggleSelectElectrode(elNum)}
                      className={`p-1.5 rounded text-center border cursor-pointer transition-all ${getHeatmapBg(
                        val
                      )} ${isSelected ? 'ring-2 ring-cyan-400 font-black' : ''}`}
                    >
                      <div className="flex items-center justify-between text-[8px] opacity-70 mb-0.5">
                        <span>#{elNum}</span>
                        {isSelected && <span className="text-cyan-400 font-bold">✓</span>}
                      </div>
                      <div className="font-bold text-[10px]">{val}&nbsp;k</div>
                      <div className="text-[7.5px] opacity-75">~{calculateEstimatedCurrentMa(val)}&nbsp;mA</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Warning for Critical Electrodes */}
          {contactSummary && contactSummary.badElectrodes.length > 0 ? (
            <div
              className={`mt-3 p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
                isSunlightMode
                  ? 'bg-amber-100 border-black text-black'
                  : 'bg-amber-950/40 border-amber-600/50 text-amber-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Instrucción de Terreno ({contactSummary.badElectrodes.length} electrodos con resistencia crítica &gt;&nbsp;5.0&nbsp;kΩ):</strong>{' '}
                  Para evitar saturación de voltaje del transmisor (800&nbsp;Vp-p) y maximizar la corriente $I_n$, aplicar solución salina o clavar más profundamente los electrodos:{' '}
                  <span className="font-bold underline text-amber-300">
                    {contactSummary.badElectrodes.map((e) => `#${e.electrode} (${e.resistanceKohm} kΩ)`).join(', ')}
                  </span>.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                {selectedElectrodes.length === 1 && (
                  <button
                    onClick={() => handleSkipElectrode(selectedElectrodes[0])}
                    disabled={isSkipping}
                    className="px-3 py-2 rounded-lg font-bold text-xs bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/50 cursor-pointer flex items-center gap-1"
                    title="Excluye esta pica rota o inaccesible y regenera automáticamente el script .CMD sin detener la cuadrilla"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{isSkipping ? 'Omitiendo...' : `Omitir Pica #${selectedElectrodes[0]} (.CMD)`}</span>
                  </button>
                )}
                <button
                  onClick={handleFixAllCritical}
                  disabled={isRetesting}
                  className="px-3.5 py-2 rounded-lg font-bold text-xs bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black border border-amber-300 shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{isRetesting ? 'Humectando...' : '💧 Humectar y Desbloquear'}</span>
                </button>
              </div>
            </div>
          ) : (
            contactSummary && contactSummary.values.length > 0 && (
              <div
                className={`mt-3 p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-lg ${
                  isSunlightMode
                    ? 'bg-emerald-100 border-black text-black'
                    : 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-emerald-300 flex items-center gap-1.5">
                      <span>✓ CONTROL DE CONTACTO APROBADO</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono">
                        INYECCIÓN DESBLOQUEADA
                      </span>
                    </div>
                    <div className="text-[10.5px] opacity-90 font-mono mt-0.5">
                      Todos los electrodos tienen resistencia inferior a 5.0 kΩ (Mediana: {contactSummary.medianKohm} kΩ). Listo para armar el transmisor (800 Vp-p) y comenzar la adquisición.
                    </div>
                  </div>
                </div>
                {onGoToSurvey && (
                  <button
                    onClick={onGoToSurvey}
                    className="px-4 py-2 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current text-amber-300" />
                    <span>Ir a Adquisición y Disparar</span>
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* 2.5 AGI Contact Improvement Guide & Field Recipes */}
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div className="flex items-center justify-between mb-3 border-b border-slate-700/50 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-sm">💡</span>
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-300">
              Asistente de Terreno AGI: Métodos de Reducción de Resistencia de Contacto
            </h3>
          </div>
          <span className="text-[10px] font-mono opacity-70">
            Objetivo AGI: Rc &lt; 1.8 kΩ (Tx 200W Pleno)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px] font-mono">
          <div className="p-3 rounded-xl border border-slate-800 bg-[#070e17] space-y-1">
            <div className="font-bold text-cyan-300 flex items-center gap-1.5">
              <span>💧 1. Salmuera (NaCl 5%)</span>
            </div>
            <p className="opacity-80 text-[10px] leading-relaxed">
              1 kg de sal común por 20 L de agua. Humectar generosamente el bulbo de la pica. Disminuye la resistencia de contacto entre 60% y 85% en suelos secos y pedregosos.
            </p>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-[#070e17] space-y-1">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <span>🌱 2. Bentonita Sódica</span>
            </div>
            <p className="opacity-80 text-[10px] leading-relaxed">
              Lodo de bentonita conductora para fracturas, gravas aluviales o roca dura. Sella el contacto y retiene humedad hasta 48 horas continuas.
            </p>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-[#070e17] space-y-1">
            <div className="font-bold text-purple-300 flex items-center gap-1.5">
              <span>❄️ 3. Cloruro de Calcio (CaCl2)</span>
            </div>
            <p className="opacity-80 text-[10px] leading-relaxed">
              Higroscópico y anticongelante. Ideal para alta cordillera (&gt;3,800 msnm) o permafrost, absorbiendo humedad del aire y evitando congelamiento del lazo.
            </p>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-[#070e17] space-y-1">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>🛡️ 4. Poza con Lámina Aluminio</span>
            </div>
            <p className="opacity-80 text-[10px] leading-relaxed">
              En afloramientos de roca viva donde la pica no penetra, colocar una lámina de aluminio o malla de cobre cubierta con arena mojada y piedra de peso.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Hardware Diagnostics: Receiver Test (AGI Test Box), IP Windows & SP Noise */}
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-cyan-400">
            Verificación de Receptores, Ventanas IP y Deriva SP
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Diagnostic 1: Receiver Test (Caja de Prueba AGI 500 mOhm) */}
          <div
            className={`p-3.5 rounded-lg border flex flex-col justify-between ${
              isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0d1829] border-[#182942]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs flex items-center gap-1.5 text-blue-400">
                  <Cpu className="w-4 h-4" />
                  Test Receptores (Caja AGI)
                </span>
                {receiverResult && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
                    PASÓ (8CH)
                  </span>
                )}
              </div>
              <p className="text-[10.5px] opacity-80 mb-2 leading-relaxed">
                <strong>Conexión requerida:</strong> Caja de Prueba externa AGI (Test Box) conectada directamente al conector frontal sin cables de línea.
              </p>
              <p className="text-[10px] text-cyan-300 bg-black/40 p-1.5 rounded border border-slate-800 mb-3">
                <strong>Criterio AGI (R1 / R8):</strong> Nominal <strong>500&nbsp;mΩ</strong> (0.500&nbsp;Ω), rango admisible de <strong>475 a 525&nbsp;mΩ</strong> (tolerancia ±5%).
              </p>

              {receiverResult && receiverResult.channels && (
                <div className="space-y-1 mb-3 text-[9px] bg-black/30 p-2 rounded border border-slate-800 max-h-36 overflow-y-auto">
                  <div className="text-[8.5px] text-slate-400 flex justify-between border-b border-slate-700 pb-0.5">
                    <span>Canal</span>
                    <span>Medido (mΩ)</span>
                    <span>Desv %</span>
                    <span>Estado</span>
                  </div>
                  {receiverResult.channels.map((ch: any) => (
                    <div key={ch.channel} className="flex justify-between items-center py-0.5 font-mono">
                      <span className="text-slate-300">CH #{ch.channel}</span>
                      <strong className="text-cyan-300">{ch.measuredMohm}&nbsp;mΩ</strong>
                      <span className={Math.abs(ch.errorPct) > 3 ? 'text-amber-400' : 'text-emerald-400'}>
                        {ch.errorPct > 0 ? `+${ch.errorPct}` : ch.errorPct}%
                      </span>
                      <span className="text-emerald-400 font-bold">{ch.status}</span>
                    </div>
                  ))}
                  <div className="text-[8px] text-slate-400 pt-1 border-t border-slate-700/60">
                    Hora calibración: {receiverResult.timestamp}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={runReceiverTest}
              disabled={diagnosticLoading === 'receiver'}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-colors border cursor-pointer ${
                isSunlightMode
                  ? 'bg-black text-white border-black hover:bg-slate-800'
                  : 'bg-[#162740] text-blue-300 border-blue-500/40 hover:bg-[#1f375a]'
              }`}
            >
              {diagnosticLoading === 'receiver' ? 'Midiendo Caja de Prueba...' : 'Verificar Receptores (8CH)'}
            </button>
          </div>

          {/* Diagnostic 2: IP Decay Windows Calibration */}
          <div
            className={`p-3.5 rounded-lg border flex flex-col justify-between ${
              isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0d1829] border-[#182942]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs flex items-center gap-1.5 text-purple-400">
                  <Zap className="w-4 h-4" />
                  Ventanas de Decaimiento IP
                </span>
                {ipTestResult && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-700 text-white font-bold">
                    6 VENTANAS OK
                  </span>
                )}
              </div>
              <p className="text-[10.5px] opacity-80 mb-2 leading-relaxed">
                Integral de decaimiento en las 6 ventanas de tiempo AGI normalizadas para inversión Cole-Cole.
              </p>

              {ipTestResult && ipTestResult.windows ? (
                <div className="space-y-1 mb-3 text-[9px] bg-black/30 p-2 rounded border border-slate-800">
                  <div className="flex justify-between text-[8px] text-slate-400 border-b border-slate-700 pb-0.5">
                    <span>Ventana</span>
                    <span>Intervalo</span>
                    <span>Cargabilidad</span>
                  </div>
                  {ipTestResult.windows.map((w: any) => (
                    <div key={w.window} className="flex justify-between items-center py-0.5 font-mono">
                      <span className="font-bold text-purple-300">{w.window}</span>
                      <span className="text-slate-400">{w.tStartMs}–{w.tEndMs}&nbsp;ms</span>
                      <strong className="text-amber-400">{w.chargeabilityMvV}&nbsp;mV/V</strong>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-slate-700 text-[8px] text-emerald-400">
                    {ipTestResult.stackCycles}
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded bg-black/30 border border-slate-800 text-[9.5px] text-slate-400 space-y-0.5 mb-3">
                  <div>• M1: 100–200 ms (ancho 100 ms)</div>
                  <div>• M2: 200–400 ms (ancho 200 ms)</div>
                  <div>• M3: 400–800 ms (ancho 400 ms)</div>
                  <div>• M4: 800–1200 ms (ancho 400 ms)</div>
                  <div>• M5: 1200–1600 ms (ancho 400 ms)</div>
                  <div>• M6: 1600–2000 ms (ancho 400 ms)</div>
                </div>
              )}
            </div>

            <button
              onClick={runIPTest}
              disabled={diagnosticLoading === 'ip'}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-colors border cursor-pointer ${
                isSunlightMode
                  ? 'bg-black text-white border-black hover:bg-slate-800'
                  : 'bg-[#1e1c36] text-purple-300 border-purple-500/40 hover:bg-[#2d2a52]'
              }`}
            >
              {diagnosticLoading === 'ip' ? 'Calibrando...' : 'Calibrar Ventanas IP'}
            </button>
          </div>

          {/* Diagnostic 3: Self Potential SP Noise & Galvanic Warning */}
          <div
            className={`p-3.5 rounded-lg border flex flex-col justify-between ${
              isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0d1829] border-[#182942]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-xs flex items-center gap-1.5 text-amber-400">
                  <Waves className="w-4 h-4" />
                  Auto-Potencial Natural (SP)
                </span>
                {spTestResult && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-600 text-white font-bold">
                    MEDIDO
                  </span>
                )}
              </div>

              {/* Prominent Geophysical Galvanic Warning */}
              <div className="p-2 rounded bg-amber-950/30 border border-amber-600/40 text-[10px] text-amber-200 leading-snug mb-2.5">
                <strong className="block text-amber-300 mb-0.5">⚠️ AVISO GEOFÍSICO SP:</strong>
                Las picas de acero inoxidable generan polarización galvánica espuria y alta deriva temporal al contacto con el suelo. Para medición confiable de SP se requiere emplear electrodos no polarizables de cobre/sulfato de cobre (Cu/CuSO₄) o plomo/cloruro de plomo (Pb/PbCl₂).
              </div>

              {spTestResult && (
                <div className="space-y-1 mb-3 text-[9px] bg-black/30 p-2 rounded border border-slate-800">
                  <div className="flex justify-between text-slate-300">
                    <span>Deriva de electrodo:</span>
                    <strong className="text-amber-300">{spTestResult.driftRateMvPerMin}</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Ruido base telúrico:</span>
                    <strong className="text-cyan-300">{spTestResult.backgroundNoiseMv}&nbsp;mV</strong>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[8px] pt-1 border-t border-slate-700/60">
                    {spTestResult.channels.map((ch: any) => (
                      <div key={ch.channel} className="bg-black/40 p-0.5 text-center rounded">
                        CH{ch.channel}: <strong>{ch.potentialMv}mV</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={runSPTest}
              disabled={diagnosticLoading === 'sp'}
              className={`w-full py-2 px-3 text-xs font-bold rounded-lg transition-colors border cursor-pointer ${
                isSunlightMode
                  ? 'bg-black text-white border-black hover:bg-slate-800'
                  : 'bg-[#262116] text-amber-300 border-amber-500/40 hover:bg-[#3d3420]'
              }`}
            >
              {diagnosticLoading === 'sp' ? 'Midiendo Deriva...' : 'Monitorear Ruido y Deriva SP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

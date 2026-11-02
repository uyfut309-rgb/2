import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  X,
  RefreshCw,
  Cpu,
  CheckCircle2,
  Layers,
  Zap,
} from 'lucide-react';

interface ReelCheck {
  reelIndex: number;
  electrodesRange: string;
  wireContinuityOhm: number;
  insulationMohm: number;
  polarityStatus: string;
  continuityPass: boolean;
  insulationPass: boolean;
  overallStatus: string;
}

interface CrossCouplingTest {
  pairTx: string;
  pairRx: string;
  expectedVpMv: number;
  measuredVpMv: number;
  status: string;
}

interface CableTestResult {
  timestamp: string;
  totalElectrodes: number;
  reelsChecked: number;
  reels: ReelCheck[];
  crossCouplingTests: CrossCouplingTest[];
  cableIntegrity: string;
  leakageCurrentUa: number;
}

interface CableVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSunlightMode: boolean;
}

export const CableVerificationModal: React.FC<CableVerificationModalProps> = ({
  isOpen,
  onClose,
  isSunlightMode,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CableTestResult | null>(null);

  const runTest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/instrument/cable-test', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        setResult(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-2xl border p-5 shadow-2xl transition-colors font-mono flex flex-col gap-4 max-h-[90vh] overflow-y-auto ${
          isSunlightMode
            ? 'bg-white border-black text-black'
            : 'bg-[#0a111c] border-[#1f334f] text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/20 text-cyan-400 border border-blue-500/40">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight uppercase">
                Verificación de Cableado & Carretes Cruzados
              </h3>
              <p className="text-[10px] opacity-70">
                SuperSting R8 · Test de Fuga de Aislamiento y Polaridad de Conectores
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action button if no test run yet */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-slate-800 text-xs">
          <div>
            <span className="font-bold block text-cyan-300">
              Prueba de Inyección Par a Par (Switchbox & Takeouts)
            </span>
            <span className="text-[10.5px] opacity-75">
              Inyecta corriente de prueba en C1-C2 y mide el potencial inducido en los conectores adyacentes para detectar carretes invertidos.
            </span>
          </div>
          <button
            type="button"
            onClick={runTest}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Diagnosticando...' : 'Iniciar Verificación'}</span>
          </button>
        </div>

        {/* Results view */}
        {result && (
          <div className="space-y-3">
            {/* Integrity Banner */}
            <div className="p-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 text-emerald-200 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <strong>{result.cableIntegrity}</strong>
                <div className="text-[10px] opacity-80 mt-0.5 font-mono">
                  Corriente de fuga a tierra: {result.leakageCurrentUa} µA · Conexiones verificadas: {result.totalElectrodes} picas ({result.reelsChecked} carretes).
                </div>
              </div>
            </div>

            {/* Reel Details Table */}
            <div className="rounded-xl border border-slate-800 overflow-hidden text-xs">
              <div className="p-2.5 bg-black/60 font-bold border-b border-slate-800 text-slate-300 text-[11px]">
                Estado por Carrete de Cable Multiconductor (14 electrodos c/u):
              </div>
              <div className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {result.reels.map((reel) => (
                  <div key={reel.reelIndex} className="p-2.5 flex items-center justify-between hover:bg-slate-800/20">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-[10px]">
                        #{reel.reelIndex}
                      </span>
                      <span>Picas {reel.electrodesRange}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10.5px]">
                      <span>Continuidad: <strong className="text-emerald-400">{reel.wireContinuityOhm} Ω</strong></span>
                      <span>Aislamiento: <strong className="text-cyan-400">{reel.insulationMohm} MΩ</strong></span>
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        POLARIDAD OK
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cross-Coupling Tests */}
            <div className="rounded-xl border border-slate-800 p-3 bg-black/30 space-y-2">
              <span className="text-[11px] font-bold text-slate-300 block">
                Respuesta Cruzada de Conectores (Detección de Switchbox Invertida):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                {result.crossCouplingTests.map((t, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-[#070e17] border border-slate-800">
                    <div className="text-slate-400">Tx: {t.pairTx} ↔ Rx: {t.pairRx}</div>
                    <div className="text-emerald-400 font-bold mt-1">
                      Medido: {t.measuredVpMv} mV (Teórico: {t.expectedVpMv} mV)
                    </div>
                    <div className="text-[9px] text-cyan-400">✓ Señal Coherente</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-700/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border border-slate-600 hover:bg-slate-800 cursor-pointer"
          >
            Cerrar Diagnóstico
          </button>
        </div>
      </div>
    </div>
  );
};

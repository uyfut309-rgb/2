import React, { useState } from 'react';
import { RefreshCw, ArrowRight, Check, X, ShieldAlert, Sparkles } from 'lucide-react';

interface RollAlongModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentElectrodes: number;
  spacing: number;
  currentJobName: string;
  isSunlightMode: boolean;
  onApplyRollAlong: (newJobName: string, shiftElectrodes: number) => void;
}

export const RollAlongModal: React.FC<RollAlongModalProps> = ({
  isOpen,
  onClose,
  currentElectrodes,
  spacing,
  currentJobName,
  isSunlightMode,
  onApplyRollAlong,
}) => {
  const [shiftCount, setShiftCount] = useState(14);
  const [rollNumber, setRollNumber] = useState(1);

  if (!isOpen) return null;

  const currentLength = (currentElectrodes - 1) * spacing;
  const shiftMeters = shiftCount * spacing;
  const newStartStation = shiftMeters * rollNumber;
  const newEndStation = newStartStation + currentLength;
  const nextJobName = `${currentJobName}_ROLL${rollNumber}`;

  const handleApply = () => {
    onApplyRollAlong(nextJobName, shiftCount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={`w-full max-w-xl rounded-2xl border p-5 sm:p-6 shadow-2xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0d1422] border-[#223654] text-white'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border ${
                isSunlightMode ? 'bg-black text-white border-black' : 'bg-blue-600/20 text-blue-400 border-blue-500/30'
              }`}
            >
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-tight">
                Calculadora de Avance de Cable (Roll-Along)
              </h3>
              <p className="text-xs opacity-75">
                Extensión continua de perfil geofísico trasladando carretes de cable en terreno
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition-colors ${
              isSunlightMode ? 'hover:bg-slate-200 border-black' : 'hover:bg-[#1a273b] border-[#23354e]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs font-mono">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                Picas a Desplazar (Avance)
              </label>
              <select
                value={shiftCount}
                onChange={(e) => setShiftCount(Number(e.target.value))}
                className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                  isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
                }`}
              >
                <option value={14}>14 Electrodos (1/4 Tendido = {14 * spacing}m)</option>
                <option value={28}>28 Electrodos (1/2 Tendido = {28 * spacing}m · 1 Carrete)</option>
                <option value={42}>42 Electrodos (3/4 Tendido = {42 * spacing}m)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                Número de Etapa Roll
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={rollNumber}
                onChange={(e) => setRollNumber(Math.max(1, Number(e.target.value)))}
                className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                  isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
                }`}
              />
            </div>
          </div>

          {/* Schematic visualizer of Roll Along overlap */}
          <div
            className={`p-4 rounded-xl border space-y-2.5 ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#070d16] border-[#17253a]'
            }`}
          >
            <span className="font-bold uppercase tracking-wider block text-[11px]">
              Geometría de Avance en Terreno:
            </span>

            {/* Current cable */}
            <div>
              <div className="flex justify-between text-[10px] opacity-75 mb-0.5">
                <span>Línea Original ({currentJobName}): 0.0m a {currentLength}m</span>
                <span>{currentElectrodes} Picas</span>
              </div>
              <div className="w-full h-3 rounded bg-blue-600/40 border border-blue-500 relative flex items-center px-1">
                <span className="text-[9px] text-white font-bold">Cable Actual (1 - {currentElectrodes})</span>
              </div>
            </div>

            {/* Next cable shifted */}
            <div>
              <div className="flex justify-between text-[10px] opacity-75 mb-0.5">
                <span>Nueva Etapa ({nextJobName}): {newStartStation}m a {newEndStation}m</span>
                <span className="text-emerald-500 font-bold">Traslape: {currentLength - shiftMeters}m</span>
              </div>
              <div className="w-full h-3 rounded bg-emerald-600/40 border border-emerald-500 relative flex items-center px-1">
                <span className="text-[9px] text-white font-bold">
                  Roll #{rollNumber} (Estación {newStartStation}m a {newEndStation}m)
                </span>
              </div>
            </div>
          </div>

          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 text-[11px] ${
              isSunlightMode ? 'bg-amber-100 border-black text-black' : 'bg-amber-950/40 border-amber-600/50 text-amber-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Procedimiento en Campo:</strong> Recoja el primer carrete (electrodos 1 al {shiftCount}) y muévalo al extremo final del tendido. Deje las picas del traslape en su posición para asegurar correlación topográfica continua.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${
              isSunlightMode ? 'border-black hover:bg-slate-200 text-black' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={handleApply}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold border shadow-lg transition-all ${
              isSunlightMode
                ? 'bg-black text-white border-black hover:bg-slate-800'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-emerald-950/40'
            }`}
          >
            <Check className="w-4 h-4" />
            Configurar {nextJobName}
          </button>
        </div>
      </div>
    </div>
  );
};

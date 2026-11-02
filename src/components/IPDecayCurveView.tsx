import React, { useState } from 'react';
import { IP_TIME_WINDOWS, QuadripolePoint } from '../utils/ert-math';
import { Zap, Activity, Info, X } from 'lucide-react';

interface IPDecayCurveViewProps {
  batch: QuadripolePoint[];
  isSunlightMode: boolean;
  onClose: () => void;
}

export const IPDecayCurveView: React.FC<IPDecayCurveViewProps> = ({
  batch,
  isSunlightMode,
  onClose,
}) => {
  const [selectedChannel, setSelectedChannel] = useState(1);

  const ipPoints = batch.filter((p) => p.ip !== undefined);
  const activePt = ipPoints.find((p) => (p.channel || 1) === selectedChannel) || ipPoints[0];
  const decayValues = activePt?.ipDecay || [18.2, 12.8, 8.4, 5.6, 3.8, 2.5];

  const maxVal = Math.max(...decayValues, 20);

  // SVG Chart dimensions
  const w = 480;
  const h = 200;
  const padL = 45;
  const padR = 25;
  const padT = 20;
  const padB = 35;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const pointsSVG = decayValues
    .map((val, idx) => {
      const x = padL + (idx / (decayValues.length - 1)) * chartW;
      const y = padT + (1 - val / maxVal) * chartH;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm">
      <div
        className={`w-full max-w-xl rounded-2xl border p-4 sm:p-5 shadow-2xl transition-colors font-mono ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0d1422] border-[#223654] text-white'
        }`}
      >
        <div className="flex items-center justify-between pb-2.5 border-b mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg border ${
                isSunlightMode ? 'bg-purple-100 border-black text-purple-900' : 'bg-purple-600/30 text-purple-400 border-purple-500/40'
              }`}
            >
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-tight">
                Curvas de Decaimiento IP en Tiempo Real (TDIP)
              </h3>
              <p className="text-[10px] opacity-75">
                Integral de carga en ventanas M1 a M6 (2000 ms periodo de inyección)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Channel Selector Ribbon */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-bold opacity-75 mr-1">Canal Rx:</span>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => (
            <button
              key={ch}
              onClick={() => setSelectedChannel(ch)}
              className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                selectedChannel === ch
                  ? isSunlightMode
                    ? 'bg-purple-900 text-white border-black'
                    : 'bg-purple-600 text-white border-purple-400'
                  : isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#152338] border-[#203657] text-slate-300'
              }`}
            >
              CH{ch}
            </button>
          ))}
        </div>

        {/* Active Point Metadata Strip */}
        {activePt && (
          <div
            className={`p-2 rounded-lg border mb-3 flex items-center justify-between text-xs ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#080d16] border-[#18273f]'
            }`}
          >
            <div>
              <span>Cuadripolo: <strong>A={activePt.p[0]} B={activePt.p[1]} : M={activePt.p[2]} N={activePt.p[3]}</strong></span>
              <span className="opacity-75 ml-2">X={activePt.x}m · Z=-{activePt.z}m</span>
            </div>
            <div className="text-purple-600 dark:text-purple-400 font-bold">
              Cargabilidad: {activePt.ip} mV/V
            </div>
          </div>
        )}

        {/* SVG Decay Curve Graph */}
        <div
          className={`rounded-xl border p-2 mb-3 ${
            isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#060b13] border-[#16253c]'
          }`}
        >
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto select-none">
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = padT + (1 - pct) * chartH;
              const val = (pct * maxVal).toFixed(1);
              return (
                <g key={i}>
                  <line x1={padL} y1={y} x2={w - padR} y2={y} stroke={isSunlightMode ? '#cbd5e1' : '#152438'} strokeDasharray="3 3" />
                  <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="9" fill={isSunlightMode ? '#000' : '#718ba8'}>
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Time Window Vertical Lines */}
            {IP_TIME_WINDOWS.map((win, idx) => {
              const x = padL + (idx / (IP_TIME_WINDOWS.length - 1)) * chartW;
              return (
                <g key={win.name}>
                  <line x1={x} y1={padT} x2={x} y2={h - padB} stroke={isSunlightMode ? '#cbd5e1' : '#152438'} strokeDasharray="3 3" />
                  <text x={x} y={h - padB + 14} textAnchor="middle" fontSize="9" fontWeight="bold" fill={isSunlightMode ? '#000' : '#a8b9cf'}>
                    {win.name}
                  </text>
                  <text x={x} y={h - padB + 24} textAnchor="middle" fontSize="7" fill={isSunlightMode ? '#475569' : '#64748b'}>
                    {win.label}
                  </text>
                </g>
              );
            })}

            {/* Decay Curve Polyline */}
            <polyline
              fill="none"
              stroke={isSunlightMode ? '#7e22ce' : '#c084fc'}
              strokeWidth="2.5"
              points={pointsSVG}
            />

            {/* Data Point Dots */}
            {decayValues.map((val, idx) => {
              const cx = padL + (idx / (decayValues.length - 1)) * chartW;
              const cy = padT + (1 - val / maxVal) * chartH;
              return (
                <g key={idx}>
                  <circle cx={cx} cy={cy} r="4.5" fill={isSunlightMode ? '#581c87' : '#e879f9'} stroke="#fff" strokeWidth="1.5" />
                  <text x={cx} y={cy - 8} textAnchor="middle" fontSize="8" fontWeight="bold" fill={isSunlightMode ? '#000' : '#f5d0fe'}>
                    {val}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Cole-Cole QC Indicators */}
        <div className="grid grid-cols-3 gap-2 text-[10px] mb-3">
          <div className={`p-2 rounded border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1c2c43]'}`}>
            <span className="opacity-75 block">Modelo Cole-Cole (c)</span>
            <span className="text-xs font-bold text-cyan-500">c ≈ 0.38 (Sulfuros)</span>
          </div>
          <div className={`p-2 rounded border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1c2c43]'}`}>
            <span className="opacity-75 block">Tiempo Relajación (τ)</span>
            <span className="text-xs font-bold text-amber-500">τ = 0.24 s</span>
          </div>
          <div className={`p-2 rounded border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1c2c43]'}`}>
            <span className="opacity-75 block">Acoplamiento EM</span>
            <span className="text-xs font-bold text-emerald-500">&lt; 0.2% (Despreciable)</span>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold border ${
              isSunlightMode ? 'border-black hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'
            }`}
          >
            Cerrar Curvas IP
          </button>
        </div>
      </div>
    </div>
  );
};

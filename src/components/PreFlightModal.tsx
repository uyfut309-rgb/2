import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  BatteryMedium,
  Activity,
  FolderArchive,
  FileCode,
  MapPin,
  Zap,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export interface PreFlightCheckData {
  allPassed: boolean;
  blockReason: string;
  checks: {
    contact: { pass: boolean; title: string; detail: string };
    battery: { pass: boolean; title: string; detail: string };
    memory: { pass: boolean; title: string; detail: string };
    cmd: { pass: boolean; title: string; detail: string };
    gps: { pass: boolean; title: string; detail: string };
  };
}

interface PreFlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PreFlightCheckData | null;
  onArmAndStart: () => void;
  onGoToContact: () => void;
  onGoToConfig: () => void;
  onSwapBatteries: () => Promise<void>;
  isSunlightMode: boolean;
}

export const PreFlightModal: React.FC<PreFlightModalProps> = ({
  isOpen,
  onClose,
  data,
  onArmAndStart,
  onGoToContact,
  onGoToConfig,
  onSwapBatteries,
  isSunlightMode,
}) => {
  if (!isOpen || !data) return null;

  const checksList = [
    {
      id: 'contact',
      icon: Activity,
      info: data.checks.contact,
      actionLabel: 'Ver Contactos',
      onAction: onGoToContact,
    },
    {
      id: 'battery',
      icon: BatteryMedium,
      info: data.checks.battery,
      actionLabel: 'Rotar Baterías',
      onAction: onSwapBatteries,
    },
    {
      id: 'memory',
      icon: FolderArchive,
      info: data.checks.memory,
    },
    {
      id: 'cmd',
      icon: FileCode,
      info: data.checks.cmd,
      actionLabel: 'Configurar Tendido',
      onAction: onGoToConfig,
    },
    {
      id: 'gps',
      icon: MapPin,
      info: data.checks.gps,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl transition-colors font-mono flex flex-col gap-4 ${
          isSunlightMode
            ? 'bg-white border-black text-black'
            : 'bg-[#0a111c] border-[#1f334f] text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                data.allPassed
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
              }`}
            >
              {data.allPassed ? <Zap className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight uppercase">
                Lista de Verificación Pre-Vuelo
              </h3>
              <p className="text-[10px] opacity-70">
                SuperSting R8/IP · Enclavamiento de Seguridad y Control de Hardware
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

        {/* Status Banner */}
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-3 ${
            data.allPassed
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
              : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
          }`}
        >
          {data.allPassed ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <strong>LISTA DE PRE-VUELO CONFORME (5/5)</strong>
                <p className="text-[10.5px] opacity-90 mt-0.5">
                  Todos los sistemas verificados. Listo para armar el transmisor e inyectar corriente.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <strong>INYECCIÓN BLOQUEADA POR SEGURIDAD</strong>
                <p className="text-[10.5px] opacity-90 mt-0.5">{data.blockReason}</p>
              </div>
            </>
          )}
        </div>

        {/* 5 Checklist Items */}
        <div className="space-y-2">
          {checksList.map(({ id, icon: Icon, info, actionLabel, onAction }) => (
            <div
              key={id}
              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                info.pass
                  ? isSunlightMode
                    ? 'bg-slate-50 border-emerald-600 text-black'
                    : 'bg-[#070e17] border-emerald-900/60 text-slate-200'
                  : isSunlightMode
                  ? 'bg-amber-50 border-amber-600 text-black'
                  : 'bg-[#140e0b] border-amber-700/60 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                    info.pass ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'
                  }`}
                >
                  {info.pass ? '✓' : '!'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-1.5 truncate">
                    <span>{info.title}</span>
                  </div>
                  <div className="text-[10px] opacity-75 font-mono truncate">{info.detail}</div>
                </div>
              </div>

              {!info.pass && onAction && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAction();
                  }}
                  className="px-2.5 py-1 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50 hover:bg-amber-500/30 shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  <span>{actionLabel}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <span className="text-[10px] opacity-60">
            AGI Compliance: 800 Vp-p Interlock
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-600 hover:bg-slate-800 cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={!data.allPassed}
              onClick={() => {
                onClose();
                onArmAndStart();
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                data.allPassed
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black shadow-lg shadow-emerald-950/60 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>ARMAR TX Y DISPARAR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

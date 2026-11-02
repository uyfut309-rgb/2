import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, X, Check, MapPin } from 'lucide-react';

export interface FieldNote {
  id: string;
  stationOrElectrode: string;
  timestamp: string;
  text: string;
  category: 'geology' | 'contact' | 'topography' | 'infrastructure';
}

interface FieldNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: FieldNote[];
  onAddNote: (note: Omit<FieldNote, 'id' | 'timestamp'>) => void;
  onDeleteNote: (id: string) => void;
  isSunlightMode: boolean;
  totalElectrodes: number;
}

export const FieldNotesModal: React.FC<FieldNotesModalProps> = ({
  isOpen,
  onClose,
  notes,
  onAddNote,
  onDeleteNote,
  isSunlightMode,
  totalElectrodes,
}) => {
  const [station, setStation] = useState('Pica #1');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<'geology' | 'contact' | 'topography' | 'infrastructure'>('geology');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddNote({ stationOrElectrode: station, text, category });
    setText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={`w-full max-w-xl rounded-2xl border p-5 sm:p-6 shadow-2xl transition-colors max-h-[90vh] flex flex-col ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0d1422] border-[#223654] text-white'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border ${
                isSunlightMode ? 'bg-black text-white border-black' : 'bg-amber-600/20 text-amber-400 border-amber-500/30'
              }`}
            >
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-tight">
                Libreta Geofísica de Terreno & Estaciones
              </h3>
              <p className="text-xs opacity-75">
                Anotaciones litológicas, puntos de agua, obstáculos y condiciones de pica
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

        {/* Add Note Form */}
        <form onSubmit={handleSubmit} className="space-y-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                Pica / Estación
              </label>
              <input
                type="text"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="Ej. Pica #18 o 90m"
                className={`w-full rounded-lg px-3 py-2 text-xs font-mono font-bold border focus:outline-none ${
                  isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className={`w-full rounded-lg px-3 py-2 text-xs font-mono font-bold border focus:outline-none ${
                  isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
                }`}
              >
                <option value="geology">Litología / Afloramiento</option>
                <option value="contact">Contacto Eléctrico / Suelo</option>
                <option value="topography">Topografía / Quebrada / Pendiente</option>
                <option value="infrastructure">Cercado / Tubería / Interferencias</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
              Observación de Terreno
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ej: Afloramiento de cuarcita fracturada; aplicada salmuera a la pica."
              className={`w-full rounded-lg px-3 py-2 text-xs font-mono border focus:outline-none ${
                isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border shadow transition-all ${
                isSunlightMode
                  ? 'bg-black text-white border-black hover:bg-slate-800'
                  : 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 shadow-amber-950/40'
              }`}
            >
              <Plus className="w-4 h-4" />
              Guardar Nota de Estación
            </button>
          </div>
        </form>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-56">
          {notes.length === 0 ? (
            <div className="text-center py-6 text-xs opacity-60">
              No hay anotaciones registradas aún. Agrega detalles de terreno para adjuntar al informe de campaña.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs font-mono ${
                  isSunlightMode ? 'bg-slate-50 border-black text-black' : 'bg-[#080e18] border-[#1a2d48] text-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {note.stationOrElectrode}
                    </span>
                    <span className="opacity-50 text-[10px]">{note.timestamp}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-bold border ${
                        isSunlightMode ? 'bg-slate-200 border-black text-black' : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {note.category}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">{note.text}</p>
                </div>

                <button
                  onClick={() => onDeleteNote(note.id)}
                  className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Eliminar nota"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pt-3 border-t mt-3 flex justify-end">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${
              isSunlightMode ? 'border-black hover:bg-slate-200 text-black' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            Cerrar Libreta
          </button>
        </div>
      </div>
    </div>
  );
};

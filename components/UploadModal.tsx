'use client';
import { useState, useRef } from 'react';
import { X, Upload, FileArchive, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Bot, LANGUAGES } from '@/lib/data';
import { uploadBot } from '@/lib/api';

export default function UploadModal({ onDeploy, onClose }: { onDeploy: (b: Bot) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pct, setPct] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const pick = (f: File) => {
    if (!f.name.endsWith('.zip')) { setErr('Must be a .zip file'); return; }
    if (f.size > 50 * 1024 * 1024) { setErr('Max 50MB'); return; }
    setFile(f); setName(f.name.replace('.zip', '').replace(/_/g, ' ')); setErr('');
  };

  const deploy = async () => {
    if (!file) return;
    setLoading(true); setPct(0); setErr('');
    const t = setInterval(() => setPct(p => p < 80 ? p + 4 : p), 200);
    try {
      const r = await uploadBot(file, name || file.name.replace('.zip', ''));
      clearInterval(t); setPct(100);
      setTimeout(() => onDeploy(r.bot), 400);
    } catch (e: any) {
      clearInterval(t); setErr(e.message || 'Upload failed'); setLoading(false); setPct(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl animate-in">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-2xl font-bold">Deploy Bot</h2>
            <p className="text-gray-500 text-sm mt-1">Upload your bot as a ZIP file</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          {!file ? (
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); }}
              onClick={() => ref.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${drag ? 'border-discord-blurple bg-discord-blurple/5 scale-[1.02]' : 'border-gray-300 dark:border-gray-700 hover:border-discord-blurple'}`}>
              <input ref={ref} type="file" accept=".zip" className="hidden" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center"><FileArchive className="w-8 h-8 text-gray-400" /></div>
              <p className="text-lg font-medium mb-2">Drop your ZIP here</p>
              <p className="text-sm text-gray-500">or click to browse (max 50MB)</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-800 rounded-lg flex items-center justify-center flex-shrink-0"><Check className="w-5 h-5 text-green-600" /></div>
                <div className="min-w-0"><p className="font-medium truncate">{file.name}</p><p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p></div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Bot Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input" placeholder="My Bot" />
              </div>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.slice(0, 4).map(l => (
                  <div key={l.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"><span>{l.icon}</span> {l.name}</div>
                ))}
              </div>
              {loading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">{pct < 100 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />} {pct < 100 ? 'Uploading...' : 'Done!'}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-discord-blurple to-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setFile(null)} className="btn-secondary flex-1" disabled={loading}>Back</button>
                <button onClick={deploy} className="btn-primary flex-1 shadow-lg shadow-discord-blurple/20" disabled={!name.trim() || loading}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying</> : <><Upload className="w-4 h-4" /> Deploy</>}
                </button>
              </div>
            </div>
          )}
          {err && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" /> {err}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

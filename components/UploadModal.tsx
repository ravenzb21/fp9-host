'use client';

import { useState, useRef } from 'react';
import { useApp } from '@/lib/context';
import { X, Upload, FileArchive, Check, AlertCircle, Loader2, BotIcon } from 'lucide-react';
import { Bot, supportedLanguages } from '@/lib/data';
import { uploadBot } from '@/lib/api';

export default function UploadModal({ onDeploy, onClose }: { onDeploy: (b: Bot) => void; onClose: () => void }) {
  const { t } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [botName, setBotName] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.zip')) { setError('Please select a .zip file'); return; }
    if (f.size > 50 * 1024 * 1024) { setError('File size must be less than 50MB'); return; }
    setFile(f);
    setBotName(f.name.replace('.zip', '').replace(/_/g, ' '));
    setError('');
  };

  const handleDeploy = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError('');
    setStatusText('Uploading to server...');

    const tick = setInterval(() => setProgress(p => p < 80 ? p + 5 : p), 200);
    try {
      const result = await uploadBot(file, botName || file.name.replace('.zip', ''));
      clearInterval(tick);
      setProgress(100);
      setStatusText('✅ Deployed successfully!');
      setTimeout(() => onDeploy(result.bot), 500);
    } catch (err: any) {
      clearInterval(tick);
      setError(err.message || 'Upload failed. Is the backend running?');
      setUploading(false);
      setProgress(0);
      setStatusText('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-2xl font-bold">Deploy Bot</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Upload your bot as a ZIP file</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {!file ? (
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-discord-blurple bg-discord-blurple/5 scale-[1.02]' : 'border-gray-300 dark:border-gray-700 hover:border-discord-blurple'}`}>
              <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                <FileArchive className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-lg font-medium mb-2">Drag & drop your ZIP file</p>
              <p className="text-sm text-gray-500">or click to browse (max 50MB)</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB ZIP</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Bot Name</label>
                <input type="text" value={botName} onChange={(e) => setBotName(e.target.value)} className="input-field" placeholder="My Awesome Bot" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Language</label>
                <p className="text-xs text-gray-500 mb-2">Will be auto-detected from project files</p>
                <div className="flex flex-wrap gap-2">
                  {supportedLanguages.slice(0, 4).map((lang) => (
                    <div key={lang.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
                      <span>{lang.icon}</span> {lang.name}
                    </div>
                  ))}
                </div>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">{progress < 100 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />} {statusText}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-discord-blurple to-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setFile(null)} className="btn-secondary flex-1" disabled={uploading}>Back</button>
                <button onClick={handleDeploy} className="btn-primary flex-1 shadow-lg shadow-discord-blurple/20" disabled={!botName.trim() || uploading}>
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</> : <><Upload className="w-4 h-4" /> Deploy Bot</>}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-discord-red text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

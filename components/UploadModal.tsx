'use client';

import { useState, useRef } from 'react';
import { useApp } from '@/lib/context';
import { X, Upload, FileArchive, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Bot, supportedLanguages } from '@/lib/data';
import { uploadBot } from '@/lib/api';

interface UploadModalProps {
  onDeploy: (bot: Bot) => void;
  onClose: () => void;
}

export default function UploadModal({ onDeploy, onClose }: UploadModalProps) {
  const { t } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [botName, setBotName] = useState('');
  const [selectedLang, setSelectedLang] = useState<string>('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.zip')) {
      setError('Please select a .zip file');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return;
    }
    setFile(selectedFile);
    setBotName(selectedFile.name.replace('.zip', ''));
    setError('');
  };

  const handleDeploy = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 200);

      const result = await uploadBot(file, botName || file.name.replace('.zip', ''));

      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        onDeploy(result.bot);
      }, 300);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Make sure the backend server is running.');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-2xl font-bold">{t('upload.title')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('upload.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                dragOver ? 'border-discord-blurple bg-discord-blurple/5' : 'border-gray-300 dark:border-gray-700 hover:border-discord-blurple'
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
              <FileArchive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">{t('upload.dragDrop')}</p>
              <p className="text-sm text-gray-500">{t('upload.supported')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <Check className="w-5 h-5 text-green-600" />
                <span className="font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Bot Name</label>
                <input type="text" value={botName} onChange={(e) => setBotName(e.target.value)} className="input-field" placeholder="My Awesome Bot" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('upload.language')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {supportedLanguages.map((lang) => (
                    <button key={lang.id} onClick={() => setSelectedLang(lang.id)}
                      className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                        selectedLang === lang.id ? 'border-discord-blurple bg-discord-blurple/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl">{lang.icon}</span>
                      <span className="text-sm font-medium">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading to server...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-discord-blurple h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setFile(null)} className="btn-secondary flex-1" disabled={uploading}>{t('upload.back')}</button>
                <button onClick={handleDeploy} className="btn-primary flex-1" disabled={!botName.trim() || uploading}>
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> {t('upload.deploy')}</>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-discord-red">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, Settings as SettingsIcon, Bell, Key, Shield, Save, Check } from 'lucide-react';
import { KomariSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: KomariSettings;
  onSave: (newSettings: KomariSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [formData, setFormData] = useState<KomariSettings>(settings);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div 
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-purple-950/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-neutral-100">Komari System Settings</h2>
          </div>
          <button
            id="btn-close-settings"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1 font-medium">Site Name</label>
            <input
              type="text"
              value={formData.sitename}
              onChange={(e) => setFormData({ ...formData, sitename: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1 font-medium">Site Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1 font-medium">Telemetry Poll Interval</label>
              <select
                value={formData.refreshInterval}
                onChange={(e) => setFormData({ ...formData, refreshInterval: Number(e.target.value) })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500"
              >
                <option value={1000}>1 second (High Real-Time)</option>
                <option value={2000}>2 seconds (Standard)</option>
                <option value={5000}>5 seconds (Low Bandwidth)</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-400 mb-1 font-medium">Auto-Discovery Key</label>
              <input
                type="text"
                value={formData.autoDiscoveryKey}
                onChange={(e) => setFormData({ ...formData, autoDiscoveryKey: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-purple-500 font-mono text-[11px]"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-800/80 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.notificationEnabled}
                onChange={(e) => setFormData({ ...formData, notificationEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-neutral-800 text-purple-600 focus:ring-purple-500 bg-neutral-950"
              />
              <div>
                <span className="text-neutral-200 font-medium block">Alert Notifications</span>
                <span className="text-neutral-500 text-[11px]">Send alert when CPU &gt; 90% or node goes offline</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.allowGuest}
                onChange={(e) => setFormData({ ...formData, allowGuest: e.target.checked })}
                className="w-4 h-4 rounded border-neutral-800 text-purple-600 focus:ring-purple-500 bg-neutral-950"
              />
              <div>
                <span className="text-neutral-200 font-medium block">Public Guest Dashboard</span>
                <span className="text-neutral-500 text-[11px]">Allow anonymous visitors to view node statuses</span>
              </div>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors flex items-center gap-1.5"
            >
              {saved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              <span>{saved ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

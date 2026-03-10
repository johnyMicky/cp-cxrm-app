import React, { useState, useRef } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../utils/api';

interface LeadImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportSummary {
  total: number;
  valid: number;
  imported: number;
  duplicates: number;
  errors: number;
}

export default function LeadImport({ onClose, onSuccess }: LeadImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const templateData = [
      {
        'Full Name': 'John Doe',
        'Email': 'john@example.com',
        'Phone Number': '+1234567890',
        'Country': 'USA',
        'Source': 'Website',
        'Status': 'New',
        'Assigned To': '',
        'Notes': 'Interested in premium plan'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads Template');
    XLSX.writeFile(wb, 'CamptainM-CRM_Leads_Template.xlsx');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv')) {
      setError('Please upload a valid CSV or Excel file.');
      return;
    }

    setFile(file);
    setError(null);
    setSummary(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const normalizePhone = (phone: any) => {
    if (!phone) return null;
    return String(phone).replace(/\D/g, '');
  };

  const processImport = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        throw new Error('The uploaded file is empty.');
      }

      // Check for required columns (Full Name)
      const firstRow = jsonData[0];
      if (!('Full Name' in firstRow)) {
        throw new Error('Required column "Full Name" is missing.');
      }

      // Map data to lead objects
      const leadsToImport = jsonData.map(row => ({
        name: row['Full Name'],
        email: row['Email'],
        phone: row['Phone Number'],
        country: row['Country'],
        source: row['Source'],
        status: row['Status'],
        assigned_to: row['Assigned To'],
        notes: row['Notes']
      })).filter(lead => lead.name); // Ensure name exists

      // Check for internal duplicates in the file
      const seenPhones = new Set();
      const uniqueLeads = [];
      let internalDuplicates = 0;

      for (const lead of leadsToImport) {
        const phone = normalizePhone(lead.phone);
        if (phone && seenPhones.has(phone)) {
          internalDuplicates++;
          continue;
        }
        if (phone) seenPhones.add(phone);
        uniqueLeads.push(lead);
      }

      // Send to backend
      const response = await apiFetch('/api/leads/bulk', {
        method: 'POST',
        body: JSON.stringify({
          leads: uniqueLeads,
          user_id: parseInt(localStorage.getItem('userId') || '1')
        })
      });

      if (!response.ok) throw new Error('Failed to import leads.');

      const result = await response.json();
      setSummary({
        total: jsonData.length,
        valid: leadsToImport.length,
        imported: result.imported,
        duplicates: result.duplicates + internalDuplicates,
        errors: result.errors
      });

      if (result.imported > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during import.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A0F1C] w-full max-w-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Import Leads</h2>
              <p className="text-xs text-slate-400">Upload CSV or Excel files to bulk add leads.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!summary ? (
            <>
              <div className="flex items-center justify-between p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <div className="text-sm">
                    <p className="text-white font-medium">Need a template?</p>
                    <p className="text-slate-400 text-xs text-balance">Download our formatted Excel template to ensure your data is correctly structured.</p>
                  </div>
                </div>
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>

              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center space-y-4 transition-all cursor-pointer
                  ${isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'}
                  ${file ? 'border-emerald-500/50 bg-emerald-500/5' : ''}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                />
                
                {file ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="text-xs text-rose-400 hover:text-rose-300 underline mt-2"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-slate-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Click to upload or drag and drop</p>
                      <p className="text-xs text-slate-500 mt-1">Supports CSV, XLSX, XLS (Max 10MB)</p>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="flex items-start space-x-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-200">{error}</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">Import Completed</h3>
                <p className="text-sm text-slate-400">Your leads have been processed successfully.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Total Rows</p>
                  <p className="text-2xl font-bold text-white mt-1">{summary.total}</p>
                </div>
                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <p className="text-xs text-emerald-500 uppercase font-semibold tracking-wider">Imported</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">{summary.imported}</p>
                </div>
                <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <p className="text-xs text-amber-500 uppercase font-semibold tracking-wider">Duplicates</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">{summary.duplicates}</p>
                </div>
                <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <p className="text-xs text-rose-500 uppercase font-semibold tracking-wider">Errors</p>
                  <p className="text-2xl font-bold text-rose-400 mt-1">{summary.errors}</p>
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-sm text-slate-300">
                <p>• {summary.imported} new leads added to your database.</p>
                <p>• {summary.duplicates} leads were skipped as duplicates.</p>
                {summary.errors > 0 && <p className="text-rose-400">• {summary.errors} rows failed due to invalid data.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-end space-x-3">
          {!summary ? (
            <>
              <button 
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={processImport}
                disabled={!file || isProcessing}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Start Import</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button 
              onClick={onClose}
              className="w-full bg-white/5 hover:bg-white/10 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all border border-white/10"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

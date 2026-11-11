import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle2, FileText, Loader2, FileSpreadsheet, Tag, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { firestoreService } from '../services/firestoreService';
// The phone → country tables that used to live here were moved, unchanged, to
// utils/smartImport.ts so the smart importer can use them too.
import {
  detectCountryFromPhone,
  readSpreadsheet,
  isSupportedFile,
  SUPPORTED_EXTENSIONS,
  pickBestSheet,
  detectHeaderRow,
  detectColumns,
  buildLeads,
  saveMapping,
  ROLE_OPTIONS,
  type SheetGrid,
  type ColumnInfo,
  type ImportRole
} from '../utils/smartImport';

interface LeadImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportSummary {
  total: number;
  valid: number;
  imported: number;
  duplicates: number;
  databaseDuplicates: number;
  internalDuplicates: number;
  errors: number;
  duplicateDetails: any[];
}

const RECENT_SOURCES_KEY = 'crmImportRecentSources';

const loadRecentSources = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_SOURCES_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 8) : [];
  } catch {
    return [];
  }
};

const rememberSource = (source: string) => {
  try {
    const list = loadRecentSources().filter(s => s.toLowerCase() !== source.toLowerCase());
    localStorage.setItem(RECENT_SOURCES_KEY, JSON.stringify([source, ...list].slice(0, 8)));
  } catch {}
};

const SINGLE_ROLE_SET = new Set<ImportRole>([
  'name', 'first_name', 'middle_name', 'last_name', 'email', 'phone', 'dial_code', 'country', 'source', 'status', 'assigned_to'
]);

const confidenceTone: Record<ColumnInfo['confidence'], string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  medium: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  low: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  none: 'bg-white/5 text-slate-500 border-white/10'
};

export default function LeadImport({ onClose, onSuccess }: LeadImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  // Smart import state
  const [sheets, setSheets] = useState<SheetGrid[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(-1);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [usedSavedMapping, setUsedSavedMapping] = useState(false);
  const [sourceInput, setSourceInput] = useState('');
  const [overrideSource, setOverrideSource] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [addPrefix, setAddPrefix] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name?: string; email?: string }>>([]);
  const [recentSources] = useState<string[]>(() => loadRecentSources());

  // CRM statuses and users, used to match the file's Status / Agent values.
  useEffect(() => {
    let alive = true;
    firestoreService
      .getLeadStatuses()
      .then((list: any[]) => {
        if (alive) setStatuses((list || []).map(s => String(s?.name || '').trim()).filter(Boolean));
      })
      .catch(() => {});
    firestoreService
      .getUsers()
      .then((list: any[]) => {
        if (alive) setUsers((list || []).map(u => ({ id: String(u.id), name: u.name || '', email: u.email || '' })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const rows = sheets[sheetIndex]?.rows || [];

  const built = useMemo(() => {
    if (!columns.length) return null;
    return buildLeads(rows, headerRow, columns, {
      statuses,
      users,
      addPrefixToLocal: addPrefix,
      detectCountryFromPhone
    });
  }, [rows, headerRow, columns, statuses, users, addPrefix]);

  const sourceColumn = columns.find(c => c.role === 'source');
  const leadCount = built?.leads.length || 0;
  const missingSource = built?.missingSource || 0;
  const sourceRequired = !sourceColumn || missingSource > 0 || overrideSource;
  const typedSource = sourceInput.trim();
  const sourceOk = !sourceRequired || !!typedSource;
  const hasIdentity = columns.some(c => ['name', 'first_name', 'last_name', 'phone', 'phone2', 'email'].includes(c.role));
  const hasPhone = columns.some(c => c.role === 'phone' || c.role === 'phone2');

  const finalSource = (fileSource: string) => (overrideSource || !fileSource ? typedSource : fileSource);

  const userName = (id: string) => {
    if (!id) return '';
    const u = users.find(x => x.id === id);
    return u ? u.name || u.email || id : id;
  };

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

  const resetFile = () => {
    setFile(null);
    setSheets([]);
    setColumns([]);
    setHeaderRow(-1);
    setSheetIndex(0);
    setSourceInput('');
    setOverrideSource(false);
    setSourceError(false);
    setShowSkipped(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applySheet = (grids: SheetGrid[], index: number, forcedHeader?: number) => {
    const gridRows = grids[index]?.rows || [];
    const hr = forcedHeader !== undefined ? forcedHeader : detectHeaderRow(gridRows);
    const detected = detectColumns(gridRows, hr);
    setSheetIndex(index);
    setHeaderRow(hr);
    setColumns(detected.columns);
    setUsedSavedMapping(detected.usedSaved);
    if (!detected.columns.length) setError('No data was found on this sheet.');
    else setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = async (selected: File) => {
    if (!isSupportedFile(selected)) {
      setError('Please upload a CSV, TSV, TXT, XLSX, XLS or ODS file.');
      return;
    }

    resetFile();
    setFile(selected);
    setSummary(null);
    setIsReading(true);

    try {
      const grids = await readSpreadsheet(selected);
      const withData = grids.filter(g => g.rows.some(r => r.some(c => String(c || '').trim())));
      if (!withData.length) throw new Error('The uploaded file is empty.');
      setSheets(withData);
      applySheet(withData, pickBestSheet(withData));
    } catch (err: any) {
      setSheets([]);
      setColumns([]);
      setError(err?.message ? `Could not read this file: ${err.message}` : 'Could not read this file.');
    } finally {
      setIsReading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const changeRole = (colIndex: number, role: ImportRole) => {
    setColumns(prev =>
      prev.map(c => {
        if (c.index === colIndex) return { ...c, role, confidence: 'high', reason: 'Set by you' };
        // A single-value field can only come from one column.
        if (SINGLE_ROLE_SET.has(role) && c.role === role) {
          return { ...c, role: role === 'phone' ? 'phone2' : 'ignore', confidence: 'none', reason: 'Replaced by your choice' };
        }
        return c;
      })
    );
  };

  const processImport = async () => {
    if (!file || !built) return;

    if (!hasIdentity) {
      setError('Choose at least one column for Name, Phone or Email.');
      return;
    }
    if (!sourceOk) {
      setSourceError(true);
      setError('Please enter the Source for this file before importing.');
      sourceInputRef.current?.focus();
      sourceInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!built.leads.length) {
      setError('No importable rows were found. Check the column choices above.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const leadsToImport = built.leads.map(lead => ({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        // Never overwrite an explicitly supplied Country.
        // If it is blank, it was inferred locally from the international phone prefix.
        country: lead.country,
        source: finalSource(lead.source),
        status: lead.status || 'New',
        assigned_to: lead.assigned_to,
        notes: lead.notes
      }));

      saveMapping(columns);
      if (typedSource) rememberSource(typedSource);

      // Compare against the full CRM database and the current upload in one service call.
      const currentUserId = localStorage.getItem('userId');
      setProgress({ current: 0, total: leadsToImport.length });

      const result = await firestoreService.bulkCreateLeads(
        leadsToImport,
        currentUserId,
        file.name,
        (current, total) => setProgress({ current, total })
      );

      setSummary({
        total: built.leads.length + built.skipped.length,
        valid: leadsToImport.length,
        imported: result.imported,
        duplicates: result.duplicates,
        databaseDuplicates: result.databaseDuplicates || 0,
        internalDuplicates: result.internalDuplicates || 0,
        errors: result.errors,
        duplicateDetails: result.duplicateDetails || []
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

  const mapping = !summary && file && columns.length > 0;
  const headerChoices = rows
    .map((r, i) => ({ i, text: r.filter(c => String(c || '').trim()).slice(0, 5).join(' · ') }))
    .filter(x => x.text)
    .slice(0, 15);
  const visibleColumns = showAllColumns ? columns : columns.filter(c => c.filled > 0 || c.role !== 'ignore');
  const hiddenCount = columns.length - visibleColumns.length;
  const unknownStatuses = Object.entries<number>(built?.unknownStatuses || {}).sort((a, b) => b[1] - a[1]);
  const unknownAgents = Object.entries<number>(built?.unknownAgents || {}).sort((a, b) => b[1] - a[1]);
  const fileBaseName = file ? file.name.replace(/\.[^.]+$/, '') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`bg-[#0A0F1C] w-full ${mapping ? 'max-w-5xl' : 'max-w-xl'} max-h-[92vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200`}>
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Import Leads</h2>
              <p className="text-xs text-slate-400">
                {mapping ? 'Check the detected columns, enter the Source, then import.' : 'Upload any lead file — the CRM recognises the columns for you.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {summary ? (
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

              {summary.duplicateDetails.length > 0 && (
                <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 overflow-hidden">
                  <div className="px-4 py-3 border-b border-amber-500/10 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-300">Duplicate Matches</p>
                      <p className="text-[10px] text-slate-500">First {Math.min(8, summary.duplicateDetails.length)} shown. Full report is saved in Lead Files.</p>
                    </div>
                    <span className="text-sm font-bold text-amber-400">{summary.duplicates}</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                    {summary.duplicateDetails.slice(0, 8).map((duplicate: any, index: number) => (
                      <div key={`${duplicate.normalizedPhone}-${index}`} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{duplicate.attemptedName || duplicate.attemptedPhone || 'Duplicate Lead'}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{duplicate.attemptedPhone || duplicate.normalizedPhone}</p>
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-300 whitespace-nowrap">{duplicate.duplicateType}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">Matched file: <span className="text-blue-300">{duplicate.matchedFileName || 'Manual / Legacy'}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-sm text-slate-300">
                <p>• {summary.imported} new leads added to your database.</p>
                <p>• {summary.databaseDuplicates} matched existing Leads anywhere in the CRM.</p>
                <p>• {summary.internalDuplicates} were duplicates inside this uploaded file.</p>
                {summary.errors > 0 && <p className="text-rose-400">• {summary.errors} rows failed due to invalid data.</p>}
              </div>
            </div>
          ) : mapping && built ? (
            <div className="space-y-5">
              {/* File bar */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{file!.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {(file!.size / 1024).toFixed(1)} KB · {rows.length} rows read
                    {usedSavedMapping && <span className="text-emerald-400"> · column choices remembered from last time</span>}
                  </p>
                </div>
                {sheets.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    Sheet
                    <select
                      value={sheetIndex}
                      onChange={(e) => applySheet(sheets, Number(e.target.value))}
                      className="bg-[#111827] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
                    >
                      {sheets.map((sh, i) => (
                        <option key={sh.name + i} value={i}>{sh.name} ({sh.rows.length})</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Header row
                  <select
                    value={headerRow}
                    onChange={(e) => applySheet(sheets, sheetIndex, Number(e.target.value))}
                    className="bg-[#111827] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white max-w-[260px] focus:outline-none focus:border-blue-500/50"
                  >
                    <option value={-1}>No header — data starts on row 1</option>
                    {headerChoices.map(choice => (
                      <option key={choice.i} value={choice.i}>Row {choice.i + 1}: {choice.text.slice(0, 50)}</option>
                    ))}
                  </select>
                </label>
                <button onClick={resetFile} className="text-xs text-rose-400 hover:text-rose-300 underline">Change file</button>
              </div>

              {/* SOURCE — required */}
              <div
                className={`rounded-xl border p-4 space-y-3 ${
                  sourceRequired
                    ? sourceError && !typedSource
                      ? 'border-rose-500/50 bg-rose-500/10'
                      : 'border-amber-500/30 bg-amber-500/5'
                    : 'border-emerald-500/20 bg-emerald-500/5'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Tag className={`w-5 h-5 shrink-0 mt-0.5 ${sourceRequired ? 'text-amber-400' : 'text-emerald-400'}`} />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-white">
                      Source <span className="text-rose-400">*</span>
                    </p>
                    {!sourceColumn ? (
                      <p className="text-xs text-amber-200">
                        This file has no Source column. Type the Source below — it will be written on all {leadCount} leads of this file.
                      </p>
                    ) : missingSource > 0 && !overrideSource ? (
                      <p className="text-xs text-amber-200">
                        {missingSource} of {leadCount} leads have an empty Source in column “{sourceColumn.header}”. Type the Source for them below.
                      </p>
                    ) : overrideSource ? (
                      <p className="text-xs text-amber-200">The Source you type will replace the file's values on all {leadCount} leads.</p>
                    ) : (
                      <p className="text-xs text-emerald-300">All {leadCount} leads already have a Source from column “{sourceColumn.header}”.</p>
                    )}
                  </div>
                </div>

                {sourceRequired && (
                  <div className="space-y-2 pl-8">
                    <input
                      ref={sourceInputRef}
                      value={sourceInput}
                      onChange={(e) => {
                        setSourceInput(e.target.value);
                        if (e.target.value.trim()) setSourceError(false);
                      }}
                      placeholder="e.g. Facebook DE, Affiliate X, Old DB 2024…"
                      className={`w-full bg-[#111827] border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none ${
                        sourceError && !typedSource ? 'border-rose-500/70' : 'border-white/10 focus:border-blue-500/50'
                      }`}
                    />
                    {sourceError && !typedSource && (
                      <p className="text-xs text-rose-300">Please enter the Source — the import can't start without it.</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {recentSources.map(src => (
                        <button
                          key={src}
                          type="button"
                          onClick={() => {
                            setSourceInput(src);
                            setSourceError(false);
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                        >
                          {src}
                        </button>
                      ))}
                      {fileBaseName && !recentSources.includes(fileBaseName) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSourceInput(fileBaseName);
                            setSourceError(false);
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-dashed border-white/15 text-slate-400 hover:bg-white/10"
                          title="Use the file name as Source"
                        >
                          Use file name: {fileBaseName.slice(0, 30)}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {sourceColumn && (
                  <label className="flex items-center gap-2 pl-8 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={overrideSource}
                      onChange={(e) => setOverrideSource(e.target.checked)}
                      className="accent-blue-600"
                    />
                    Use one Source for the whole file (replace the file's Source values)
                  </label>
                )}
              </div>

              {/* Columns */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Detected columns</p>
                  <div className="flex items-center gap-3">
                    {hasPhone && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none" title="0151… + Germany → +49151…">
                        <input type="checkbox" checked={addPrefix} onChange={(e) => setAddPrefix(e.target.checked)} className="accent-blue-600" />
                        Add country code to local numbers (from Country)
                      </label>
                    )}
                    {hiddenCount > 0 && (
                      <button onClick={() => setShowAllColumns(v => !v)} className="text-[11px] text-blue-400 hover:text-blue-300">
                        {showAllColumns ? 'Hide empty columns' : `Show ${hiddenCount} empty`}
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {visibleColumns.map(col => (
                    <div key={col.index} className="grid grid-cols-12 gap-3 px-4 py-2 items-center">
                      <div className="col-span-12 sm:col-span-3 min-w-0">
                        <p className="text-xs font-medium text-white truncate" title={col.header}>{col.header}</p>
                        <p className="text-[10px] text-slate-500">{col.filled} values</p>
                      </div>
                      <div className="col-span-12 sm:col-span-5 min-w-0">
                        <p className="text-[11px] text-slate-400 truncate" title={col.samples.join(' | ')}>
                          {col.samples.length ? col.samples.join(' · ') : <span className="italic text-slate-600">empty</span>}
                        </p>
                      </div>
                      <div className="col-span-9 sm:col-span-3">
                        <select
                          value={col.role}
                          onChange={(e) => changeRole(col.index, e.target.value as ImportRole)}
                          className={`w-full bg-[#111827] border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500/50 ${
                            col.role === 'ignore' ? 'border-white/10 text-slate-500' : 'border-blue-500/30 text-white'
                          }`}
                        >
                          {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3 sm:col-span-1 flex justify-end">
                        {col.role !== 'ignore' && (
                          <span
                            title={col.reason}
                            className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${confidenceTone[col.confidence]}`}
                          >
                            {col.confidence === 'high' ? 'sure' : col.confidence === 'medium' ? 'likely' : 'check'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!hasIdentity && (
                <div className="flex items-start gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-200">No Name, Phone or Email column was found. Pick them in the list above.</p>
                </div>
              )}

              {/* Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500">Ready to import</p>
                  <p className="text-xl font-bold text-emerald-400">{leadCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Skipped rows</p>
                  <p className="text-xl font-bold text-white">{built.skipped.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Without phone</p>
                  <p className="text-xl font-bold text-white">{built.leads.filter(l => !l.phone).length}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Country found</p>
                  <p className="text-xl font-bold text-white">{built.leads.filter(l => l.country).length}</p>
                </div>
              </div>

              {(unknownStatuses.length > 0 || unknownAgents.length > 0 || built.repeatedHeaders > 0) && (
                <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 space-y-1.5 text-xs text-amber-100">
                  {unknownStatuses.length > 0 && (
                    <p>
                      <span className="font-semibold text-amber-300">Statuses not in the CRM</span> (imported as “New”, original kept in the note):{' '}
                      {unknownStatuses.slice(0, 6).map(([s, n]) => `${s} (${n})`).join(', ')}
                      {unknownStatuses.length > 6 ? ` +${unknownStatuses.length - 6} more` : ''}
                    </p>
                  )}
                  {unknownAgents.length > 0 && (
                    <p>
                      <span className="font-semibold text-amber-300">Agents not found in the CRM</span> (left unassigned, original kept in the note):{' '}
                      {unknownAgents.slice(0, 6).map(([s, n]) => `${s} (${n})`).join(', ')}
                      {unknownAgents.length > 6 ? ` +${unknownAgents.length - 6} more` : ''}
                    </p>
                  )}
                  {built.repeatedHeaders > 0 && <p>{built.repeatedHeaders} repeated header rows inside the file were skipped.</p>}
                </div>
              )}

              {/* Preview */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/5">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Preview — first 5 leads as they will be saved</p>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-2 font-semibold">Row</th>
                        <th className="px-3 py-2 font-semibold">Name</th>
                        <th className="px-3 py-2 font-semibold">Phone</th>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="px-3 py-2 font-semibold">Country</th>
                        <th className="px-3 py-2 font-semibold">Source</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Agent</th>
                        <th className="px-3 py-2 font-semibold">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {built.leads.slice(0, 5).map(lead => {
                        const src = finalSource(lead.source);
                        return (
                          <tr key={lead.rowNumber} className="text-slate-300">
                            <td className="px-3 py-2 text-slate-500 tabular-nums">{lead.rowNumber}</td>
                            <td className="px-3 py-2 text-white whitespace-nowrap max-w-[160px] truncate">{lead.name}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{lead.phone || <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-2 max-w-[170px] truncate">{lead.email || <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{lead.country || <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {src ? src : <span className="text-rose-400 font-medium">missing</span>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{lead.status}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{userName(lead.assigned_to) || <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-2 max-w-[180px] truncate text-slate-500" title={lead.notes}>{lead.notes ? lead.notes.replace(/\n/g, ' · ') : ''}</td>
                          </tr>
                        );
                      })}
                      {!built.leads.length && (
                        <tr>
                          <td colSpan={9} className="px-3 py-6 text-center text-slate-500">No importable rows with the current column choices.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {built.skipped.length > 0 && (
                <div className="rounded-xl border border-white/10">
                  <button
                    onClick={() => setShowSkipped(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-300 hover:bg-white/[0.03]"
                  >
                    <span>{built.skipped.length} rows will be skipped — see why</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showSkipped ? 'rotate-180' : ''}`} />
                  </button>
                  {showSkipped && (
                    <div className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-white/5 border-t border-white/5">
                      {built.skipped.slice(0, 50).map(row => (
                        <div key={row.rowNumber} className="px-4 py-2 text-[11px] flex gap-3">
                          <span className="text-slate-500 tabular-nums shrink-0">Row {row.rowNumber}</span>
                          <span className="text-amber-300 shrink-0">{row.reason}</span>
                          <span className="text-slate-500 truncate">{row.preview}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-start space-x-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-200">{error}</p>
                </div>
              )}
            </div>
          ) : (
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
                  accept={SUPPORTED_EXTENSIONS}
                  className="hidden"
                />
                
                {isReading ? (
                  <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <p className="text-sm text-slate-300">Reading file…</p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); resetFile(); }}
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
                      <p className="text-xs text-slate-500 mt-1">Any layout · CSV, XLSX, XLS, ODS, TSV, TXT — columns are detected automatically</p>
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
          )}
        </div>

        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-end space-x-3 shrink-0">
          {!summary ? (
            <>
              {mapping && !sourceOk && (
                <span className="mr-auto text-xs text-amber-300">Enter the Source to enable import</span>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={processImport}
                disabled={!file || !mapping || isProcessing || isReading}
                className={`flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20 ${
                  mapping && !sourceOk ? 'opacity-60' : ''
                }`}
              >
                {isProcessing ? (
                  <div className="flex items-center space-x-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-sm">Processing...</span>
                      {progress.total > 0 && (
                        <span className="text-[10px] text-blue-200">
                          {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{mapping ? `Import ${leadCount} leads` : 'Start Import'}</span>
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

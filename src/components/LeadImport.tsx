import React, { useState, useRef } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { firestoreService } from '../services/firestoreService';

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


// Lightweight local country detection for imports.
// It runs only once per uploaded row and makes no API/network request.
const CANADA_NANP_AREA_CODES = new Set([
  '204','226','236','249','250','257','263','289','306','343','354','365','367',
  '368','382','403','416','418','428','431','437','438','450','468','474','506',
  '514','519','548','579','581','584','587','604','613','639','647','672','683',
  '705','709','742','753','778','780','782','807','819','825','867','873','879',
  '902','905'
]);

const NANP_TERRITORIES: Record<string, string> = {
  '242': 'Bahamas',
  '246': 'Barbados',
  '264': 'Anguilla',
  '268': 'Antigua and Barbuda',
  '284': 'British Virgin Islands',
  '340': 'US Virgin Islands',
  '345': 'Cayman Islands',
  '441': 'Bermuda',
  '473': 'Grenada',
  '649': 'Turks and Caicos Islands',
  '658': 'Jamaica',
  '664': 'Montserrat',
  '721': 'Sint Maarten',
  '758': 'Saint Lucia',
  '767': 'Dominica',
  '784': 'Saint Vincent and the Grenadines',
  '787': 'Puerto Rico',
  '809': 'Dominican Republic',
  '829': 'Dominican Republic',
  '849': 'Dominican Republic',
  '868': 'Trinidad and Tobago',
  '869': 'Saint Kitts and Nevis',
  '876': 'Jamaica',
  '939': 'Puerto Rico'
};

const COUNTRY_CALLING_CODES: Array<[string, string]> = [
  ['998','Uzbekistan'],['996','Kyrgyzstan'],['995','Georgia'],['994','Azerbaijan'],
  ['993','Turkmenistan'],['992','Tajikistan'],['977','Nepal'],['976','Mongolia'],
  ['975','Bhutan'],['974','Qatar'],['973','Bahrain'],['972','Israel'],['971','United Arab Emirates'],
  ['970','Palestine'],['968','Oman'],['967','Yemen'],['966','Saudi Arabia'],['965','Kuwait'],
  ['964','Iraq'],['963','Syria'],['962','Jordan'],['961','Lebanon'],['960','Maldives'],
  ['886','Taiwan'],['880','Bangladesh'],['856','Laos'],['855','Cambodia'],['853','Macau'],
  ['852','Hong Kong'],['850','North Korea'],['692','Marshall Islands'],['691','Micronesia'],
  ['690','Tokelau'],['689','French Polynesia'],['688','Tuvalu'],['687','New Caledonia'],
  ['686','Kiribati'],['685','Samoa'],['683','Niue'],['682','Cook Islands'],['681','Wallis and Futuna'],
  ['680','Palau'],['679','Fiji'],['678','Vanuatu'],['677','Solomon Islands'],['676','Tonga'],
  ['675','Papua New Guinea'],['674','Nauru'],['673','Brunei'],['672','Australian External Territories'],
  ['670','Timor-Leste'],['599','Caribbean Netherlands'],['598','Uruguay'],['597','Suriname'],
  ['596','Martinique'],['595','Paraguay'],['594','French Guiana'],['593','Ecuador'],
  ['592','Guyana'],['591','Bolivia'],['590','Guadeloupe / Saint Martin'],['509','Haiti'],
  ['508','Saint Pierre and Miquelon'],['507','Panama'],['506','Costa Rica'],['505','Nicaragua'],
  ['504','Honduras'],['503','El Salvador'],['502','Guatemala'],['501','Belize'],
  ['500','Falkland Islands'],['423','Liechtenstein'],['421','Slovakia'],['420','Czech Republic'],
  ['389','North Macedonia'],['387','Bosnia and Herzegovina'],['386','Slovenia'],['385','Croatia'],
  ['383','Kosovo'],['382','Montenegro'],['381','Serbia'],['380','Ukraine'],['378','San Marino'],
  ['377','Monaco'],['376','Andorra'],['375','Belarus'],['374','Armenia'],['373','Moldova'],
  ['372','Estonia'],['371','Latvia'],['370','Lithuania'],['359','Bulgaria'],['358','Finland'],
  ['357','Cyprus'],['356','Malta'],['355','Albania'],['354','Iceland'],['353','Ireland'],
  ['352','Luxembourg'],['351','Portugal'],['350','Gibraltar'],['299','Greenland'],['298','Faroe Islands'],
  ['297','Aruba'],['291','Eritrea'],['290','Saint Helena'],['269','Comoros'],['268','Eswatini'],
  ['267','Botswana'],['266','Lesotho'],['265','Malawi'],['264','Namibia'],['263','Zimbabwe'],
  ['262','Reunion / Mayotte'],['261','Madagascar'],['260','Zambia'],['258','Mozambique'],
  ['257','Burundi'],['256','Uganda'],['255','Tanzania'],['254','Kenya'],['253','Djibouti'],
  ['252','Somalia'],['251','Ethiopia'],['250','Rwanda'],['249','Sudan'],['248','Seychelles'],
  ['245','Guinea-Bissau'],['244','Angola'],['243','DR Congo'],['242','Republic of the Congo'],
  ['241','Gabon'],['240','Equatorial Guinea'],['239','Sao Tome and Principe'],['238','Cabo Verde'],
  ['237','Cameroon'],['236','Central African Republic'],['235','Chad'],['234','Nigeria'],
  ['233','Ghana'],['232','Sierra Leone'],['231','Liberia'],['230','Mauritius'],['229','Benin'],
  ['228','Togo'],['227','Niger'],['226','Burkina Faso'],['225',"Cote d'Ivoire"],['224','Guinea'],
  ['223','Mali'],['222','Mauritania'],['221','Senegal'],['220','Gambia'],['218','Libya'],
  ['216','Tunisia'],['213','Algeria'],['212','Morocco'],['98','Iran'],['95','Myanmar'],
  ['94','Sri Lanka'],['93','Afghanistan'],['92','Pakistan'],['91','India'],['90','Turkey'],
  ['86','China'],['84','Vietnam'],['82','South Korea'],['81','Japan'],['66','Thailand'],
  ['65','Singapore'],['64','New Zealand'],['63','Philippines'],['62','Indonesia'],['61','Australia'],
  ['60','Malaysia'],['58','Venezuela'],['57','Colombia'],['56','Chile'],['55','Brazil'],
  ['54','Argentina'],['53','Cuba'],['52','Mexico'],['51','Peru'],['49','Germany'],
  ['48','Poland'],['47','Norway'],['46','Sweden'],['45','Denmark'],['44','United Kingdom'],
  ['43','Austria'],['41','Switzerland'],['40','Romania'],['39','Italy'],['36','Hungary'],
  ['34','Spain'],['33','France'],['32','Belgium'],['31','Netherlands'],['30','Greece'],
  ['27','South Africa'],['20','Egypt'],['7','Russia / Kazakhstan']
];

const detectCountryFromPhone = (phone: any) => {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';

  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Accept +44..., 0044..., and international numbers stored as plain digits.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    // A local/national number without a country prefix is ambiguous.
    return '';
  }

  if (digits.startsWith('1') && digits.length >= 11) {
    const areaCode = digits.slice(1, 4);
    if (CANADA_NANP_AREA_CODES.has(areaCode)) return 'Canada';
    if (NANP_TERRITORIES[areaCode]) return NANP_TERRITORIES[areaCode];
    return 'United States';
  }

  const match = COUNTRY_CALLING_CODES.find(([code]) => digits.startsWith(code));
  return match?.[1] || '';
};

export default function LeadImport({ onClose, onSuccess }: LeadImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
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
      // raw:false uses Excel's displayed cell text where possible.
      // This is important for phone numbers because numeric cells can otherwise
      // lose formatting/leading zeroes before duplicate comparison.
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: ''
      }) as any[];

      if (jsonData.length === 0) {
        throw new Error('The uploaded file is empty.');
      }

      // Check for required columns (Full Name)
      const firstRow = jsonData[0];
      if (!('Full Name' in firstRow)) {
        throw new Error('Required column "Full Name" is missing.');
      }

      // Map data to lead objects
      const leadsToImport = jsonData.map(row => {
        const phone = String(row['Phone Number'] || '').trim();
        const providedCountry = String(row['Country'] || '').trim();

        return {
          name: String(row['Full Name'] || '').trim(),
          email: String(row['Email'] || '').trim(),
          phone,
          // Never overwrite an explicitly supplied Country.
          // If it is blank, infer it locally from the international phone prefix.
          country: providedCountry || detectCountryFromPhone(phone),
          source: String(row['Source'] || 'Import').trim(),
          status: String(row['Status'] || 'New').trim(),
          assigned_to: String(row['Assigned To'] || '').trim(),
          notes: String(row['Notes'] || '').trim()
        };
      }).filter(lead => lead.name); // Ensure name exists

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
        total: jsonData.length,
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

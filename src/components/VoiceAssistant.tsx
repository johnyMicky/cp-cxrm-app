import { useMemo, useRef, useState } from 'react';
import { Mic, MicOff, X, Send, Sparkles, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type VoiceAssistantProps = {
  role: string;
};

type RouteRule = {
  path: string;
  roles: string[];
  aliases: string[];
};

const ALL_ROLES = ['Administrator', 'Manager', 'Team Leader', 'Agent', 'Financial Manager'];

const ROUTES: RouteRule[] = [
  { path: '/', roles: ALL_ROLES, aliases: ['dashboard', 'home', 'overview', 'დეშბორდ', 'მთავარ'] },
  { path: '/leads', roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'], aliases: ['leads', 'lead list', 'ლიდები', 'ლიდების'] },
  { path: '/lost', roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'], aliases: ['lost', 'lost leads', 'დაკარგული'] },
  { path: '/jor', roles: ['Administrator', 'Manager', 'Team Leader', 'Agent'], aliases: ['jor'] },
  { path: '/finance', roles: ['Administrator', 'Manager', 'Team Leader', 'Financial Manager'], aliases: ['finance', 'financial', 'ფინანსები', 'ფინანს'] },
  { path: '/live-calls', roles: ['Administrator', 'Manager', 'Team Leader'], aliases: ['live calls', 'live call', 'calls monitor', 'ლაივ ქოლ', 'ზარების მონიტორ'] },
  { path: '/secure-info', roles: ALL_ROLES, aliases: ['secure info', 'secure information', 'სექიურ ინფო', 'უსაფრთხო ინფორმაცია'] },
  { path: '/team', roles: ['Administrator', 'Team Leader'], aliases: ['team', 'team page', 'გუნდი', 'თიმი'] },
  { path: '/imports', roles: ['Administrator', 'Manager', 'Team Leader'], aliases: ['lead files', 'imports', 'files', 'ლიდ ფაილები', 'იმპორტ'] },
  { path: '/dispatcher', roles: ['Administrator', 'Manager'], aliases: ['dispatcher', 'დისპეტჩერ'] },
  { path: '/activity', roles: ['Administrator', 'Manager'], aliases: ['activity', 'აქტივობა'] },
  { path: '/work-logs', roles: ['Administrator', 'Manager', 'Team Leader', 'Financial Manager'], aliases: ['work logs', 'work log', 'სამუშაო ლოგები'] },
  { path: '/security-logs', roles: ['Administrator'], aliases: ['security logs', 'security log', 'უსაფრთხოების ლოგები'] },
  { path: '/settings', roles: ['Administrator'], aliases: ['settings', 'setting', 'სეთინგები', 'პარამეტრები'] },
];

const COUNTRY_ALIASES: Array<{ value: string; aliases: string[] }> = [
  { value: 'Australia', aliases: ['australia', 'australian', 'ავსტრალია', 'ავსტრალიის'] },
  { value: 'Canada', aliases: ['canada', 'canadian', 'კანადა', 'კანადის'] },
  { value: 'Germany', aliases: ['germany', 'german', 'deutschland', 'გერმანია', 'გერმანიის'] },
  { value: 'Austria', aliases: ['austria', 'austrian', 'ავსტრია', 'ავსტრიის'] },
  { value: 'Switzerland', aliases: ['switzerland', 'swiss', 'შვეიცარია', 'შვეიცარიის'] },
  { value: 'United Kingdom', aliases: ['united kingdom', 'uk', 'britain', 'great britain', 'ინგლისი', 'ბრიტანეთი', 'გაერთიანებული სამეფო'] },
  { value: 'United States', aliases: ['united states', 'usa', 'u.s.', 'america', 'ამერიკა', 'აშშ'] },
  { value: 'France', aliases: ['france', 'french', 'საფრანგეთი', 'საფრანგეთის'] },
  { value: 'Spain', aliases: ['spain', 'spanish', 'ესპანეთი', 'ესპანეთის'] },
  { value: 'Italy', aliases: ['italy', 'italian', 'იტალია', 'იტალიის'] },
];

const STATUS_ALIASES: Array<{ value: string; aliases: string[] }> = [
  { value: 'New', aliases: ['new leads', 'new status', 'status new', 'ახალი ლიდები', 'ნიუ'] },
  { value: 'In Process', aliases: ['in process', 'processing', 'ინ პროცეს'] },
  { value: 'VM', aliases: ['vm', 'voice mail', 'voicemail', 'ვოისმეილი', 'ვმ'] },
  { value: 'No answer', aliases: ['no answer', 'unanswered', 'არ უპასუხა', 'პასუხი არ არის'] },
  { value: 'Deposit', aliases: ['deposit', 'deposits', 'დეპოზიტი', 'დეპოზიტები'] },
  { value: 'Callback', aliases: ['callback', 'callbacks', 'ქოლბექი', 'ქოლბექები'] },
  { value: 'Low Potential', aliases: ['low potential'] },
  { value: 'High Potential', aliases: ['high potential'] },
  { value: 'No Potential', aliases: ['no potential'] },
  { value: 'Language Barrier', aliases: ['language barrier'] },
  { value: 'Wrong Person', aliases: ['wrong person'] },
  { value: 'Underage', aliases: ['underage'] },
  { value: 'No Experience', aliases: ['no experience'] },
  { value: 'Not Interested', aliases: ['not interested'] },
  { value: 'Hung Up', aliases: ['hung up', 'hang up'] },
  { value: 'Wrong Number', aliases: ['wrong number'] },
  { value: 'Drop', aliases: ['drop'] },
  { value: 'JOR', aliases: ['jor'] },
];

const normalize = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const includesAlias = (text: string, aliases: string[]) =>
  aliases.some(alias => text.includes(normalize(alias)));

const extractSearchTerm = (raw: string) => {
  const patterns = [
    /(?:find|search(?: for)?|locate|open client|find client|search client)\s+(.+)/i,
    /(?:მიპოვე|მოძებნე|იპოვე)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return match[1]
        .replace(/\b(client|customer|lead)\b/gi, '')
        .replace(/\b(კლიენტი|ლიდი)\b/gi, '')
        .trim();
    }
  }

  return '';
};

export default function VoiceAssistant({ role }: VoiceAssistantProps) {
  const navigate = useNavigate();
  const recognitionRef = useRef<any>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [command, setCommand] = useState('');
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState('Ready for a command.');
  const [language, setLanguage] = useState(
    () => localStorage.getItem('crmVoiceLanguage') || 'en-US'
  );

  const speechSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    []
  );

  const canAccess = (route: RouteRule) => route.roles.includes(role);

  const executeCommand = (rawCommand: string) => {
    const raw = String(rawCommand || '').trim();
    const text = normalize(raw);

    if (!text) {
      setResult('Say or type a command first.');
      return;
    }

    setHeard(raw);

    // Lead search has priority over plain navigation because phrases such as
    // "find client Robert Couture" should land on Leads with the search applied.
    const searchTerm = extractSearchTerm(raw);
    if (searchTerm) {
      const leadsRoute = ROUTES.find(item => item.path === '/leads')!;
      if (!canAccess(leadsRoute)) {
        setResult('Your role does not have access to Leads.');
        return;
      }

      const params = new URLSearchParams({
        voice: String(Date.now()),
        q: searchTerm
      });
      navigate(`/leads?${params.toString()}`);
      setResult(`Searching Leads for “${searchTerm}”.`);
      setIsOpen(false);
      return;
    }

    const country = COUNTRY_ALIASES.find(item => includesAlias(text, item.aliases));
    const status = STATUS_ALIASES.find(item => includesAlias(text, item.aliases));

    if (country || status) {
      const leadsRoute = ROUTES.find(item => item.path === '/leads')!;
      if (!canAccess(leadsRoute)) {
        setResult('Your role does not have access to Leads.');
        return;
      }

      const params = new URLSearchParams({
        voice: String(Date.now())
      });

      if (country) params.set('country', country.value);
      if (status) params.set('status', status.value);

      navigate(`/leads?${params.toString()}`);

      const description = [
        country ? country.value : '',
        status ? status.value : ''
      ].filter(Boolean).join(' · ');

      setResult(`Showing Leads filtered by ${description}.`);
      setIsOpen(false);
      return;
    }

    // Navigation commands.
    const navigationIntent =
      /\b(open|go to|show|take me|navigate)\b/i.test(raw) ||
      /(გადამიყვანე|გახსენი|მაჩვენე)/i.test(raw);

    const matchedRoute = ROUTES.find(route =>
      route.aliases.some(alias => text.includes(normalize(alias)))
    );

    if (matchedRoute && (navigationIntent || text === normalize(matchedRoute.aliases[0]))) {
      if (!canAccess(matchedRoute)) {
        setResult('Your role does not have access to that section.');
        return;
      }

      navigate(matchedRoute.path);
      setResult(`Opened ${matchedRoute.aliases[0]}.`);
      setIsOpen(false);
      return;
    }

    // Useful compact commands that map to existing Dashboard -> Leads views.
    const quickViews: Array<{ test: RegExp; params: Record<string, string>; label: string }> = [
      { test: /(new today|today'?s new|დღეს მიღებული|დღევანდელი ახალი)/i, params: { view: 'new-today' }, label: 'New Today' },
      { test: /(callbacks today|today'?s callbacks|დღევანდელი ქოლბექ)/i, params: { view: 'callbacks-today' }, label: 'Callbacks Today' },
      { test: /(unassigned|unassigned leads|დაურიგებელი)/i, params: { view: 'unassigned' }, label: 'Unassigned Leads' },
      { test: /(overdue callbacks|დაგვიანებული ქოლბექ)/i, params: { view: 'overdue-callbacks' }, label: 'Overdue Callbacks' },
    ];

    const quickView = quickViews.find(item => item.test.test(raw));
    if (quickView) {
      const leadsRoute = ROUTES.find(item => item.path === '/leads')!;
      if (!canAccess(leadsRoute)) {
        setResult('Your role does not have access to Leads.');
        return;
      }

      const params = new URLSearchParams({
        voice: String(Date.now()),
        ...quickView.params
      });

      navigate(`/leads?${params.toString()}`);
      setResult(`Opened ${quickView.label}.`);
      setIsOpen(false);
      return;
    }

    setResult('I could not match that command yet. Try “show Australia leads”, “find Robert Couture”, or “open Dashboard”.');
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    recognitionRef.current = null;
    setIsListening(false);
  };

  const startListening = () => {
    if (!speechSupported) {
      setResult('Voice recognition is not available in this browser. You can type the command below.');
      setIsOpen(true);
      return;
    }

    stopListening();

    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang =
      language === 'auto'
        ? (navigator.language || 'en-US')
        : language;

    recognition.onstart = () => {
      setIsListening(true);
      setResult('Listening…');
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      let finalTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index++) {
        const piece = event.results[index]?.[0]?.transcript || '';
        transcript += piece;
        if (event.results[index]?.isFinal) finalTranscript += piece;
      }

      const next = String(finalTranscript || transcript || '').trim();
      setCommand(next);
      setHeard(next);

      if (finalTranscript.trim()) {
        executeCommand(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      const error = String(event?.error || 'unknown');
      setResult(
        error === 'not-allowed'
          ? 'Microphone permission is blocked. Allow microphone access in the browser.'
          : `Voice recognition error: ${error}`
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error: any) {
      recognitionRef.current = null;
      setIsListening(false);
      setResult(error?.message || 'Unable to start voice recognition.');
    }
  };

  const toggleListening = () => {
    setIsOpen(true);
    if (isListening) stopListening();
    else startListening();
  };

  const changeLanguage = (next: string) => {
    setLanguage(next);
    localStorage.setItem('crmVoiceLanguage', next);
  };

  return (
    <div className="fixed top-4 right-5 z-[210]">
      {isOpen && (
        <div className="absolute right-0 top-14 w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-blue-500/20 bg-[#0A0F1C] shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">CRM Voice Assistant</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Navigation & filters</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                stopListening();
                setIsOpen(false);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${isListening ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isListening ? '● Listening now' : 'Ready'}
              </span>

              <select
                value={language}
                onChange={e => changeLanguage(e.target.value)}
                disabled={isListening}
                className="rounded-lg border border-white/10 bg-[#0F172A] px-2 py-1.5 text-[10px] text-slate-300"
                title="Voice recognition language"
              >
                <option value="auto">Auto language</option>
                <option value="en-US">English</option>
                <option value="ka-GE">ქართული</option>
              </select>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Heard</p>
              <p className="text-sm text-slate-200 min-h-5">{heard || '—'}</p>
            </div>

            <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.04] p-3">
              <p className="text-[10px] uppercase tracking-wider text-blue-500 mb-1">Assistant</p>
              <p className="text-xs text-slate-300 leading-relaxed">{result}</p>
            </div>

            <div className="flex gap-2">
              <input
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    executeCommand(command);
                  }
                }}
                placeholder="Or type a command…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/30"
              />
              <button
                type="button"
                onClick={() => executeCommand(command)}
                className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white"
                title="Run command"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[10px] text-slate-600 leading-relaxed">
              Examples: “Show Australia leads”, “Find Robert Couture”, “Show VM leads”, “Open Dashboard”.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleListening}
        className={`w-11 h-11 rounded-xl border shadow-xl flex items-center justify-center transition-colors ${
          isListening
            ? 'bg-emerald-600 border-emerald-400/40 text-white shadow-emerald-500/20'
            : 'bg-[#0F172A] border-blue-500/25 text-blue-400 hover:text-white hover:bg-blue-600'
        }`}
        title={isListening ? 'Stop Voice Assistant' : 'CRM Voice Assistant'}
      >
        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>
    </div>
  );
}

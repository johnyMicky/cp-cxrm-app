import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, X, Send, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { firestoreService } from '../services/firestoreService';

type VoiceAssistantProps = {
  role: string;
};

type RouteRule = {
  path: string;
  roles: string[];
  aliases: string[];
  label: string;
};

type AgentDictionaryItem = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  teamId?: string;
  teamName?: string;
};

type RuntimeDictionary = {
  statuses: string[];
  countries: string[];
  sources: string[];
  agents: AgentDictionaryItem[];
};

const ALL_ROLES = ['Administrator', 'Manager', 'Team Leader', 'Agent', 'Financial Manager'];
const LEAD_ROLES = ['Administrator', 'Manager', 'Team Leader', 'Agent'];
const DICTIONARY_CACHE_KEY = 'cpcrm_voice_core_dictionary_v2';
const LEADS_DICTIONARY_KEY = 'cpcrm_voice_leads_dictionary_v2';
const DICTIONARY_TTL = 10 * 60 * 1000;

const ROUTES: RouteRule[] = [
  {
    path: '/',
    roles: ALL_ROLES,
    label: 'Dashboard',
    aliases: ['dashboard', 'home', 'overview', 'start page', 'startseite', 'übersicht', 'uebersicht']
  },
  {
    path: '/leads',
    roles: LEAD_ROLES,
    label: 'Leads',
    aliases: ['leads', 'lead list', 'clients', 'customers', 'kunden', 'kundenliste', 'kontakte']
  },
  {
    path: '/lost',
    roles: LEAD_ROLES,
    label: 'Lost',
    aliases: ['lost', 'lost leads', 'verloren', 'verlorene leads']
  },
  {
    path: '/jor',
    roles: LEAD_ROLES,
    label: 'JOR',
    aliases: ['jor']
  },
  {
    path: '/finance',
    roles: ['Administrator', 'Manager', 'Team Leader', 'Financial Manager'],
    label: 'Finance',
    aliases: ['finance', 'financial', 'finances', 'finanzen', 'finanzbereich']
  },
  {
    path: '/live-calls',
    roles: ['Administrator', 'Manager', 'Team Leader'],
    label: 'Live Calls',
    aliases: ['live calls', 'live call', 'call monitor', 'calls monitor', 'live anrufe', 'anrufmonitor', 'live-anrufe']
  },
  {
    path: '/secure-info',
    roles: ALL_ROLES,
    label: 'Secure Info',
    aliases: ['secure info', 'secure information', 'sichere informationen', 'sicherheitsinformationen']
  },
  {
    path: '/team',
    roles: ['Administrator', 'Team Leader'],
    label: 'Team',
    aliases: ['team', 'team page', 'teamseite']
  },
  {
    path: '/imports',
    roles: ['Administrator', 'Manager', 'Team Leader'],
    label: 'Lead Files',
    aliases: ['lead files', 'imports', 'files', 'lead dateien', 'importe', 'dateien']
  },
  {
    path: '/dispatcher',
    roles: ['Administrator', 'Manager'],
    label: 'Dispatcher',
    aliases: ['dispatcher', 'dispatch']
  },
  {
    path: '/activity',
    roles: ['Administrator', 'Manager'],
    label: 'Activity',
    aliases: ['activity', 'activities', 'aktivität', 'aktivitaet', 'aktivitäten', 'aktivitaeten']
  },
  {
    path: '/work-logs',
    roles: ['Administrator', 'Manager', 'Team Leader', 'Financial Manager'],
    label: 'Work Logs',
    aliases: ['work logs', 'work log', 'arbeitsprotokolle', 'arbeitslogs']
  },
  {
    path: '/security-logs',
    roles: ['Administrator'],
    label: 'Security Logs',
    aliases: ['security logs', 'security log', 'sicherheitslogs', 'sicherheitsprotokolle']
  },
  {
    path: '/settings',
    roles: ['Administrator'],
    label: 'Settings',
    aliases: ['settings', 'setting', 'configuration', 'einstellungen', 'konfiguration']
  }
];

const STATIC_COUNTRIES: Array<{ value: string; aliases: string[] }> = [
  { value: 'Australia', aliases: ['australia', 'australian', 'australians', 'australien', 'australisch', 'australische'] },
  { value: 'Canada', aliases: ['canada', 'canadian', 'canadians', 'kanada', 'kanadisch', 'kanadische'] },
  { value: 'Germany', aliases: ['germany', 'german', 'germans', 'deutschland', 'deutsch', 'deutsche'] },
  { value: 'Austria', aliases: ['austria', 'austrian', 'austrians', 'österreich', 'oesterreich', 'österreichisch', 'oesterreichisch'] },
  { value: 'Switzerland', aliases: ['switzerland', 'swiss', 'schweiz', 'schweizer', 'schweizerisch'] },
  { value: 'United Kingdom', aliases: ['united kingdom', 'uk', 'great britain', 'britain', 'british', 'großbritannien', 'grossbritannien', 'vereinigtes königreich', 'vereinigtes koenigreich'] },
  { value: 'United States', aliases: ['united states', 'usa', 'u s a', 'america', 'american', 'vereinigte staaten', 'amerika', 'amerikanisch'] },
  { value: 'France', aliases: ['france', 'french', 'frankreich', 'französisch', 'franzoesisch'] },
  { value: 'Spain', aliases: ['spain', 'spanish', 'spanien', 'spanisch'] },
  { value: 'Italy', aliases: ['italy', 'italian', 'italien', 'italienisch'] },
  { value: 'Netherlands', aliases: ['netherlands', 'dutch', 'niederlande', 'niederländisch', 'niederlaendisch'] },
  { value: 'Belgium', aliases: ['belgium', 'belgian', 'belgien', 'belgisch'] },
  { value: 'Ireland', aliases: ['ireland', 'irish', 'irland', 'irisch'] },
  { value: 'Portugal', aliases: ['portugal', 'portuguese', 'portugiesisch'] },
  { value: 'Poland', aliases: ['poland', 'polish', 'polen', 'polnisch'] },
  { value: 'Sweden', aliases: ['sweden', 'swedish', 'schweden', 'schwedisch'] },
  { value: 'Norway', aliases: ['norway', 'norwegian', 'norwegen', 'norwegisch'] },
  { value: 'Denmark', aliases: ['denmark', 'danish', 'dänemark', 'daenemark', 'dänisch', 'daenisch'] },
  { value: 'Finland', aliases: ['finland', 'finnish', 'finnisch'] },
  { value: 'New Zealand', aliases: ['new zealand', 'new zealander', 'neuseeland', 'neuseeländisch', 'neuseelaendisch'] }
];

const STATUS_SYNONYMS: Record<string, string[]> = {
  'new': ['new', 'new leads', 'new status', 'neu', 'neue leads', 'neue kunden'],
  'in process': ['in process', 'processing', 'in progress', 'in bearbeitung', 'bearbeitung'],
  'vm': ['vm', 'voicemail', 'voice mail', 'mailbox', 'anrufbeantworter', 'voicemail status'],
  'no answer': ['no answer', 'unanswered', 'not answered', 'no response', 'keine antwort', 'nicht erreicht', 'keine reaktion'],
  'deposit': ['deposit', 'deposits', 'depositor', 'einzahlung', 'einzahlungen', 'eingezahlt'],
  'callback': ['callback', 'callbacks', 'call back', 'rückruf', 'rueckruf', 'rückrufe', 'rueckrufe'],
  'low potential': ['low potential', 'geringes potenzial', 'niedriges potenzial'],
  'high potential': ['high potential', 'hohes potenzial', 'hohe chance'],
  'no potential': ['no potential', 'kein potenzial', 'ohne potenzial'],
  'language barrier': ['language barrier', 'sprachbarriere', 'sprachproblem'],
  'wrong person': ['wrong person', 'falsche person', 'falscher kontakt'],
  'underage': ['underage', 'minor', 'minderjährig', 'minderjaehrig'],
  'no experience': ['no experience', 'keine erfahrung', 'ohne erfahrung'],
  'not interested': ['not interested', 'uninterested', 'nicht interessiert', 'kein interesse'],
  'hung up': ['hung up', 'hang up', 'aufgelegt', 'hat aufgelegt'],
  'wrong number': ['wrong number', 'incorrect number', 'falsche nummer', 'falsche telefonnummer'],
  'drop': ['drop', 'dropped', 'abbruch', 'abgebrochen'],
  'jor': ['jor']
};

const NAVIGATION_WORDS = [
  'open', 'go to', 'take me to', 'navigate to', 'switch to', 'bring up',
  'öffne', 'oeffne', 'geh zu', 'gehe zu', 'bring mich zu', 'wechsel zu', 'zeige mir die seite'
];

const LEAD_CONTEXT_WORDS = [
  'lead', 'leads', 'client', 'clients', 'customer', 'customers',
  'kunde', 'kunden', 'kontakt', 'kontakte'
];

const FILTER_WORDS = [
  'show', 'show me', 'find', 'give me', 'list', 'display', 'filter', 'only', 'i need', 'i want',
  'zeige', 'zeig', 'zeig mir', 'finde', 'gib mir', 'liste', 'filtere', 'filter', 'nur', 'ich brauche', 'ich will', 'ich möchte', 'ich moechte'
];

const SEARCH_PATTERNS = [
  /(?:find|search(?: for)?|look up|lookup|locate)\s+(.+)/i,
  /(?:find client|find customer|find lead|search client|search customer|search lead)\s+(.+)/i,
  /(?:finde|suche(?: nach)?|such(?:e)?(?: nach)?|lokalisiere)\s+(.+)/i,
  /(?:finde kunde|suche kunde|finde lead|suche lead)\s+(.+)/i
];

const QUICK_VIEWS: Array<{
  aliases: string[];
  params: Record<string, string>;
  label: string;
}> = [
  {
    aliases: ['new today', 'today new leads', "today's new leads", 'new leads today', 'heute neue leads', 'neue leads heute', 'heutige neue leads'],
    params: { view: 'new-today' },
    label: 'New Today'
  },
  {
    aliases: ['callbacks today', "today's callbacks", 'callbacks for today', 'heutige rückrufe', 'heutige rueckrufe', 'rückrufe heute', 'rueckrufe heute'],
    params: { view: 'callbacks-today' },
    label: 'Callbacks Today'
  },
  {
    aliases: ['unassigned', 'unassigned leads', 'not assigned', 'nicht zugewiesen', 'nicht zugewiesene leads', 'ohne zuweisung'],
    params: { view: 'unassigned' },
    label: 'Unassigned Leads'
  },
  {
    aliases: ['overdue callbacks', 'late callbacks', 'overdue call backs', 'überfällige rückrufe', 'ueberfaellige rueckrufe', 'verspätete rückrufe', 'verspaetete rueckrufe'],
    params: { view: 'overdue-callbacks' },
    label: 'Overdue Callbacks'
  },
  {
    aliases: ['untouched leads', 'untouched 24 hours', 'not touched for 24 hours', '24 hour untouched', '24 stunden nicht bearbeitet', 'seit 24 stunden nicht bearbeitet'],
    params: { view: 'untouched24h' },
    label: 'Untouched Leads'
  }
];

const normalize = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!,;:()[\]{}"']/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const textIncludesPhrase = (text: string, phrase: string) => {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;

  const paddedText = ` ${text} `;
  const paddedPhrase = ` ${normalizedPhrase} `;
  return paddedText.includes(paddedPhrase);
};

const includesAny = (text: string, values: string[]) =>
  values.some(value => textIncludesPhrase(text, value));

const uniqueStrings = (values: string[]) =>
  Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));

const mergeAgents = (...lists: AgentDictionaryItem[][]) => {
  const map = new Map<string, AgentDictionaryItem>();

  lists.flat().forEach(agent => {
    const id = String(agent?.id || '').trim();
    if (!id) return;
    map.set(id, {
      ...map.get(id),
      ...agent,
      id
    });
  });

  return Array.from(map.values());
};

const readSessionDictionary = (): Partial<RuntimeDictionary> => {
  try {
    const raw = sessionStorage.getItem(LEADS_DICTIONARY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);

    return {
      countries: Array.isArray(parsed?.countries) ? parsed.countries : [],
      sources: Array.isArray(parsed?.sources) ? parsed.sources : [],
      statuses: Array.isArray(parsed?.statuses) ? parsed.statuses : [],
      agents: Array.isArray(parsed?.agents) ? parsed.agents : []
    };
  } catch {
    return {};
  }
};

const matchCountry = (text: string, runtimeCountries: string[]) => {
  for (const item of STATIC_COUNTRIES) {
    if (item.aliases.some(alias => textIncludesPhrase(text, alias))) {
      const runtimeMatch = runtimeCountries.find(
        country =>
          normalize(country) === normalize(item.value) ||
          item.aliases.some(alias => normalize(country) === normalize(alias))
      );
      return runtimeMatch || item.value;
    }
  }

  const sortedRuntime = [...runtimeCountries].sort((a, b) => b.length - a.length);
  return sortedRuntime.find(country => textIncludesPhrase(text, country)) || '';
};

const matchStatus = (text: string, runtimeStatuses: string[]) => {
  const sorted = [...runtimeStatuses].sort((a, b) => b.length - a.length);

  for (const status of sorted) {
    const aliases = uniqueStrings([
      status,
      ...(STATUS_SYNONYMS[normalize(status)] || [])
    ]);

    if (aliases.some(alias => textIncludesPhrase(text, alias))) {
      return status;
    }
  }

  for (const [canonicalKey, aliases] of Object.entries(STATUS_SYNONYMS)) {
    if (!aliases.some(alias => textIncludesPhrase(text, alias))) continue;

    const runtime = runtimeStatuses.find(status => normalize(status) === canonicalKey);
    if (runtime) return runtime;
  }

  return '';
};

const matchSource = (text: string, sources: string[]) => {
  const sorted = [...sources]
    .filter(source => normalize(source).length >= 3)
    .sort((a, b) => b.length - a.length);

  return sorted.find(source => textIncludesPhrase(text, source)) || '';
};

const matchAgent = (text: string, agents: AgentDictionaryItem[]) => {
  const normalizedAgents = agents
    .map(agent => {
      const name = String(agent?.name || '').trim();
      const email = String(agent?.email || '').trim();
      const parts = name.split(/\s+/).filter(Boolean);

      return {
        agent,
        fullName: normalize(name),
        email: normalize(email),
        firstName: normalize(parts[0] || ''),
        lastName: normalize(parts[parts.length - 1] || '')
      };
    })
    .filter(item => item.fullName || item.email);

  // Full names and emails are safest.
  const fullMatch = normalizedAgents
    .sort((a, b) => b.fullName.length - a.fullName.length)
    .find(item =>
      (item.fullName && textIncludesPhrase(text, item.fullName)) ||
      (item.email && textIncludesPhrase(text, item.email))
    );

  if (fullMatch) return fullMatch.agent;

  // A unique first name is also safe enough for conversational commands.
  const firstNameCounts = new Map<string, number>();
  normalizedAgents.forEach(item => {
    if (!item.firstName) return;
    firstNameCounts.set(item.firstName, (firstNameCounts.get(item.firstName) || 0) + 1);
  });

  const uniqueFirst = normalizedAgents.find(
    item =>
      item.firstName &&
      firstNameCounts.get(item.firstName) === 1 &&
      textIncludesPhrase(text, item.firstName)
  );

  return uniqueFirst?.agent || null;
};

const extractFreeSearch = (raw: string) => {
  for (const pattern of SEARCH_PATTERNS) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;

    const cleaned = match[1]
      .replace(/\b(client|customer|lead|clients|customers|leads)\b/gi, ' ')
      .replace(/\b(kunde|kunden|kontakt|kontakte)\b/gi, ' ')
      .replace(/\b(named|called|name|with name|mit namen|namens)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned) return cleaned;
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
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [coreDictionary, setCoreDictionary] = useState<RuntimeDictionary>({
    statuses: [],
    countries: [],
    sources: [],
    agents: []
  });

  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('crmVoiceLanguage');
    return saved === 'de-DE' ? 'de-DE' : 'en-US';
  });

  const speechSupported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    []
  );

  const canAccess = (route: RouteRule) => route.roles.includes(role);
  const canAccessLeads = LEAD_ROLES.includes(role);

  const loadCoreDictionary = async () => {
    if (!canAccessLeads || dictionaryLoading) return;

    const leadsRuntime = readSessionDictionary();

    try {
      const cachedRaw = sessionStorage.getItem(DICTIONARY_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const age = Date.now() - Number(cached?.updatedAt || 0);

        if (age >= 0 && age < DICTIONARY_TTL) {
          setCoreDictionary({
            statuses: uniqueStrings([
              ...(cached?.statuses || []),
              ...(leadsRuntime.statuses || [])
            ]),
            countries: uniqueStrings(leadsRuntime.countries || []),
            sources: uniqueStrings(leadsRuntime.sources || []),
            agents: mergeAgents(
              Array.isArray(cached?.agents) ? cached.agents : [],
              Array.isArray(leadsRuntime.agents) ? leadsRuntime.agents : []
            )
          });
          return;
        }
      }
    } catch {
      // Ignore cache corruption.
    }

    try {
      setDictionaryLoading(true);

      const live = await firestoreService.getVoiceAssistantDictionary({
        id: localStorage.getItem('userId'),
        role,
        teamId: localStorage.getItem('userTeamId')
      });

      const next: RuntimeDictionary = {
        statuses: uniqueStrings([
          ...(live?.statuses || []),
          ...(leadsRuntime.statuses || [])
        ]),
        countries: uniqueStrings(leadsRuntime.countries || []),
        sources: uniqueStrings(leadsRuntime.sources || []),
        agents: mergeAgents(
          Array.isArray(live?.agents) ? live.agents : [],
          Array.isArray(leadsRuntime.agents) ? leadsRuntime.agents : []
        )
      };

      setCoreDictionary(next);

      try {
        sessionStorage.setItem(
          DICTIONARY_CACHE_KEY,
          JSON.stringify({
            updatedAt: Date.now(),
            statuses: next.statuses,
            agents: next.agents
          })
        );
      } catch {
        // Cache is optional.
      }
    } catch (error) {
      console.error('Voice Assistant dictionary load failed:', error);

      setCoreDictionary(current => ({
        statuses: uniqueStrings([
          ...current.statuses,
          ...(leadsRuntime.statuses || [])
        ]),
        countries: uniqueStrings(leadsRuntime.countries || []),
        sources: uniqueStrings(leadsRuntime.sources || []),
        agents: mergeAgents(
          current.agents,
          Array.isArray(leadsRuntime.agents) ? leadsRuntime.agents : []
        )
      }));
    } finally {
      setDictionaryLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !canAccessLeads) return;
    loadCoreDictionary();
  }, [isOpen, role]);

  const runtimeDictionary = () => {
    const pageDictionary = readSessionDictionary();

    return {
      statuses: uniqueStrings([
        ...coreDictionary.statuses,
        ...(pageDictionary.statuses || [])
      ]),
      countries: uniqueStrings([
        ...coreDictionary.countries,
        ...(pageDictionary.countries || [])
      ]),
      sources: uniqueStrings([
        ...coreDictionary.sources,
        ...(pageDictionary.sources || [])
      ]),
      agents: mergeAgents(
        coreDictionary.agents,
        Array.isArray(pageDictionary.agents) ? pageDictionary.agents : []
      )
    };
  };

  const executeCommand = (rawCommand: string) => {
    const raw = String(rawCommand || '').trim();
    const text = normalize(raw);

    if (!text) {
      setResult('Say or type a command first.');
      return;
    }

    setHeard(raw);

    const dictionary = runtimeDictionary();

    // 1. Quick CRM views before generic entity/search parsing.
    const quickView = QUICK_VIEWS.find(item =>
      item.aliases.some(alias => textIncludesPhrase(text, alias))
    );

    if (quickView) {
      if (!canAccessLeads) {
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

    // 2. ENTITY-FIRST parsing.
    // This fixes "find Australian leads": Australia is recognized as Country
    // before "find" can be treated as a free client-name search.
    const country = matchCountry(text, dictionary.countries);
    const status = matchStatus(text, dictionary.statuses);
    const source = matchSource(text, dictionary.sources);
    const agent = matchAgent(text, dictionary.agents);

    const hasLeadContext = includesAny(text, LEAD_CONTEXT_WORDS);
    const hasFilterIntent = includesAny(text, FILTER_WORDS);
    const hasLeadEntity = Boolean(country || status || source || agent);

    if (hasLeadEntity && (hasLeadContext || hasFilterIntent || country || status)) {
      if (!canAccessLeads) {
        setResult('Your role does not have access to Leads.');
        return;
      }

      const params = new URLSearchParams({
        voice: String(Date.now())
      });

      if (country) params.set('country', country);
      if (status) params.set('status', status);
      if (source) params.set('source', source);
      if (agent?.id) params.set('agent', agent.id);

      navigate(`/leads?${params.toString()}`);

      const labels = [
        country ? `Country: ${country}` : '',
        status ? `Status: ${status}` : '',
        source ? `Source: ${source}` : '',
        agent ? `Agent: ${agent.name || agent.email}` : ''
      ].filter(Boolean);

      setResult(`Showing Leads — ${labels.join(' · ')}.`);
      setIsOpen(false);
      return;
    }

    // 3. Navigation.
    const navigationIntent = includesAny(text, NAVIGATION_WORDS);

    const matchedRoute = ROUTES.find(route =>
      route.aliases.some(alias => textIncludesPhrase(text, alias))
    );

    if (
      matchedRoute &&
      (
        navigationIntent ||
        matchedRoute.aliases.some(alias => normalize(alias) === text)
      )
    ) {
      if (!canAccess(matchedRoute)) {
        setResult('Your role does not have access to that section.');
        return;
      }

      navigate(matchedRoute.path);
      setResult(`Opened ${matchedRoute.label}.`);
      setIsOpen(false);
      return;
    }

    // 4. Free-text client search is LAST.
    // Only content that was not recognized as a CRM entity reaches this branch.
    const searchTerm = extractFreeSearch(raw);

    if (searchTerm) {
      if (!canAccessLeads) {
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

    setResult(
      language === 'de-DE'
        ? 'Befehl nicht erkannt. Beispiele: „Zeig mir australische Leads“, „Zeig VM Leads aus Kanada“, „Finde Robert Couture“ oder „Öffne Dashboard“.'
        : 'Command not recognized. Try “show Australian leads”, “show Canadian VM leads”, “find Robert Couture”, or “open Dashboard”.'
    );
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch {}

    recognitionRef.current = null;
    setIsListening(false);
  };

  const startListening = () => {
    setIsOpen(true);

    if (!speechSupported) {
      setResult('Voice recognition is not available in this browser. You can type the command below.');
      return;
    }

    stopListening();

    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setResult(language === 'de-DE' ? 'Ich höre zu…' : 'Listening…');
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
          ? (
              language === 'de-DE'
                ? 'Mikrofonzugriff ist blockiert. Bitte erlaube den Mikrofonzugriff im Browser.'
                : 'Microphone permission is blocked. Allow microphone access in the browser.'
            )
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

    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const changeLanguage = (next: string) => {
    const safeLanguage = next === 'de-DE' ? 'de-DE' : 'en-US';
    setLanguage(safeLanguage);
    localStorage.setItem('crmVoiceLanguage', safeLanguage);
  };

  return (
    <div className="fixed top-4 right-5 z-[210]">
      {isOpen && (
        <div className="absolute right-0 top-14 w-[min(410px,calc(100vw-2rem))] rounded-2xl border border-blue-500/20 bg-[#0A0F1C] shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">CRM Voice Assistant</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Dynamic CRM Dictionary
                </p>
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
                {isListening
                  ? (language === 'de-DE' ? '● Hört zu' : '● Listening now')
                  : dictionaryLoading
                    ? (language === 'de-DE' ? 'CRM-Wörterbuch wird geladen…' : 'Loading CRM dictionary…')
                    : (language === 'de-DE' ? 'Bereit' : 'Ready')}
              </span>

              <select
                value={language}
                onChange={event => changeLanguage(event.target.value)}
                disabled={isListening}
                className="rounded-lg border border-white/10 bg-[#0F172A] px-2 py-1.5 text-[10px] text-slate-300"
                title="Voice recognition language"
              >
                <option value="en-US">English</option>
                <option value="de-DE">Deutsch</option>
              </select>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">
                {language === 'de-DE' ? 'Erkannt' : 'Heard'}
              </p>
              <p className="text-sm text-slate-200 min-h-5">{heard || '—'}</p>
            </div>

            <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.04] p-3">
              <p className="text-[10px] uppercase tracking-wider text-blue-500 mb-1">Assistant</p>
              <p className="text-xs text-slate-300 leading-relaxed">{result}</p>
            </div>

            <div className="flex gap-2">
              <input
                value={command}
                onChange={event => setCommand(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    executeCommand(command);
                  }
                }}
                placeholder={language === 'de-DE' ? 'Oder Befehl eingeben…' : 'Or type a command…'}
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
              {language === 'de-DE'
                ? 'Beispiele: „Zeig australische Leads“, „Zeig kanadische VM Leads“, „Zeig Daniels Rückrufe“, „Finde Robert Couture“, „Öffne Dashboard“.'
                : 'Examples: “Show Australian leads”, “Show Canadian VM leads”, “Show Daniel’s callbacks”, “Find Robert Couture”, “Open Dashboard”.'}
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

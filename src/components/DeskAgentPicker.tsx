import { useMemo, useState } from 'react';
import { Search, ChevronDown, Check, Minus } from 'lucide-react';

// Agents grouped by desk. Ticking a desk selects every agent in it; any agent
// can then be unticked individually so they receive (or lose) no leads.

type PickerAgent = {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
  teamId?: string;
  teamName?: string;
};

export default function DeskAgentPicker({
  agents,
  selected,
  onChange,
  counts,
  accent = 'blue',
  maxHeight = 320,
  emptyText = 'No agents available.'
}: {
  agents: PickerAgent[];
  selected: string[];
  onChange: (ids: string[]) => void;
  // Optional number shown next to each agent (e.g. matching leads).
  counts?: Record<string, number>;
  accent?: 'blue' | 'amber';
  maxHeight?: number;
  emptyText?: string;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const tone = accent === 'amber'
    ? { box: 'bg-amber-500 border-amber-400', row: 'bg-amber-500/10', text: 'text-amber-300', link: 'text-amber-300 hover:text-amber-200' }
    : { box: 'bg-blue-600 border-blue-500', row: 'bg-blue-500/10', text: 'text-blue-300', link: 'text-blue-400 hover:text-blue-300' };

  const selectedSet = useMemo(() => new Set(selected.map(String)), [selected]);

  const desks = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, { key: string; name: string; agents: PickerAgent[] }>();

    agents.forEach((agent) => {
      const name = String(agent.teamName || '').trim() || 'No Team';
      const key = String(agent.teamId || '').trim() || `name:${name}`;
      if (!map.has(key)) map.set(key, { key, name, agents: [] });
      map.get(key)!.agents.push(agent);
    });

    return Array.from(map.values())
      .map((desk) => ({
        ...desk,
        agents: desk.agents
          .slice()
          .sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))),
        visible: term
          ? desk.agents.filter((a) =>
              String(a.name || '').toLowerCase().includes(term) ||
              String(a.email || '').toLowerCase().includes(term) ||
              desk.name.toLowerCase().includes(term)
            )
          : desk.agents
      }))
      .filter((desk) => desk.visible.length > 0)
      .sort((a, b) => (a.name === 'No Team' ? 1 : b.name === 'No Team' ? -1 : a.name.localeCompare(b.name)));
  }, [agents, search]);

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set<string>(selectedSet);
    ids.forEach((id) => (on ? next.add(String(id)) : next.delete(String(id))));
    onChange(Array.from(next));
  };

  const toggleDesk = (deskKey: string, ids: string[]) => {
    const allOn = ids.every((id) => selectedSet.has(String(id)));
    setMany(ids, !allOn);
    // Show the agents after ticking a desk, so single agents can be unticked.
    if (!allOn) setExpanded((prev) => ({ ...prev, [deskKey]: true }));
  };

  const allIds = agents.map((a) => String(a.id));

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="p-2 border-b border-white/5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search desk or agent…"
            className="w-full bg-[#111827] border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">{selected.length} selected</span>
        <button type="button" onClick={() => setMany(allIds, true)} className={`text-[11px] shrink-0 ${tone.link}`}>All</button>
        <button type="button" onClick={() => onChange([])} className="text-[11px] shrink-0 text-slate-400 hover:text-white">Clear</button>
      </div>

      <div className="overflow-y-auto custom-scrollbar p-1.5 space-y-1" style={{ maxHeight }}>
        {desks.length === 0 && <p className="text-xs text-slate-500 text-center py-6">{emptyText}</p>}

        {desks.map((desk) => {
          const ids = desk.agents.map((a) => String(a.id));
          const onCount = ids.filter((id) => selectedSet.has(id)).length;
          const state = onCount === 0 ? 'none' : onCount === ids.length ? 'all' : 'some';
          const isOpen = !!search.trim() || !!expanded[desk.key];
          const deskTotal = counts ? ids.reduce((sum, id) => sum + Number(counts[id] || 0), 0) : null;

          return (
            <div key={desk.key} className="rounded-lg border border-white/[0.06] overflow-hidden">
              <div className={`flex items-center gap-2 px-2 py-2 ${state !== 'none' ? tone.row : 'bg-white/[0.02]'}`}>
                <button
                  type="button"
                  onClick={() => toggleDesk(desk.key, ids)}
                  className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 ${
                    state === 'none' ? 'border-white/25' : `${tone.box} text-white`
                  }`}
                  title={state === 'all' ? 'Untick whole desk' : 'Tick whole desk'}
                >
                  {state === 'all' && <Check className="w-3 h-3" />}
                  {state === 'some' && <Minus className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleDesk(desk.key, ids)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="text-xs font-semibold text-white">{desk.name}</span>
                  <span className="text-[11px] text-slate-400 ml-2">
                    {onCount}/{ids.length} agents{deskTotal !== null ? ` · ${deskTotal} leads` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [desk.key]: !prev[desk.key] }))}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5"
                  title={isOpen ? 'Hide agents' : 'Show agents'}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isOpen && (
                <div className="py-1">
                  {desk.visible.map((agent) => {
                    const on = selectedSet.has(String(agent.id));
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setMany([String(agent.id)], !on)}
                        className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-left hover:bg-white/[0.04]"
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? `${tone.box} text-white` : 'border-white/25'}`}>
                          {on && <Check className="w-2.5 h-2.5" />}
                        </span>
                        {agent.avatar && <img src={agent.avatar} alt="" className="w-5 h-5 rounded-full shrink-0" />}
                        <span className={`text-xs truncate ${on ? 'text-white' : 'text-slate-500'}`}>
                          {agent.name || agent.email || agent.id}
                        </span>
                        {counts && (
                          <span className="ml-auto text-[10px] tabular-nums text-slate-500 shrink-0">{Number(counts[String(agent.id)] || 0)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

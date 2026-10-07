import { useState } from 'react';
import { Archive, ArchiveRestore, Building2, Check, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ProjectRow } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Sheet, SheetHeader, SheetLabel } from '../components/ui/Sheet.tsx';
import { SuggestInput } from '../components/ui/SuggestInput.tsx';
import { useAppState } from '../state/AppState.tsx';

const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pick the project to work on, start a new one, or open one's details. */
export function ProjectsSheet({ onClose, onNew, onEdit, backEnabled = true }: { onClose(): void; onNew(): void; onEdit(project: ProjectRow): void; backEnabled?: boolean }) {
  const { projects, projectId, projectSummary, actions } = useAppState();
  const ongoing = projects.filter((p) => p.status === 'active');
  const closed = projects.filter((p) => p.status === 'closed');

  const pick = (id: string) => {
    actions.openProject(id);
    onClose();
  };

  const row = (p: ProjectRow) => {
    const s = projectSummary(p.id);
    const current = p.id === projectId;
    return (
      <div key={p.id} className={`flex items-center gap-1 rounded-xl border ${current ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
        <button onClick={() => pick(p.id)} aria-current={current ? 'true' : undefined} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-14 text-left">
          {current ? <Check size={20} className="text-orange-600 shrink-0" /> : <Building2 size={20} className="text-gray-400 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-gray-900 truncate">{p.name}</span>
            {p.address && p.address !== p.name && <span className="block text-xs text-gray-500 truncate">{p.address}</span>}
            <span className="block text-xs text-gray-500">
              {plural(s.lists, 'saved list', 'saved lists')}
              {s.contracts > 0 && ` · ${plural(s.contracts, 'contract', 'contracts')}`}
              {s.spent > 0 && (
                <>
                  {' · '}
                  <span className="font-mono">{rupees(s.spent)}</span>
                </>
              )}
            </span>
          </span>
        </button>
        <button onClick={() => onEdit(p)} className="p-2.5 mr-1 text-gray-500 hover:text-gray-800 shrink-0" aria-label={`Edit project ${p.name}`}>
          <Pencil size={16} />
        </button>
      </div>
    );
  };

  return (
    <Sheet labelledBy="projects-title" onClose={onClose} backEnabled={backEnabled} closeOnBackdrop layer="under" className="p-4 gap-3">
      <SheetHeader
        id="projects-title"
        title="Projects"
        subtitle="Each project keeps its own purchases, BOQs, labour contracts and saved lists. Rates are shared by all projects."
        onClose={onClose}
      />
      <div className="space-y-2">{ongoing.map(row)}</div>
      {closed.length > 0 && (
        <div className="space-y-2">
          <SheetLabel>Closed</SheetLabel>
          {closed.map(row)}
        </div>
      )}
      <Button variant="primary" block onClick={onNew}>
        <Plus size={16} /> New project
      </Button>
    </Sheet>
  );
}

/** Start a project, or rename one, change its site address, close or delete it. */
export function ProjectForm({ project, onClose }: { project?: ProjectRow; onClose(): void }) {
  const { projects, projectSummary, allAddresses, actions } = useAppState();
  const dialogs = useDialogs();
  const [name, setName] = useState(project?.name ?? '');
  const [address, setAddress] = useState(project?.address ?? '');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!name.trim() && !address.trim()) return void (await dialogs.alert('Enter a name for the project', 'e.g. Sharma house, Sector 44'));
      const id = await actions.saveProject({ name, address }, project?.id);
      if (!project) {
        actions.openProject(id);
        dialogs.toast(`Started “${name.trim() || address.trim()}”`);
      }
      onClose();
    });

  const setStatus = () =>
    run(async () => {
      if (!project) return;
      await actions.setProjectStatus(project.id, project.status === 'active' ? 'closed' : 'active');
      onClose();
    });

  const remove = () =>
    run(async () => {
      if (!project) return;
      const s = projectSummary(project.id);
      const parts = [plural(s.lists, 'saved list', 'saved lists'), plural(s.contracts, 'labour contract', 'labour contracts')];
      const ok = await dialogs.confirm(`Delete “${project.name}”?`, {
        message: `${parts.join(' and ')}, the open purchase list and BOQ of this project will be removed from this phone. Prices in Rates stay.`,
        confirmLabel: 'Delete project',
        danger: true,
      });
      if (!ok) return;
      await actions.deleteProject(project.id);
      dialogs.toast('Project deleted');
      onClose();
    });

  const label = 'text-xs text-gray-600 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500';

  return (
    <Sheet labelledBy="project-form-title" onClose={onClose} busy={busy} className="p-5 space-y-4">
      <SheetHeader
        id="project-form-title"
        icon={<Building2 size={18} className="text-orange-500" />}
        title={project ? 'Project details' : 'New project'}
        onClose={onClose}
        closeDisabled={busy}
      />
      <label className="block">
        <span className={label}>Name</span>
        <input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} className={`${input} font-bold`} placeholder="e.g. Sharma house" />
      </label>
      <label className="block">
        <span className={label}>Site address</span>
        <div className="relative">
          <MapPin size={14} className="absolute left-3 top-3.5 text-gray-500 pointer-events-none" />
          <SuggestInput
            aria-label="Site address"
            value={address}
            onChange={setAddress}
            suggestions={allAddresses}
            className={`${input} pl-9`}
            placeholder="e.g. Sector 44, Gurgaon"
          />
        </div>
        <span className="block text-xs text-gray-500 mt-1">Filled in when you save a list or add a contract in this project.</span>
      </label>
      <Button variant="primary" block onClick={save} disabled={busy}>
        {project ? 'Save changes' : 'Start project'}
      </Button>
      {project && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={setStatus} disabled={busy}>
            {project.status === 'active' ? (
              <>
                <Archive size={14} /> Close
              </>
            ) : (
              <>
                <ArchiveRestore size={14} /> Reopen
              </>
            )}
          </Button>
          <Button variant="dangerOutline" onClick={remove} disabled={busy || projects.length < 2}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      )}
      {project && projects.length < 2 && <p className="text-xs text-gray-500 text-center">The only project can't be deleted. Start another one first.</p>}
    </Sheet>
  );
}

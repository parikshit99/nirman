import { createContext, useContext, useState, type ReactNode } from 'react';
import { prefs } from '@nirman/core';
import { Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import type { ProjectRow } from '@nirman/shared';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { Field, SuggestInput } from '../components/ui/fields';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { plural, rupeesWhole } from '../lib/format';
import { haptic } from '../lib/haptics';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';


/** Projects pinned to the top of the list, newest pin first. Kept on this phone (like the theme), not in backups. */
const PINNED_PREF = 'nirmaan_pinned_projects';

/** Pick the project to work on, start a new one, or open one's details. */
export function ProjectsSheet({ onClose, onNew, onEdit, backEnabled = true }: { onClose(): void; onNew(): void; onEdit(project: ProjectRow): void; backEnabled?: boolean }) {
  const c = useColors();
  const { projects, projectId, projectSummary, actions } = useAppState();
  const dialogs = useDialogs();
  const [pinned, setPinned] = useState<string[]>(() => prefs.get<string[]>(PINNED_PREF, []));
  // Pinned projects first (as pinned chats in Telegram), then the rest as before.
  const pinRank = (id: string) => (pinned.includes(id) ? pinned.indexOf(id) : Infinity);
  const ongoing = projects.filter((p) => p.status === 'active').sort((a, b) => pinRank(a.id) - pinRank(b.id));
  const closed = projects.filter((p) => p.status === 'closed');
  // Closed projects fold into one row, as Telegram's archive does, unless the open project is one of them.
  const [showClosed, setShowClosed] = useState(() => closed.some((p) => p.id === projectId));
  const togglePin = (p: ProjectRow) => {
    haptic('confirm');
    const next = pinned.includes(p.id) ? pinned.filter((id) => id !== p.id) : [p.id, ...pinned];
    prefs.set(PINNED_PREF, next);
    setPinned(next);
    dialogs.toast(next.includes(p.id) ? `Pinned “${p.name}” to the top` : `Unpinned “${p.name}”`);
  };

  const pick = (id: string) => {
    actions.openProject(id);
    onClose();
  };

  const row = (p: ProjectRow) => {
    const s = projectSummary(p.id);
    const current = p.id === projectId;
    return (
      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: current ? c.orange400 : c.gray200, backgroundColor: current ? c.orange50 : c.gray50 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: current }} accessibilityHint={p.status === 'active' ? 'Long press to pin or unpin' : undefined} onPress={() => pick(p.id)} onLongPress={p.status === 'active' ? () => togglePin(p) : undefined} style={{ flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 }}>
          <Icon name={current ? 'check' : 'apartment'} size={20} color={current ? c.orange600 : c.gray400} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.gray900 }}>
                {p.name}
              </Text>
              {pinned.includes(p.id) && p.status === 'active' && <Icon name="push-pin" size={14} color={c.gray500} />}
            </View>
            {p.address && p.address !== p.name ? (
              <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray500 }}>
                {p.address}
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, color: c.gray500 }}>
              {plural(s.lists, 'saved list')}
              {s.contracts > 0 && ` · ${plural(s.contracts, 'contract')}`}
              {s.spent > 0 && ` · ${rupeesWhole(s.spent)}`}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit project ${p.name}`} onPress={() => onEdit(p)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="edit" size={18} color={c.gray500} />
        </Pressable>
      </View>
    );
  };

  return (
    <Sheet label="Projects" onClose={onClose} backEnabled={backEnabled} closeOnBackdrop>
      <SheetHeader title="Projects" subtitle="Each project keeps its own purchases, BOQs, labour contracts and saved lists. Rates are shared by all projects. Long press a project to pin it to the top." onClose={onClose} />
      <View style={{ gap: 8 }}>{ongoing.map(row)}</View>
      {closed.length > 0 && (
        <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showClosed }} onPress={() => setShowClosed(!showClosed)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.gray50 }}>
            <Icon name="archive" size={20} color={c.gray500} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.gray700 }}>Closed projects ({closed.length})</Text>
            <Icon name={showClosed ? 'expand-less' : 'expand-more'} size={22} color={c.gray500} />
          </Pressable>
          {showClosed && closed.map(row)}
        </View>
      )}
      <Button variant="primary" block icon="add" onPress={onNew}>
        New project
      </Button>
    </Sheet>
  );
}

/** Start a project, or rename one, change its site address, close or delete it. */
export function ProjectForm({ project, onClose }: { project?: ProjectRow; onClose(): void }) {
  const c = useColors();
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
      const parts = [plural(s.lists, 'saved list'), plural(s.contracts, 'labour contract')];
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

  return (
    <Sheet label={project ? 'Project details' : 'New project'} onClose={onClose} busy={busy} padding={20} gap={16}>
      <SheetHeader icon="apartment" title={project ? 'Project details' : 'New project'} onClose={onClose} closeDisabled={busy} />
      <Field label="Name" bold value={name} onChangeText={setName} placeholder="e.g. Sharma house" />
      <View>
        <SuggestInput label="Site address" value={address} onChange={setAddress} suggestions={allAddresses} placeholder="e.g. Sector 44, Gurgaon" />
        <Text style={{ fontSize: 12, color: c.gray500, marginTop: 4 }}>Filled in when you save a list or add a contract in this project.</Text>
      </View>
      <Button variant="primary" block disabled={busy} onPress={save}>
        {project ? 'Save changes' : 'Start project'}
      </Button>
      {project && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button style={{ flex: 1 }} icon={project.status === 'active' ? 'archive' : 'unarchive'} disabled={busy} onPress={setStatus}>
            {project.status === 'active' ? 'Close' : 'Reopen'}
          </Button>
          <Button variant="dangerOutline" style={{ flex: 1 }} icon="delete-outline" disabled={busy || projects.length < 2} onPress={remove}>
            Delete
          </Button>
        </View>
      )}
      {project && projects.length < 2 && <Text style={{ fontSize: 12, color: c.gray500, textAlign: 'center' }}>The only project can't be deleted. Start another one first.</Text>}
    </Sheet>
  );
}

const ProjectsContext = createContext<{ open(): void } | null>(null);

/** The Projects sheet and the form it opens, for every tab: `useProjectsSheet().open()` from any header. */
export function ProjectsHost({ children }: { children: ReactNode }) {
  const [listOpen, setListOpen] = useState(false);
  const [form, setForm] = useState<{ project?: ProjectRow } | null>(null);
  return (
    <ProjectsContext.Provider value={{ open: () => setListOpen(true) }}>
      {children}
      {listOpen && <ProjectsSheet backEnabled={!form} onClose={() => setListOpen(false)} onNew={() => setForm({})} onEdit={(p) => setForm({ project: p })} />}
      {form && (
        <ProjectForm
          project={form.project}
          onClose={() => {
            setForm(null);
            setListOpen(false);
          }}
        />
      )}
    </ProjectsContext.Provider>
  );
}

export function useProjectsSheet() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjectsSheet outside ProjectsHost');
  return ctx;
}

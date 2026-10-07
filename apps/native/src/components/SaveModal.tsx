import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ListMeta } from '@nirman/core';
import { useColors } from '../theme';
import { Button } from './ui/Button';
import { Field, SuggestInput } from './ui/fields';
import { DateField, Select } from './ui/Select';
import { Sheet, SheetHeader } from './ui/Sheet';

interface Props {
  initial: ListMeta;
  categories: string[];
  recentAddresses: string[];
  /** Editing an existing record (shows "Update" instead of "Save"). */
  editing: boolean;
  /** Offer "Save as a new list" next to "Update saved list". */
  allowSaveAsNew: boolean;
  /** Used for the automatic title when left blank, e.g. "BOQ 30/09/2026". */
  titlePrefix: string;
  /**
   * Purchase lists: one vendor for every line, prefilled when the lines agree. A bill read by the AI can carry the
   * buyer's name as vendor; picking the vendor here fixes all lines.
   */
  vendor?: { initial: string; mixed: boolean; known: string[] };
  /** Saved lists: the project it is in, to move it to another (shown when there are several). */
  project?: { id: string; options: { id: string; name: string }[] };
  /** Saved lists: Delete sits here rather than on the list card, so it isn't tapped by accident. */
  onDelete?(): void;
  /** `vendor` is undefined when left as it was; `projectId` when the list was moved to another project. */
  onSave(meta: ListMeta, asNew: boolean, vendor?: string, projectId?: string): void;
  onClose(): void;
}

export function SaveModal({ initial, categories, recentAddresses, editing, allowSaveAsNew, titlePrefix, vendor, project, onDelete, onSave, onClose }: Props) {
  const c = useColors();
  const [meta, setMeta] = useState(initial);
  const [projectId, setProjectId] = useState(project?.id ?? '');
  const [vendorName, setVendorName] = useState(vendor?.initial ?? '');
  const set = (field: keyof ListMeta) => (value: string) => setMeta((p) => ({ ...p, [field]: value }));

  const submit = (asNew: boolean) => {
    const autoTitle = `${titlePrefix} ${meta.site_date.split('-').reverse().join('/')}`.trim();
    const nextVendor = vendorName.trim();
    const vendorChanged = !!vendor && !!nextVendor && (vendor.mixed || nextVendor !== vendor.initial);
    onSave({ ...meta, title: meta.title.trim() || autoTitle, address: meta.address.trim() }, asNew, vendorChanged ? nextVendor : undefined, project && projectId !== project.id ? projectId : undefined);
  };

  const suggestions = meta.address ? recentAddresses.filter((a) => a.toLowerCase().includes(meta.address.toLowerCase()) && a !== meta.address) : recentAddresses.slice(0, 5);

  return (
    <Sheet label={editing ? 'List details' : 'Save list'} onClose={onClose} padding={20} gap={16}>
      <SheetHeader icon="assignment-turned-in" title={editing ? 'List details' : 'Save list'} onClose={onClose} />

      <Field label="Name" value={meta.title} onChangeText={set('title')} selectTextOnFocus placeholder="e.g. Cement order, Site visit" />

      <View>
        <Field label="Site address" value={meta.address} onChangeText={set('address')} placeholder="e.g. Sector 44, Gurgaon" />
        {suggestions.length > 0 && (
          <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map((addr) => (
              <Pressable key={addr} accessibilityRole="button" onPress={() => setMeta((p) => ({ ...p, address: addr }))} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray100 }}>
                <Text style={{ fontSize: 12, color: c.gray600 }}>{addr}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {project && project.options.length > 1 && <Select label="Project" value={projectId} options={project.options.map((p) => ({ value: p.id, label: p.name }))} onChange={setProjectId} />}

      {vendor && (
        <View>
          <SuggestInput label="Vendor" value={vendorName} onChange={setVendorName} suggestions={vendor.known} placeholder={vendor.mixed ? 'Several: each line keeps its own' : 'Who sold it'} />
          <Text style={{ fontSize: 12, color: c.gray500, marginTop: 4 }}>{vendor.mixed ? 'Type or pick one to put it on every line.' : 'Applies to every line in the list.'}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Select label="Work type" value={meta.category} options={[...new Set([meta.category, ...categories])].filter(Boolean).map((cat) => ({ value: cat, label: cat }))} onChange={set('category')} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="Date" value={meta.site_date} onChange={set('site_date')} />
        </View>
      </View>

      <View style={{ gap: 12, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="save" style={{ flex: 2 }} onPress={() => submit(false)}>
            {editing ? 'Update saved list' : 'Save'}
          </Button>
        </View>
        {allowSaveAsNew && (
          <Button block icon="content-copy" onPress={() => submit(true)}>
            Save as a new list
          </Button>
        )}
        {onDelete && (
          <Button variant="dangerOutline" block icon="delete-outline" onPress={onDelete}>
            Delete this list
          </Button>
        )}
      </View>
    </Sheet>
  );
}


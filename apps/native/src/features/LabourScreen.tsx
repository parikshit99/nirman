import { FlashList } from '@shopify/flash-list';
import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { contractTotals, sumTotals, type ContractRow, type ContractTotals } from '@nirman/shared';
import { prefs } from '@nirman/core';
import { ContractForm } from '../components/ContractForm';
import { FilterChips } from '../components/FilterChips';
import { ScreenHeader } from '../components/ScreenHeader';
import { UndoButton } from '../components/UndoButton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import type { MenuItem } from '../components/ui/OverflowMenu';
import { Tabs } from '../components/ui/Tabs';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { ContractSheet } from './ContractSheet';
import { useSiteReport } from './SiteReport';

export const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

type StatusFilter = 'active' | 'closed' | 'all';

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'active', label: 'Ongoing' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

/** Balance due, or a warning when more was paid than the work measured is worth. */
export function BalanceText({ balance, align }: { balance: number; align?: 'right' }) {
  const c = useColors();
  const style = { textAlign: align, fontWeight: '700' as const, fontSize: 12, fontFamily: 'monospace' };
  if (balance < 0) return <Text style={[style, { color: c.red600 }]}>Paid ahead {rupees(-balance)}</Text>;
  return <Text style={[style, { color: balance > 0 ? c.red600 : c.green700 }]}>{balance > 0 ? `Due ${rupees(balance)}` : 'Settled'}</Text>;
}

/** The Labour tab: contracts as cards (who, what and where, progress, and what is owed) and the button to add one. */
export function LabourScreen({ about }: { about: string }) {
  const c = useColors();
  const state = useAppState();
  const { actions, contracts: all, entriesFor, pendingDeletes, categoryNames, allAddresses, projects, projectId, project, uniqueAddresses } = state;
  const siteReport = useSiteReport();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [addressFilter, setAddressFilter] = useState('All');
  const [status, setStatus] = useState<StatusFilter>('active');
  /** Contract being added (no contract) or edited. */
  const [contractForm, setContractForm] = useState<{ contract?: ContractRow } | null>(null);
  const [openContract, setOpenContract] = useState<string | null>(null);

  const q = search.trim();
  const contracts = useMemo(() => {
    const base = q ? new Fuse(all, { keys: ['contractor', 'work', 'address', 'phone', 'category'], threshold: 0.4 }).search(q).map((r) => r.item) : all;
    return base.filter((x) => (status === 'all' || x.status === status) && (categoryFilter === 'All' || x.category.toLowerCase() === categoryFilter.toLowerCase()) && (addressFilter === 'All' || x.address === addressFilter));
  }, [all, q, status, categoryFilter, addressFilter]);
  const contractors = useMemo(() => {
    const byName = new Map<string, { name: string; phone: string }>();
    for (const x of all) if (!byName.has(x.contractor.toLowerCase())) byName.set(x.contractor.toLowerCase(), { name: x.contractor, phone: x.phone });
    return [...byName.values()];
  }, [all]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.status === 'closed' ? `${p.name} (closed)` : p.name }));
  const sites = [...new Set(all.map((x) => x.address).filter(Boolean))].sort();
  const usedCategories = new Set(all.map((x) => x.category));
  const totals = sumTotals(contracts.map((x) => contractTotals(x, entriesFor(x.id))));

  const saveContract = async (input: Parameters<typeof actions.saveContract>[0]) => {
    const editing = contractForm?.contract;
    const id = await actions.saveContract(input, editing?.id);
    if (input.address) prefs.set('nirmaan_contract_site', input.address);
    if (!editing) setOpenContract(id);
  };

  const hasSites = all.length > 0 || uniqueAddresses.length > 0;
  const menu: MenuItem[] = [{ icon: 'add', label: 'New contract', about: 'A contractor, the job, and the rate or lump sum', onPress: () => setContractForm({}) }, ...(hasSites ? [{ icon: 'assignment' as const, label: 'Site report', about: 'Everything bought and paid for this project', onPress: siteReport.open }] : [])];

  const box = { flex: 1, padding: 8, alignItems: 'center' as const, borderRadius: 8, borderWidth: 1, borderColor: c.gray100, backgroundColor: c.gray50 };
  const header = (
    <View style={{ gap: 12, paddingTop: 12 }}>
      <Text style={{ marginHorizontal: 16, fontSize: 12, lineHeight: 17, color: c.gray600 }}>{about}</Text>
      {contracts.length > 0 && (
        <View accessibilityLabel="Totals for the contracts shown" style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16 }}>
          <View style={box}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>Work done</Text>
            <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: '700', color: c.brandDark }}>{rupees(totals.workDone)}</Text>
          </View>
          <View style={box}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>Paid</Text>
            <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: '700', color: c.brandDark }}>{rupees(totals.paid)}</Text>
          </View>
          <View style={box}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>Balance</Text>
            <BalanceText balance={totals.balance} />
          </View>
        </View>
      )}
      {/* Side by side, or one under the other on a narrow phone, so neither label is cut off. */}
      <View style={{ marginHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" icon="add" onPress={() => setContractForm({})} style={{ flexGrow: 1 }}>
          New contract
        </Button>
        {hasSites && (
          <Button variant="secondary" icon="assignment" onPress={siteReport.open} style={{ flexGrow: 1 }}>
            Site report
          </Button>
        )}
      </View>
      {all.length > 0 && (
        <>
          <FilterChips categories={categoryNames.filter((x) => usedCategories.has(x))} categoryFilter={categoryFilter} onCategory={setCategoryFilter} addresses={sites.length > 1 ? sites : []} addressFilter={addressFilter} onAddress={setAddressFilter} addressLabel="Sites" />
          <View style={{ marginHorizontal: 16 }}>
            <Tabs<StatusFilter> label="Contract status" options={STATUS_TABS} value={status} onChange={setStatus} />
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.brandGray }}>
      <ScreenHeader menu={menu}>
        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: c.brandConcrete, borderRadius: 22, backgroundColor: c.white }}>
          <Icon name="search" size={18} color={c.gray500} />
          <TextInput accessibilityLabel="Search" value={search} onChangeText={setSearch} placeholder="Search contractors…" placeholderTextColor={c.gray500} style={{ flex: 1, fontSize: 14, color: c.brandDark, paddingVertical: 8 }} />
        </View>
      </ScreenHeader>
      <FlashList
        data={contracts}
        keyExtractor={(x) => x.id}
        extraData={pendingDeletes}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon={require('../../assets/tabs/labour.png')} title={all.length ? 'No contracts match.' : 'No labour contracts yet.'}>
            {all.length ? 'Check the filters or search.' : 'Add one to this project with “New contract”: the contractor, the job, and the rate or lump sum.'}
          </EmptyState>
        }
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: 16, marginTop: 12 }}>
            <ContractCard contract={item} totals={contractTotals(item, entriesFor(item.id))} pending={pendingDeletes.has(item.id)} onOpen={() => setOpenContract(item.id)} />
            {pendingDeletes.has(item.id) && (
              <View style={{ position: 'absolute', top: 12, right: 12 }}>
                <UndoButton onUndo={() => actions.undoDelete(item.id)} label={item.contractor} />
              </View>
            )}
          </View>
        )}
      />
      {openContract && <ContractSheet contractId={openContract} onEdit={(contract) => setContractForm({ contract })} onClose={() => setOpenContract(null)} />}
      {contractForm && (
        <ContractForm
          contract={contractForm.contract}
          defaults={{
            address: addressFilter !== 'All' ? addressFilter : project?.address || prefs.get('nirmaan_contract_site', ''),
            category: categoryFilter !== 'All' ? categoryFilter : categoryNames[0] || 'Civil',
            project_id: projectId,
          }}
          projects={projectOptions}
          addresses={allAddresses}
          categories={categoryNames}
          contractors={contractors}
          onSave={saveContract}
          onClose={() => setContractForm(null)}
        />
      )}
    </View>
  );
}

function ContractCard({ contract: x, totals: t, pending, onOpen }: { contract: ContractRow; totals: ContractTotals; pending: boolean; onOpen(): void }) {
  const c = useColors();
  const progress = t.progress === null ? null : Math.min(1, t.progress);
  const strike = pending ? { textDecorationLine: 'line-through' as const } : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open contract with ${x.contractor}`} disabled={pending} onPress={onOpen} style={{ padding: 16, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.brandConcrete, backgroundColor: c.white, opacity: pending ? 0.4 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[{ fontSize: 14, fontWeight: '700', color: c.gray900 }, strike]}>
            {x.contractor}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray600 }}>
            {x.work || 'Work not described'}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray500 }}>
            {[x.address, x.category].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: x.status === 'closed' ? c.gray500 : c.orange700, backgroundColor: x.status === 'closed' ? c.gray100 : c.orange50 }}>
          {x.status === 'closed' ? 'Closed' : x.kind === 'rate' ? `₹${x.rate}/${x.unit || 'unit'}` : 'Lump sum'}
        </Text>
      </View>
      {progress !== null && (
        <View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.gray100, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: c.orange500 }} />
          </View>
          <Text style={{ fontSize: 12, color: c.gray500, marginTop: 2 }}>
            {Math.round((t.progress ?? 0) * 100)}% done
            {x.kind === 'rate' && ` · ${t.doneQty.toLocaleString('en-IN')} of ${x.est_quantity.toLocaleString('en-IN')} ${x.unit}`}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
        <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>
          Work <Text style={{ fontWeight: '700', color: c.gray800 }}>{rupees(t.workDone)}</Text>
        </Text>
        <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>
          Paid <Text style={{ fontWeight: '700', color: c.gray800 }}>{rupees(t.paid)}</Text>
        </Text>
        <BalanceText balance={t.balance} align="right" />
      </View>
    </Pressable>
  );
}

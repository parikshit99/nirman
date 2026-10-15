import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import Fuse from 'fuse.js';
import { useMemo, useState, type ReactElement } from 'react';
import { Text, View } from 'react-native';
import { describeLabourRate, describeLabourRateRow, labourRates, todayISO, type ContractRow, type LabourRate } from '@nirman/shared';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Pressable } from '../components/ui/Pressable';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

/**
 * Rates → Labour: what each trade has been paid per unit, from the rate contracts of every project (ongoing and
 * closed). Never mixed with material prices. Tapping a trade lists its contracts; tapping one opens it in Labour.
 */
export function LabourRates({ query, header }: { query: string; header: ReactElement }) {
  const { snapshot, projects, projectId, pendingDeletes, actions } = useAppState();
  const navigation = useNavigation<{ navigate(name: string, params?: object): void }>();
  const [open, setOpen] = useState<string | null>(null);
  // A contract deleted in Labour (still waiting for Undo) is already gone here.
  const cards = useMemo(() => labourRates(snapshot.contracts.filter((x) => !pendingDeletes.has(x.id)), projects), [snapshot.contracts, projects, pendingDeletes]);
  const shown = useMemo(() => (query ? new Fuse(cards, { keys: ['trade', 'rows.contract.contractor'], threshold: 0.4 }).search(query).map((r) => r.item) : cards), [cards, query]);
  const today = todayISO();
  const openCard = cards.find((x) => x.key === open);

  /** A contract of another project is opened in its project, as Saved → All projects does with a list. */
  const openContract = (contract: ContractRow) => {
    setOpen(null);
    if (contract.project_id !== projectId) actions.openProject(contract.project_id);
    navigation.navigate('Labour', { contract: contract.id });
  };

  return (
    <>
      <FlashList
        data={shown}
        keyExtractor={(x) => x.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          cards.length ? (
            <EmptyState icon={require('../../assets/tabs/rates.png')} title="No trades match.">
              Check the search.
            </EmptyState>
          ) : (
            <EmptyState icon={require('../../assets/tabs/labour.png')} title="No labour rates yet.">
              Add a contract with a rate per unit in Labour, and its rate shows here.
            </EmptyState>
          )
        }
        renderItem={({ item }) => <TradeCard card={item} today={today} onOpen={() => setOpen(item.key)} />}
      />
      {openCard && <TradeSheet card={openCard} today={today} onOpenContract={openContract} onClose={() => setOpen(null)} />}
    </>
  );
}

function TradeCard({ card, today, onOpen }: { card: LabourRate; today: string; onOpen(): void }) {
  const c = useColors();
  const text = describeLabourRate(card, today);
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 12, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${card.trade}: ${text.range}. ${text.last}`}
        onPress={onOpen}
        style={{ padding: 16, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: c.brandConcrete, backgroundColor: c.white }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: c.gray900 }}>{card.trade}</Text>
          <Icon name="chevron-right" size={20} color={c.gray500} />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], color: c.brandDark }}>{text.range}</Text>
        <Text style={{ fontSize: 12, color: c.gray500 }}>{text.last}</Text>
      </Pressable>
    </View>
  );
}

/** Every contract on one card, newest first. */
function TradeSheet({ card, today, onOpenContract, onClose }: { card: LabourRate; today: string; onOpenContract(c: ContractRow): void; onClose(): void }) {
  const c = useColors();
  return (
    <Sheet label={`${card.trade} rates`} onClose={onClose} closeOnBackdrop gap={8}>
      <SheetHeader title={card.trade} subtitle={describeLabourRate(card, today).range} onClose={onClose} />
      <View style={{ borderRadius: 12, backgroundColor: c.gray50, overflow: 'hidden' }}>
        {card.rows.map((row, i) => (
          <Pressable
            key={row.contract.id}
            accessibilityRole="button"
            accessibilityLabel={`Open contract with ${row.contract.contractor}: ${describeLabourRateRow(row, card.unit)}${row.closed ? ', closed' : ''}`}
            onPress={() => onOpenContract(row.contract)}
            style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: c.gray100 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, fontVariant: ['tabular-nums'], color: c.brandDark }}>{describeLabourRateRow(row, card.unit)}</Text>
              {row.closed && <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '700', color: c.gray500, backgroundColor: c.gray100 }}>Closed</Text>}
              <Icon name="chevron-right" size={18} color={c.gray500} />
            </View>
            {row.contract.work.trim() ? (
              <Text numberOfLines={2} style={{ fontSize: 12, color: c.gray500 }}>
                {row.contract.work.trim()}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

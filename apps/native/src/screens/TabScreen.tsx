import { FlatList, type ImageSourcePropType } from 'react-native';
import { EmptyState } from '../components/ui/EmptyState';
import { useColors } from '../theme';

/** A tab's list; empty until the screens are ported (docs/react-native-plan.md, Phases 3–6). */
export function TabScreen({ icon, title, hint }: { icon: ImageSourcePropType; title: string; hint: string }) {
  const c = useColors();
  return (
    <FlatList
      data={[]}
      renderItem={null}
      style={{ backgroundColor: c.brandGray }}
      contentInsetAdjustmentBehavior="automatic"
      ListEmptyComponent={
        <EmptyState icon={icon} title={title}>
          {hint}
        </EmptyState>
      }
    />
  );
}

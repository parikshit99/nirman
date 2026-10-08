import { createNavigationContainerRef } from '@react-navigation/native';

/** For moving between tabs from outside them (e.g. a photo shared from WhatsApp goes to Purchases or BOQ). */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

export type TabName = 'Purchases' | 'BOQ' | 'Labour' | 'Rates' | 'Saved';

export function goToTab(tab: TabName) {
  if (navigationRef.isReady()) navigationRef.navigate('Home', { screen: tab });
}

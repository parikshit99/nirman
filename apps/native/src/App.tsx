import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Snapshot } from '@nirman/core';
import { logError } from '@nirman/core';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogProvider } from './components/ui/Dialogs';
import { startServices } from './data/services';
import { ListScreen } from './features/ListScreen';
import { ProjectsHost } from './features/ProjectsSheet';
import { SavedScreen } from './features/SavedScreen';
import { TabScreen } from './screens/TabScreen';
import { AppStateProvider, type Services } from './state/AppState';
import { dark, light, useColors } from './theme';

const ICONS = {
  Purchases: require('../assets/tabs/purchases.png'),
  BOQ: require('../assets/tabs/boq.png'),
  Labour: require('../assets/tabs/labour.png'),
  Rates: require('../assets/tabs/rates.png'),
  Saved: require('../assets/tabs/saved.png'),
} as const;

const ABOUT = {
  Purchases: 'Photograph bills or type what was bought; get a purchase list with the rate paid for each item.',
  BOQ: 'Photograph a drawing or list; get a blank BOQ (no rates) to send vendors, then compare their quotes.',
  Saved: 'Saved purchase lists and BOQs of this project. Open one to edit it, export it, or add vendor quotes.',
} as const;

/** Tabs whose screens are ported in a later phase show an empty list for now. */
const PLACEHOLDERS = [
  {
    name: 'Labour',
    empty: 'No labour contracts yet.',
    hint: 'Add one to this project with “New contract”: the contractor, the job, and the rate or lump sum.',
  },
  {
    name: 'Rates',
    empty: 'No prices yet',
    hint: 'A price appears here as soon as you add a purchase with a rate, and when you confirm a vendor quote.',
  },
] as const;

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const c = useColors();
  return (
    <Tab.Navigator tabBarActiveTintColor={c.brandPrimary} tabBarInactiveTintColor={c.gray500} tabBarStyle={{ backgroundColor: c.white }}>
      <Tab.Screen name="Purchases" options={{ tabBarIcon: () => ICONS.Purchases }}>
        {() => <ListScreen kind="audit" about={ABOUT.Purchases} />}
      </Tab.Screen>
      <Tab.Screen name="BOQ" options={{ tabBarIcon: () => ICONS.BOQ }}>
        {() => <ListScreen kind="boq" about={ABOUT.BOQ} />}
      </Tab.Screen>
      {PLACEHOLDERS.map((t) => (
        <Tab.Screen key={t.name} name={t.name} options={{ tabBarIcon: () => ICONS[t.name] }}>
          {() => <TabScreen icon={ICONS[t.name]} title={t.empty} hint={t.hint} />}
        </Tab.Screen>
      ))}
      <Tab.Screen name="Saved" options={{ tabBarIcon: () => ICONS.Saved }}>
        {() => <SavedScreen about={ABOUT.Saved} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

/** Opens the database, then shows the app; says so if it can't be opened. */
function Boot() {
  const c = useColors();
  const [ready, setReady] = useState<{ services: Services; initial: Snapshot } | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    startServices().then(setReady, (err: Error) => {
      logError(err, 'startup');
      setFailure(err);
    });
  }, []);
  if (failure) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, backgroundColor: c.brandGray }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.brandDark }}>Could not open the app's storage</Text>
        <Text style={{ fontSize: 14, textAlign: 'center', color: c.gray500 }}>{failure.message}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandGray }}>
        <ActivityIndicator color={c.brandPrimary} />
      </View>
    );
  }
  return (
    <AppStateProvider services={ready.services} initial={ready.initial}>
      <ProjectsHost>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {/* Full screens (Sheet kind="screen") are native dialogs for now; pushed routes can go above the tabs here. */}
          <Stack.Screen name="Home" component={Tabs} />
        </Stack.Navigator>
      </ProjectsHost>
    </AppStateProvider>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? dark : light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme: Theme = {
    ...base,
    colors: { ...base.colors, primary: colors.brandPrimary, background: colors.brandGray, card: colors.white, text: colors.brandDark, border: colors.gray200 },
  };
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <DialogProvider>
          <NavigationContainer theme={theme}>
            <Boot />
          </NavigationContainer>
        </DialogProvider>
      </ErrorBoundary>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

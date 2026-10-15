import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogProvider } from './components/ui/Dialogs';
import { restoreBeforeStart, startApp, type StartResult } from './data/startup';
import { LabourScreen } from './features/LabourScreen';
import { HomeWidgetSync } from './features/HomeWidget';
import { LaunchHost, useDropLaunches } from './features/LaunchHost';
import { ListScreen } from './features/ListScreen';
import { ProjectsHost } from './features/ProjectsSheet';
import { QuotesHost, useQuotes } from './features/QuotesHost';
import { RatesScreen } from './features/RatesScreen';
import { SavedScreen } from './features/SavedScreen';
import { SettingsHost } from './features/SettingsHost';
import { ShareHost } from './features/ShareHost';
import { StartProblem } from './features/StartProblem';
import { SiteReportHost, useSiteReport } from './features/SiteReport';
import { navigationRef } from './navigation';
import { AppStateProvider, useAppState } from './state/AppState';
import { useColors } from './theme';

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
  Labour: 'Labour contracts: record work measured, payments and deductions; see what each contractor is owed and share statements.',
  Saved: 'Saved purchase lists and BOQs of this project. Open one to edit it, export it, or add vendor quotes.',
} as const;

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator();

function BoqScreen() {
  const quotes = useQuotes();
  return <ListScreen kind="boq" about={ABOUT.BOQ} onVendorQuote={() => quotes.pick()} />;
}

function SavedTab() {
  const quotes = useQuotes();
  const siteReport = useSiteReport();
  const { history, contracts } = useAppState();
  const hasPurchases = history.some((h) => h.kind === 'audit') || contracts.length > 0;
  return (
    <SavedScreen
      about={ABOUT.Saved}
      onQuotes={quotes.open}
      onSiteReport={hasPurchases ? siteReport.open : undefined}
    />
  );
}

function Tabs() {
  const c = useColors();
  return (
    <Tab.Navigator
      tabBarActiveTintColor={c.brandPrimary}
      tabBarInactiveTintColor={c.gray500}
      tabBarStyle={{ backgroundColor: c.white }}
      // The pill behind the picked tab: Material's own is lavender whatever the app's colour.
      activeIndicatorColor={c.orange100}
      rippleColor={c.orange100}
    >
      <Tab.Screen name="Purchases" options={{ tabBarIcon: () => ICONS.Purchases }}>
        {() => <ListScreen kind="audit" about={ABOUT.Purchases} />}
      </Tab.Screen>
      <Tab.Screen name="BOQ" options={{ tabBarIcon: () => ICONS.BOQ }}>
        {() => <BoqScreen />}
      </Tab.Screen>
      <Tab.Screen name="Labour" options={{ tabBarIcon: () => ICONS.Labour }}>
        {() => <LabourScreen about={ABOUT.Labour} />}
      </Tab.Screen>
      <Tab.Screen name="Rates" options={{ tabBarIcon: () => ICONS.Rates }}>
        {() => <RatesScreen />}
      </Tab.Screen>
      <Tab.Screen name="Saved" options={{ tabBarIcon: () => ICONS.Saved }}>
        {() => <SavedTab />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

/** Opens the data (on the first launch after 6.x: finds, copies and checks it first), then shows the app; if it can't, says so and offers Restore from backup. */
function Boot() {
  const c = useColors();
  const [result, setResult] = useState<StartResult | null>(null);
  const start = (opts?: Parameters<typeof startApp>[0]) => {
    setResult(null);
    void startApp(opts).then(setResult);
  };
  useEffect(() => start(), []);
  // The launch screen (index.ts) stays until the data is open or has a problem to show: no blank or spinner screen between.
  useEffect(() => {
    if (result) void SplashScreen.hideAsync();
  }, [result]);
  // A shortcut used while the start-up problem shows only brings the app to the front.
  useDropLaunches(result?.ok === false);
  if (!result) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandGray }}>
        <ActivityIndicator color={c.brandPrimary} />
      </View>
    );
  }
  if (!result.ok) {
    return (
      <StartProblem
        problem={result.problem}
        onContinue={start}
        onRestore={async (file) => {
          await restoreBeforeStart(file);
          start({ withoutCopy: true, allowEmpty: true });
        }}
      />
    );
  }
  return (
    <AppStateProvider services={result.services} initial={result.initial}>
      <HomeWidgetSync />
      <ProjectsHost>
        <QuotesHost>
          <SiteReportHost>
            <SettingsHost>
              <ShareHost>
                <LaunchHost>
                  <Stack.Navigator screenOptions={{ headerShown: false }}>
                    {/* Full screens (Sheet kind="screen") are native dialogs for now; pushed routes can go above the tabs here. */}
                    <Stack.Screen name="Home" component={Tabs} />
                  </Stack.Navigator>
                </LaunchHost>
              </ShareHost>
            </SettingsHost>
          </SiteReportHost>
        </QuotesHost>
      </ProjectsHost>
    </AppStateProvider>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const colors = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme: Theme = {
    ...base,
    colors: { ...base.colors, primary: colors.brandPrimary, background: colors.brandGray, card: colors.white, text: colors.brandDark, border: colors.gray200 },
  };
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <DialogProvider>
            <NavigationContainer ref={navigationRef} theme={theme}>
              <Boot />
            </NavigationContainer>
          </DialogProvider>
        </ErrorBoundary>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

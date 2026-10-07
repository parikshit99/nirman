import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { DarkTheme, DefaultTheme, NavigationContainer, getFocusedRouteNameFromRoute, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabScreen } from './screens/TabScreen';
import { dark, light } from './theme';

const TABS = [
  {
    name: 'Purchases',
    icon: require('../assets/tabs/purchases.png'),
    empty: 'No purchases yet.',
    hint: 'Photograph bills or type what was bought; each item appears here with the rate paid.',
  },
  { name: 'BOQ', icon: require('../assets/tabs/boq.png'), empty: 'No BOQ items yet.', hint: 'Photograph a drawing or list to get a BOQ to send vendors.' },
  {
    name: 'Labour',
    icon: require('../assets/tabs/labour.png'),
    empty: 'No labour contracts yet.',
    hint: 'Add one to this project with “New contract”: the contractor, the job, and the rate or lump sum.',
  },
  {
    name: 'Rates',
    icon: require('../assets/tabs/rates.png'),
    empty: 'No prices yet',
    hint: 'A price appears here as soon as you add a purchase with a rate, and when you confirm a vendor quote.',
  },
  { name: 'Saved', icon: require('../assets/tabs/saved.png'), empty: 'Nothing saved yet.', hint: 'Lists you save in this project from Purchases or BOQ (the Save button) appear here.' },
] as const;

const Tab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const colors = useColorScheme() === 'dark' ? dark : light;
  return (
    <Tab.Navigator tabBarActiveTintColor={colors.brandPrimary} tabBarInactiveTintColor={colors.gray500} tabBarStyle={{ backgroundColor: colors.white }}>
      {TABS.map((t) => (
        <Tab.Screen key={t.name} name={t.name} options={{ tabBarIcon: () => t.icon }}>
          {() => <TabScreen icon={t.icon} title={t.empty} hint={t.hint} />}
        </Tab.Screen>
      ))}
    </Tab.Navigator>
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
      <NavigationContainer theme={theme}>
        <Stack.Navigator>
          {/* Full screens (Sheet kind="screen") will be pushed on this stack, above the tabs. */}
          <Stack.Screen name="Home" component={Tabs} options={({ route }) => ({ title: getFocusedRouteNameFromRoute(route) ?? TABS[0].name })} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

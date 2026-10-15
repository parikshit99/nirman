import { useEffect, useMemo, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { logError } from '@nirman/core';
import { istDay, todaySpend } from '@nirman/shared';
import Nirman from '../../modules/nirman-native';
import { useAppState } from '../state/AppState';

/**
 * Keeps the home screen widget "Today's spend" up to date. The widget never runs JS, so this sends it the open
 * project's figures (`todaySpend`) whenever they change: data, the open project, or a new day when the app comes back.
 */
export function HomeWidgetSync() {
  const { snapshot, project, projectId, pendingDeletes } = useAppState();
  const [day, setDay] = useState(() => istDay());
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') setDay(istDay());
    });
    return () => sub.remove();
  }, []);

  // `day` only makes it work out again when the app is opened on a new day.
  const { spent, bills, day: figuresDay } = useMemo(() => todaySpend(snapshot.lists, snapshot.items, projectId, { pending: pendingDeletes }), [snapshot, projectId, pendingDeletes, day]);
  const name = project?.name;

  useEffect(() => {
    if (!name) return;
    try {
      Nirman.setWidget({ project: name, day: figuresDay, spent, bills });
    } catch (err) {
      logError(err, 'setWidget');
    }
  }, [name, figuresDay, spent, bills]);

  return null;
}

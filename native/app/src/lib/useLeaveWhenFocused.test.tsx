// `useLeaveWhenFocused` in a real navigator (Type C): a mocked stack cannot
// show which screen a late `backTo` hits (#2757).
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, View } from 'react-native';
import type { RootStackParamList, ScreenProps } from '../navigation';
import { backTo } from './backTo';
import { useLeaveWhenFocused } from './useLeaveWhenFocused';

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();

let answer: () => void = () => {};

/** A form that saves, waits for the answer, then goes back to its room. */
function FormStub({ navigation }: ScreenProps<'AccountSettings'>) {
  const leave = useLeaveWhenFocused(navigation);
  const save = async () => {
    await new Promise<void>((resolve) => {
      answer = resolve;
    });
    leave(() => backTo(navigation, 'NotificationsAndTheme'));
  };
  return <Pressable testID="form-save" onPress={() => void save()} />;
}

const RoomStub = () => <View testID="room" />;
const OnTopStub = () => <View testID="on-top" />;

const top = () => ref.getRootState()?.routes.at(-1)?.name;

async function openForm() {
  await render(
    <NavigationContainer ref={ref}>
      <Stack.Navigator>
        <Stack.Screen name="NotificationsAndTheme" component={RoomStub} />
        <Stack.Screen name="AccountSettings" component={FormStub} />
        <Stack.Screen name="Inbox" component={OnTopStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
  await act(async () => {
    ref.navigate('AccountSettings');
  });
}

describe('useLeaveWhenFocused', () => {
  it('goes back at once when the form is in front', async () => {
    await openForm();
    await fireEvent.press(screen.getByTestId('form-save'));
    await act(async () => answer());
    expect(top()).toBe('NotificationsAndTheme');
  });

  it('leaves a screen opened on top alone, and goes back when the form is in front again', async () => {
    await openForm();
    await fireEvent.press(screen.getByTestId('form-save'));
    // A push notification opens another screen while the answer is on its way.
    await act(async () => {
      ref.navigate('Inbox');
    });
    await act(async () => answer());
    expect(top()).toBe('Inbox');

    await act(async () => {
      ref.goBack();
    });
    expect(top()).toBe('NotificationsAndTheme');
  });

  it('does nothing when the form was closed before the answer came', async () => {
    await openForm();
    await fireEvent.press(screen.getByTestId('form-save'));
    await act(async () => {
      ref.goBack();
    });
    await act(async () => answer());
    expect(top()).toBe('NotificationsAndTheme');
    expect(ref.getRootState()?.routes).toHaveLength(1);
  });
});

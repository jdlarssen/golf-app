// #2840: `expo-haptics` i jest. Den native modulen finnes ikke i testmiljøet, så
// hele suiten får denne i stedet (en `__mocks__`-mappe ved siden av `node_modules`
// gjelder automatisk). Testene kan lese `impactAsync`-kallene.
export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
  Soft = 'soft',
  Rigid = 'rigid',
}

export const impactAsync = jest.fn(async (_style?: ImpactFeedbackStyle) => {});
export const selectionAsync = jest.fn(async () => {});
export const notificationAsync = jest.fn(async () => {});

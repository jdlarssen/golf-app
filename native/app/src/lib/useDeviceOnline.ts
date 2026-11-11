// #2348: er telefonen på nett, slik telefonen selv melder det?
//
// Samme lesing som drain-triggerne (`isConnected` fra expo-network, ukjent =
// tilkoblet), så lagringsbrikka og køen er enige om hva «uten nett» er.
// Startverdien er siste kjente status; endringer kommer fra
// `addConnectivityListener`.
import { useEffect, useState } from 'react';
import { addConnectivityListener, isDeviceOnline } from '../data/syncTriggers';

export function useDeviceOnline(): boolean {
  const [online, setOnline] = useState(isDeviceOnline);
  useEffect(() => addConnectivityListener(setOnline), []);
  return online;
}

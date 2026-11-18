import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { handleBackAction } from '../utils/backNavigation';

export function GlobalBackButtonListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Attach Capacitor hardware back button listener on native platforms
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle = null;
    let isSubscribed = true;

    const setupListener = async () => {
      try {
        const handle = await App.addListener('backButton', () => {
          handleBackAction(navigate, location.pathname);
        });
        if (isSubscribed) {
          listenerHandle = handle;
        } else {
          handle.remove();
        }
      } catch (err) {
        console.warn('Capacitor backButton listener init failed:', err);
      }
    };

    setupListener();

    return () => {
      isSubscribed = false;
      if (listenerHandle?.remove) {
        listenerHandle.remove();
      }
    };
  }, [navigate, location.pathname]);

  return null;
}

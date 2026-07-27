// Push de verdade (notificação na tela do celular). Pega o Expo Push Token do aparelho
// e manda pro backend (/api/garantia-app/cliente/push-token) — o worker garantiaPush
// dispara os lembretes de revisão por aqui.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

// Como a notificação aparece com o app ABERTO.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Pede permissão, pega o token do Expo e registra no backend. Chamar depois do login
// do CLIENTE. Silencioso: se algo falhar (simulador, permissão negada), não quebra o app.
export async function registrarPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // push não funciona em simulador
    const atual = await Notifications.getPermissionsAsync();
    let status = atual.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'GP Premium',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const tokenResp = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenResp.data;
    if (pushToken) await api('/api/garantia-app/cliente/push-token', { method: 'POST', body: { pushToken } });
  } catch (e) {
    // não atrapalha o uso do app se o push falhar
    console.warn('[push] não registrou:', (e as any)?.message);
  }
}

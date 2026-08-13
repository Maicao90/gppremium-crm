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

// Garante permissão de notificação (pra local E push).
async function garantirPermissao(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.status === 'granted') return true;
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
}

// Mostra notificações LOCAIS na tela do celular (funciona no Expo Go, diferente do push
// remoto). Usado pra o cliente ver os avisos pendentes aparecerem quando abre o app.
export async function mostrarLocais(notifs: { id: string; mensagem: string; lidaNoApp?: boolean }[]): Promise<void> {
  try {
    if (!(await garantirPermissao())) return;
    for (const n of notifs.filter((x) => !x.lidaNoApp)) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'GP Premium 🛞', body: n.mensagem, data: { id: n.id } },
        trigger: null, // imediata
      });
    }
  } catch (e) {
    console.warn('[push] notificação local falhou:', (e as any)?.message);
  }
}

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

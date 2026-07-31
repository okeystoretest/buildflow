/* Service Worker do Build.Flow — Web Push (notificações a nível de SO).
 *
 * Este arquivo roda FORA da página, num contexto próprio do navegador. Por isso
 * ele recebe eventos de push mesmo com o navegador minimizado ou sem a aba em
 * foco, e entrega a notificação direto na Central de Ações do SO.
 *
 * Servido de /sw.js (raiz do site) para ter escopo global ("/").
 */

// Ativa o SW imediatamente, sem esperar recarregar todas as abas.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Chega um push do servidor: monta e exibe a notificação do SO.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Build.Flow", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Build.Flow";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/favicon-32.png",
    // `tag` deduplica: um novo push do mesmo pedido substitui o anterior.
    tag: data.tag || "buildflow",
    renotify: true,
    // Vibra no mobile (parte do "alerta sonoro/visual" pedido).
    vibrate: [200, 100, 200],
    // Guardamos a URL de destino para abrir no clique.
    data: { url: data.url || "/financeiro" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação: foca uma aba existente do app ou abre uma nova,
// navegando até a URL de destino (por padrão, /financeiro).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/financeiro";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Se já houver uma janela do app aberta, foca e navega nela.
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                client.navigate(targetUrl);
              } catch (e) {
                /* alguns navegadores restringem navigate; ignora */
              }
            }
            return;
          }
        }
        // Nenhuma janela aberta: abre uma nova.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});

import * as webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log(`PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}\nPUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(
  "Keep the private key secret. Set PUSH_ENABLED=true and PUSH_VAPID_SUBJECT=mailto:your-email@example.com. Use the same keys in the dashboard and worker; preserve them across rebuilds.",
);

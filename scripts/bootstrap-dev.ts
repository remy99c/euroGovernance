import http from 'http';
import { seedEmulatorData } from './seed-emulator.js';

function checkEmulatorRunning(port = 8080): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('🔍 Checking if Firebase Firestore Emulator is running on 127.0.0.1:8080...');
  const isRunning = await checkEmulatorRunning(8080);

  if (!isRunning) {
    console.error('❌ Firestore Emulator is not reachable at 127.0.0.1:8080.');
    console.error('👉 Please start the emulator first using: npm run emulators:start');
    process.exit(1);
  }

  console.log('✅ Firestore Emulator is active! Starting data bootstrap...');
  try {
    await seedEmulatorData();
    console.log('🎉 Development environment bootstrapped successfully!');
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

main();

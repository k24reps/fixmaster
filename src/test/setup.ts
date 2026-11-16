import '@testing-library/jest-dom/vitest';
import { loadLanguage } from '@/i18n/registry';

// Kamus Inggris dimuat lazy di aplikasi; di tes dimuat di muka supaya
// setLanguage('en') tetap sinkron seperti sebelumnya.
await loadLanguage('en');

import './style.css';
import { loadAssets } from './core/assets';
import { onBoot } from './meta/state';
import { App } from './ui/app';

async function boot() {
  await loadAssets();
  onBoot();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const app = new App(canvas);
  (window as unknown as { app: App }).app = app;
}
void boot();

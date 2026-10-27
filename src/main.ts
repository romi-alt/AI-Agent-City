import './style.css';
import { App } from './ui/app';

document.documentElement.dataset.theme = 'light';
(window as unknown as { app: App }).app = new App(document.querySelector('#app')!);
